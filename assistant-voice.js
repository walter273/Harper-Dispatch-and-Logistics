'use strict';

// Conversational AI voice for signed-in staff, layered on the existing Twilio
// browser-calling path rather than replacing it.
//
// A call is a sequence of turns. Each turn is: press to talk, the browser
// records audio, the browser sends the raw webm/opus bytes, this module
// transcribes them, the transcript plus the recent turn history is sent to the
// chat model, and the reply is synthesized and returned as audio the browser
// plays back. Nothing is spoken until the model has answered.
//
// Every limit here is a cost and safety control, not a formality:
//   - staff only, enforced by the caller in server.js before we are reached
//   - a per-conversation turn history capped and persisted like other records
//   - hard caps on recording size, transcript length and reply length
//   - a daily turn budget per company so a stuck loop cannot run up a bill
//   - transcripts are not retained after synthesis; only turn counts persist
const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
const DEFAULT_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_CHAT_MODEL = 'gpt-5.2';
const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_TTS_VOICE = 'alloy';
const TRANSCRIBE_MODEL = 'whisper-1';

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;   // one utterance, ~1 minute of opus
const MAX_TRANSCRIPT_CHARS = 2000;
const MAX_REPLY_CHARS = 1200;
const MAX_TURNS_KEPT = 8;                   // sent to the model as context
const MAX_CONVERSATIONS_KEPT = 50;
const DAILY_TURN_BUDGET = 300;              // per company, resets on date change
const MAX_CONVERSATION_MS = 20 * 60 * 1000;

const fail = (code, message) => Object.assign(new Error(message), { statusCode: code });

