(() => {
  // Staff-only conversational assistant voice. Press and hold the button to
  // record, release to send; the reply is spoken back and shown in the log.
  // Every request is same-origin and authenticated by the server, which
  // re-checks the role. Nothing here holds a provider key.
  const form = document.getElementById('assistantVoiceForm');
  if (!form) return;
  const talk = document.getElementById('assistantVoiceTalk');
  const stop = document.getElementById('assistantVoiceStop');
  const log = document.getElementById('assistantVoiceLog');
  const status = document.getElementById('assistantVoiceStatus');
  const budget = document.getElementById('assistantVoiceBudget');
  const begin = document.getElementById('assistantVoiceBegin');

  let conversationId = null, recorder = null, chunks = [], busy = false, ready = false, audio = null;

  function say(role, text) {
    const p = document.createElement('p');
    p.className = `assistant-voice-line assistant-voice-${role}`;
    p.textContent = `${role === 'you' ? 'You' : 'Harper'}: ${text}`;
    log.append(p);
    log.scrollTop = log.scrollHeight;
  }
  function note(text) { status.textContent = text; }

  async function call(url, body) {
    const response = await fetch(url, body === undefined
      ? { cache: 'no-store' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The assistant is unavailable.');
    return data;
  }

  function play(base64) {
    if (audio) { audio.pause(); }
    audio = new Audio(`data:audio/mpeg;base64,${base64}`);
    audio.play().catch(() => note('Reply received, but this browser blocked playback.'));
  }

  async function refresh() {
    try {
      const data = await call('/api/assistant-voice/state');
      ready = Boolean(data.configured);
      const used = data.budget?.used ?? 0, limit = data.budget?.limit ?? 0;
      budget.textContent = ready ? `Ready. ${limit - used} of ${limit} turns left today.` : 'Assistant voice is not configured yet.';
      if (begin) begin.disabled = !ready;
      if (!ready) talk.disabled = true;
    } catch (error) {
      ready = false;
      budget.textContent = error.message;
      talk.disabled = true;
      if (begin) begin.disabled = true;
    }
  }

  async function startConversation() {
    if (busy) return;
    busy = true;
    if (begin) begin.disabled = true;
    try {
      note('Starting a conversation…');
      const data = await call('/api/assistant-voice/open', {});
      conversationId = data.conversationId;
      log.replaceChildren();
      say('harper', 'Ask me anything about Harper operations.');
      note('Listening is ready. Hold the button and speak.');
      talk.disabled = false;
    } catch (error) {
      note(error.message);
      await refresh();
    } finally {
      busy = false;
    }
  }

  async function startRecording() {
    if (busy || !conversationId) { note('Start a conversation first.'); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      note('This browser cannot record audio.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.start();
      talk.classList.add('is-recording');
      stop.disabled = false;
      note('Recording… release when you are done.');
    } catch {
      note('Microphone access was refused.');
    }
  }

  async function sendRecording() {
    if (!recorder) return;
    talk.classList.remove('is-recording');
    stop.disabled = true;
    busy = true;
    const done = new Promise(resolve => { recorder.onstop = resolve; });
    if (recorder.state !== 'inactive') recorder.stop();
    await done;
    for (const track of recorder.stream.getTracks()) track.stop();
    const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
    recorder = null;
    if (!blob.size) { note('Nothing was recorded.'); busy = false; return; }
    try {
      note('Transcribing…');
      const base64 = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.readAsDataURL(blob);
      });
      const result = await call('/api/assistant-voice/turn', { conversationId, audioBase64: base64 });
      say('you', result.transcript);
      say('harper', result.reply);
      play(result.audio);
      const left = (result.budget?.limit ?? 0) - (result.budget?.used ?? 0);
      budget.textContent = `Ready. ${left} turns left today.`;
      note('Listening is ready.');
    } catch (error) {
      note(error.message);
    } finally {
      busy = false;
    }
  }

  form.addEventListener('submit', event => { event.preventDefault(); startRecording(); });
  stop.addEventListener('click', sendRecording);
  if (begin) begin.addEventListener('click', startConversation);
  window.addEventListener('harper:account-changed', () => {
    conversationId = null; busy = false;
    log.replaceChildren(); note(''); refresh();
  });
  window.addEventListener('pagehide', () => { if (recorder && recorder.state !== 'inactive') recorder.stop(); });
  refresh();
})();
