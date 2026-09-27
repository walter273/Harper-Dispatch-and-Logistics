'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWebsiteAssistant } = require('../website-assistant');

test('website assistant fails closed without a private API key', async () => {
  const assistant = createWebsiteAssistant({ env: {} });
  assert.equal(assistant.configured(), false);
  await assert.rejects(assistant.ask('How do I onboard?'), { statusCode: 503 });
});

test('website assistant validates input and keeps the API key server-side', async () => {
  let request;
  const assistant = createWebsiteAssistant({
    env: { OPENAI_API_KEY: 'private-key', OPENAI_MODEL: 'test-model' },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'Start with carrier onboarding.' } }] }) };
    },
  });
  await assert.rejects(assistant.ask('x'.repeat(1001)), { statusCode: 400 });
  assert.equal(await assistant.ask('How do I onboard?'), 'Start with carrier onboarding.');
  assert.equal(request.options.headers.authorization, 'Bearer private-key');
  assert.equal(JSON.parse(request.options.body).model, 'test-model');
});

test('website assistant does not expose provider errors', async () => {
  const assistant = createWebsiteAssistant({
    env: { OPENAI_API_KEY: 'private-key' },
    fetchImpl: async () => { throw new Error('private provider response'); },
  });
  await assert.rejects(assistant.ask('hello'), { statusCode: 502 });
});