function createAssistantVoice({ getStore, persist, env = process.env, fetchImpl = fetch } = {}) {
  const apiKey = String(env.OPENAI_API_KEY || '').trim();
  const chatUrl = String(env.OPENAI_CHAT_URL || env.OPENAI_BASE_URL || DEFAULT_CHAT_URL).trim();
  const chatModel = String(env.OPENAI_CHAT_MODEL || env.OPENAI_MODEL || DEFAULT_CHAT_MODEL).trim();
  const ttsModel = String(env.OPENAI_TTS_MODEL || DEFAULT_TTS_MODEL).trim();
  const ttsVoice = String(env.OPENAI_TTS_VOICE || DEFAULT_TTS_VOICE).trim();
  const configured = () => Boolean(apiKey);

  const rows = () => {
    getStore().assistantVoice = getStore().assistantVoice || {};
    const store = getStore().assistantVoice;
    store.conversations = store.conversations || [];
    store.budgets = store.budgets || [];
    return store;
  };
  const conversations = () => rows().conversations;
  const budgets = () => rows().budgets;
  const today = () => new Date().toISOString().slice(0, 10);

  // One budget row per company per day. Rolls over lazily on the next call
  // after midnight, so no scheduler is needed.
  function budgetFor(companyId) {
    const all = budgets();
    let row = all.find(entry => entry.companyId === companyId);
    if (!row) {
      row = { companyId, day: today(), used: 0 };
      all.push(row);
    } else if (row.day !== today()) {
      row.day = today();
      row.used = 0;
    }
    return row;
  }

  // Reserve before any audio is sent upstream, so a refused turn costs nothing.
  function reserveTurn(actor, turns) {
    const budget = budgetFor(actor.companyId || 'unscoped');
    if (budget.used + turns > DAILY_TURN_BUDGET) {
      throw fail(429, 'The daily assistant voice allowance has been used. Try again tomorrow.');
    }
    budget.used += turns;
    return budget;
  }

  async function transcribe(audio) {
    const body = Buffer.from(audio || '');
    if (!body.length) throw fail(400, 'No audio was received.');
    if (body.length > MAX_AUDIO_BYTES) throw fail(413, 'That recording is too long. Keep each turn under a minute.');
    const form = new FormData();
    form.append('file', new Blob([body], { type: 'audio/webm' }), 'turn.webm');
    form.append('model', TRANSCRIBE_MODEL);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetchImpl(OPENAI_TRANSCRIBE_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: { authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (!response.ok) throw fail(502, 'The assistant could not hear that. Try again.');
      const payload = await response.json();
      const text = String(payload?.text || '').trim().slice(0, MAX_TRANSCRIPT_CHARS);
      if (!text) throw fail(422, 'Nothing was recognized in that recording.');
      return text;
    } catch (error) {
      if (error.statusCode) throw error;
      throw fail(502, 'The assistant could not hear that. Try again.', { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  async function reply(conversationId, actor, transcript) {
    const history = conversations().find(entry => entry.id === conversationId && entry.companyId === (actor.companyId || 'unscoped'));
    const messages = [
      {
        role: 'system',
        content:
          'You are the Harper Dispatch and Logistics assistant, speaking with a signed-in staff member by voice. '
          + 'Keep replies short and speakable: one to three short sentences, no markdown, no lists, no URLs. '
          + 'You help with Harper operations: loads, dispatch, carriers, planning, billing support and contacting Harper. '
          + 'Never invent current plans, prices, availability or policies. If asked for something operational you cannot see, '
          + 'say you do not have live access to it and point them to the relevant page. '
          + 'Never state a price or commitment as final; the dispatcher confirms it. '
          + 'Do not read out or request passwords, payment details, or private document contents.',
      },
      ...(history?.turns || []).slice(-MAX_TURNS_KEPT).map(turn => ({ role: turn.role, content: turn.content })),
      { role: 'user', content: transcript },
    ];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetchImpl(chatUrl, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: chatModel, messages }),
      });
      if (!response.ok) throw fail(502, 'The assistant is temporarily unavailable.');
      const payload = await response.json();
      const text = String(payload?.choices?.[0]?.message?.content || '').trim().slice(0, MAX_REPLY_CHARS);
      if (!text) throw fail(502, 'The assistant returned an empty reply.');
      return text;
    } catch (error) {
      if (error.statusCode) throw error;
      throw fail(502, 'The assistant is temporarily unavailable.', { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  async function speak(text) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetchImpl(OPENAI_SPEECH_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: ttsModel, voice: ttsVoice, input: text, response_format: 'mp3' }),
      });
      if (!response.ok) throw fail(502, 'The assistant could not speak that reply.');
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (error.statusCode) throw error;
      throw fail(502, 'The assistant could not speak that reply.', { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  // Open a conversation. The id is server-generated and always bound to the
  // caller's company, so a client cannot continue someone else's thread.
  function open(actor) {
    const companyId = actor.companyId || 'unscoped';
    const all = conversations();
    const entry = {
      id: `av-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      companyId,
      userId: actor.id,
      openedAt: Date.now(),
      lastTurnAt: Date.now(),
      turns: [],
    };
    all.push(entry);
    if (all.length > MAX_CONVERSATIONS_KEPT) all.splice(0, all.length - MAX_CONVERSATIONS_KEPT);
    persist();
    const budget = budgetFor(companyId);
    return { conversationId: entry.id, budget: { used: budget.used, limit: DAILY_TURN_BUDGET, day: budget.day } };
  }

  // One spoken turn. Returns the synthesized reply as audio so the browser can
  // play it immediately; the transcript is returned for the on-screen log.
  async function turn(actor, input) {
    if (!configured()) throw fail(503, 'The assistant voice is not configured yet.');
    const conversationId = String(input?.conversationId || '').trim();
    const entry = conversations().find(item => item.id === conversationId && item.companyId === (actor.companyId || 'unscoped'));
    if (!entry) throw fail(404, 'That assistant conversation is no longer available. Start a new one.');
    if (Date.now() - entry.openedAt > MAX_CONVERSATION_MS) {
      entry.closed = true;
      persist();
      throw fail(410, 'That assistant conversation expired. Start a new one.');
    }
    const bytes = Buffer.from(input?.audioBase64 || '', 'base64');
    reserveTurn(actor, 1);
    const transcript = await transcribe(bytes);
    const answer = await reply(entry.id, actor, transcript);
    // Keep the thread for model context only. Audio and the long transcript are
    // not retained, so the store never accumulates conversation content.
    entry.turns.push({ role: 'user', content: transcript.slice(0, 500) }, { role: 'assistant', content: answer });
    if (entry.turns.length > MAX_TURNS_KEPT * 2) entry.turns.splice(0, entry.turns.length - MAX_TURNS_KEPT * 2);
    entry.lastTurnAt = Date.now();
    persist();
    const audio = await speak(answer);
    return {
      transcript,
      reply: answer,
      audio: audio.toString('base64'),
      contentType: 'audio/mpeg',
      budget: { used: budgetFor(entry.companyId).used, limit: DAILY_TURN_BUDGET, day: today() },
    };
  }

  function close(actor, conversationId) {
    const entry = conversations().find(item => item.id === String(conversationId || '') && item.companyId === (actor.companyId || 'unscoped'));
    if (entry) {
      entry.turns = [];
      entry.closed = true;
      persist();
    }
    return { closed: Boolean(entry) };
  }

  function state(actor) {
    const companyId = actor?.companyId || 'unscoped';
    const budget = budgetFor(companyId);
    return {
      configured: configured(),
      budget: { used: budget.used, limit: DAILY_TURN_BUDGET, day: budget.day },
      limits: { maxAudioBytes: MAX_AUDIO_BYTES, maxTranscriptChars: MAX_TRANSCRIPT_CHARS, maxReplyChars: MAX_REPLY_CHARS },
    };
  }

  return { configured, state, open, turn, close };
}

module.exports = { createAssistantVoice, DAILY_TURN_BUDGET, MAX_TURNS_KEPT };
