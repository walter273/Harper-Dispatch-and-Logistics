const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
for (const role of ['admin', 'dispatcher', 'carrier-owner', 'broker', 'shipper']) {
  test(`workspace sign-in routing: ${role}`, async () => {
    const handlers = {}; const redirects = []; const requests = [];
    const form = { addEventListener: (type, fn) => handlers[type] = fn, reset() {} };
    const status = {};
    vm.runInNewContext(source('workspace.js'), {
      window: { location: { hostname: 'example.up.railway.app', assign: url => redirects.push(url) }, dispatchEvent() {} },
      document: { getElementById: id => id === 'signinForm' ? form : id === 'signinStatus' ? status : null, querySelectorAll: () => [] },
      CustomEvent: class {}, FormData: class { entries() { return [['email','test@example.com'],['password','test']]; } },
      fetch: async (url) => { requests.push(url); return { ok: true, json: async () => ({ account: url.endsWith('/signin') ? { role } : null, users: [] }) }; }
    });
    await flush();
    await handlers.submit({ preventDefault() {}, currentTarget: form });
    assert.deepEqual(redirects, role === 'admin' ? ['./admin.html'] : []);
    assert.ok(requests.includes('./api/accounts/signin'));
    assert.ok(requests.every(url => !url.includes('__PORT_')));
  });
}
test('Staff navigation follows server role and sign-out', async () => {
  const links = new Map(); const listeners = {};
  const nav = { querySelector: selector => links.get(selector.slice(1, -1)), append: element => links.set(element.attribute, element) };
  vm.runInNewContext(source('account-nav.js'), {
    document: { querySelectorAll: () => [nav], createElement: () => ({ setAttribute(name) { this.attribute = name; }, remove() { links.delete(this.attribute); } }) },
    window: { addEventListener: (name, fn) => listeners[name] = fn },
    fetch: async () => ({ ok: true, json: async () => ({ account: { role: 'admin' } }) })
  });
  await flush(); assert.equal(links.get('data-admin-nav').textContent, 'Admin'); assert.equal(links.get('data-admin-nav').href, './admin.html');
  assert.equal(links.get('data-intake-nav').href, './intake-review.html');
  listeners['alphaway:account-changed']({ detail: null }); assert.equal(links.size, 0);
  listeners['alphaway:account-changed']({ detail: { role: 'dispatcher' } }); assert.equal(links.has('data-admin-nav'), false); assert.equal(links.has('data-intake-nav'), true);
  for (const role of ['carrier-owner', 'driver', 'broker', 'shipper']) {
    listeners['alphaway:account-changed']({ detail: { role } }); assert.equal(links.size, 0);
  }
});
test('late session response cannot restore admin link after sign-out', async () => {
  let resolve; let link; const listeners = {};
  vm.runInNewContext(source('account-nav.js'), {
    document: { querySelectorAll: () => [{ querySelector: () => link, append: el => link = el }], createElement: () => ({ setAttribute() {}, remove() { link = undefined; } }) },
    window: { addEventListener: (name, fn) => listeners[name] = fn },
    fetch: () => new Promise(r => resolve = r)
  });
  listeners['alphaway:account-changed']({ detail: null });
  resolve({ ok: true, json: async () => ({ account: { role: 'admin' } }) });
  await flush(); assert.equal(link, undefined);
});

