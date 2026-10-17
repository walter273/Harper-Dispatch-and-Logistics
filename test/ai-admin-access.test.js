const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { start } = require('../test-support/server');
const { seed } = require('../test-support/review-fixture');
const routes = [
  ['/api/assistant', 'POST'],
  ['/api/assistant-voice/state', 'GET'],
  ['/api/assistant-voice/open', 'POST'],
  ['/api/assistant-voice/turn', 'POST'],
  ['/api/assistant-voice/close', 'POST'],
  ['/api/intakes/legacy-carrier/assistant-draft', 'POST'],
];
test('all assistant routes require an active admin session; drafts are private', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harper-ai-admin-'));
  const file = path.join(dir, 'store.json');
  const { tokens } = seed(file, 0);
  const app = await start({ HARPER_DATA_FILE: file, HARPER_ACCOUNT_AUTH: 'true', OPENAI_API_KEY: '' });
  t.after(async () => { await app.stop(); fs.rmSync(dir, { recursive: true, force: true }); });
  const request = (url, role, method = 'GET', body = {}) => fetch(app.url + url, {
    method, headers: { 'content-type': 'application/json', ...(role ? { cookie: `harper_account=${tokens['user-' + role]}` } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
  for (const role of [null, 'suspended', 'dispatcher', 'carrier-owner', 'driver', 'broker', 'shipper']) {
    for (const [url, method] of routes) {
      assert.equal((await request(url, role, method)).status, !role || role === 'suspended' ? 401 : 403, `${role}: ${url}`);
    }
  }
  assert.equal((await request('/api/assistant', 'admin', 'POST', { question: 'Help with loads' })).status, 503, 'admin reaches provider configuration check');
  assert.equal((await request('/api/assistant-voice/state', 'admin')).status, 200);
  const open = await request('/api/assistant-voice/open', 'admin', 'POST');
  assert.equal(open.status, 200);
  const { conversationId } = await open.json();
  assert.equal((await request('/api/assistant-voice/turn', 'admin', 'POST', { conversationId, audioBase64: 'YXVkaW8=' })).status, 503);
  assert.equal((await request('/api/assistant-voice/close', 'admin', 'POST', { conversationId })).status, 200);
  const detail = await (await request('/api/intakes/legacy-carrier', 'admin')).json();
  const draft = await request('/api/intakes/legacy-carrier/assistant-draft', 'admin', 'POST', { version: detail.review.version });
  assert.equal(draft.status, 200);
  assert.ok((await draft.json()).review.assistantDraft);
  for (const suffix of ['', '/export']) {
    const response = await request('/api/intakes/legacy-carrier' + suffix, 'dispatcher');
    assert.equal(response.status, 200, 'normal review access remains available');
    assert.equal((await response.json()).review.assistantDraft, undefined);
  }
});
test('disabled account authentication never grants assistant access', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harper-ai-noauth-'));
  const app = await start({ HARPER_DATA_FILE: path.join(dir, 'store.json'), HARPER_ACCOUNT_AUTH: 'false' });
  t.after(async () => { await app.stop(); fs.rmSync(dir, { recursive: true, force: true }); });
  for (const [url, method] of routes) assert.equal((await fetch(app.url + url, { method, headers: { 'content-type': 'application/json' }, ...(method === 'POST' ? { body: '{}' } : {}) })).status, 401);
});
