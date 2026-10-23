const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const listeners = {}, nodes = {};
  const node = () => ({ hidden: true, dataset: {}, value: '', children: [], addEventListener(type, cb) { this[type] = cb; }, setAttribute() {}, focus() {}, appendChild(child) { this.children.push(child); }, replaceChildren() { this.children = []; }, querySelector() { return {}; } });
  for (const id of ['harper-assistant-stylesheet','harper-assistant-launcher','harper-assistant-panel','harper-assistant-form','harper-assistant-input','harper-assistant-messages','close']) nodes[id] = node();
  let resolve;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'harper-assistant.js'), 'utf8'), {
    document: { head: { querySelector: () => null }, getElementById: id => nodes[id], querySelector: () => nodes.close, createElement: node, addEventListener() {} },
    window: { addEventListener: (type, cb) => listeners[type] = cb },
    fetch: () => new Promise(r => resolve = r),
  });
  return { nodes, change: account => listeners['harper:account-changed']({ detail: account }), resolve: account => resolve({ ok: true, json: async () => ({ account }) }) };
}
test('Ask Harper stays hidden until admin confirmation and clears on sign-out', async () => {
  const x = setup(), launcher = x.nodes['harper-assistant-launcher'];
  assert.equal(launcher.hidden, true);
  x.resolve({ role: 'dispatcher' }); await flush(); assert.equal(launcher.hidden, true);
  for (const role of ['driver','carrier-owner','broker','shipper']) { x.change({ role }); assert.equal(launcher.hidden, true); }
  x.change({ role: 'admin' }); assert.equal(launcher.hidden, false);
  launcher.click(); assert.equal(x.nodes['harper-assistant-panel'].hidden, false);
  x.change(null); assert.equal(launcher.hidden, true); assert.equal(x.nodes['harper-assistant-panel'].hidden, true);
  assert.equal(x.nodes['harper-assistant-messages'].children.length, 0);
});
test('late session response cannot restore assistant after sign-out', async () => {
  const x = setup(); x.change(null); x.resolve({ role: 'admin' }); await flush();
  assert.equal(x.nodes['harper-assistant-launcher'].hidden, true);
});
test('every static launcher is hidden before scripts load', () => {
  for (const file of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    for (const tag of html.match(/<button\b[^>]*id="harper-assistant-launcher"[^>]*>/g) || []) assert.match(tag, /\bhidden\b/, file);
  }
});

test('voice start recovers after a failed open request', async () => {
  const x = voiceSetup(); await flush();
  await x.nodes.assistantVoiceBegin.click();
  assert.match(x.nodes.assistantVoiceStatus.textContent, /Temporary failure/);
  await x.nodes.assistantVoiceBegin.click();
  assert.equal(x.opens(), 2);
  assert.equal(x.nodes.assistantVoiceTalk.disabled, false);
});
test('voice setup can be rechecked after server configuration changes', async () => {
  const x = voiceSetup(false); await flush();
  assert.equal(x.nodes.assistantVoiceBegin.disabled, false);
  assert.equal(x.nodes.assistantVoiceBegin.textContent, 'Check voice setup');
  x.configure(); await x.nodes.assistantVoiceBegin.click();
  assert.equal(x.opens(), 1);
});
function voiceSetup(configured = true) {
  let opens = 0;
  const nodes = {};
  for (const id of ['assistantVoiceForm','assistantVoiceTalk','assistantVoiceStop','assistantVoiceLog','assistantVoiceStatus','assistantVoiceBudget','assistantVoiceBegin']) {
    nodes[id] = { disabled: true, textContent: '', addEventListener(type, fn) { this[type] = fn; }, replaceChildren() {}, append() {}, classList: { add() {}, remove() {} } };
  }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assistant-voice-ui.js'), 'utf8'), {
    document: { getElementById: id => nodes[id], createElement: () => ({}) },
    window: { addEventListener() {} },
    fetch: async url => {
      if (url.endsWith('/state')) return {ok: true, json: async () => ({configured, budget: {used: 0, limit: 300}})};
      opens++;
      return {ok: opens > 1, json: async () => opens > 1 ? {conversationId: 'test'} : {error: 'Temporary failure'}};
    }
  });
  return {nodes, opens: () => opens, configure: () => { configured = true; }};
}
