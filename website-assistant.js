'use strict';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4.1-mini';

function createWebsiteAssistant({ env = process.env, fetchImpl = fetch } = {}) {
  const key = String(env.OPENAI_API_KEY || '').trim();
  const baseUrl = String(env.OPENAI_BASE_URL || DEFAULT_BASE_URL).trim();
  const model = String(env.OPENAI_MODEL || DEFAULT_MODEL).trim();

  async function ask(question) {
    const prompt = String(question || '').trim();
    if (!prompt || prompt.length > 1000) {
      throw Object.assign(new Error('Enter a question under 1,000 characters.'), { statusCode: 400 });
    }
    if (!key) throw Object.assign(new Error('The website AI assistant is not configured yet.'), { statusCode: 503 });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetchImpl(baseUrl, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 300,
          messages: [
            {
              role: 'system',
              content: 'You are Harper Dispatch and Logistics\' website assistant. Answer briefly and only about Harper services, carrier onboarding, loads, dispatch, planning, pricing, billing support, and contacting Harper. Never invent current plans, prices, availability, policies, or operational facts. When uncertain, direct the visitor to the relevant Harper page or human support. Do not request passwords, payment details, or private documents. Do not claim to book freight, change an account, or make a decision.',
            },
            { role: 'user', content: prompt },
          ],
        }),
      });
      if (!response.ok) throw Object.assign(new Error('The website AI assistant is temporarily unavailable.'), { statusCode: 502 });
      const payload = await response.json();
      const text = String(payload?.choices?.[0]?.message?.content || '').trim();
      if (!text) throw Object.assign(new Error('The website AI assistant returned an empty response.'), { statusCode: 502 });
      return text.slice(0, 4000);
    } catch (error) {
      if (error.statusCode) throw error;
      throw Object.assign(new Error('The website AI assistant is temporarily unavailable.'), { statusCode: 502, cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }

  return { configured: () => Boolean(key), ask };
}

module.exports = { createWebsiteAssistant };
