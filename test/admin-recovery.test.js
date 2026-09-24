const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { start } = require('../test-support/server');

// The configured admin email is the only way back into a deployment whose
// administrator has drifted - suspended, demoted, detached from its company, or
// holding a password hash that no longer matches HARPER_ADMIN_PASSWORD. Without
// it there is no recovery route, because every repair path needs a working
// administrator. This test pins that behaviour.
test('a drifted admin account is repaired on boot and can sign in again', { timeout: 180000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harper-recovery-'));
  const file = path.join(dir, 'store.json');
  const password = 'recovery-password-123456';

  fs.writeFileSync(file, JSON.stringify({
    schemaVersion: 1,
    revision: 3,
    loads: [],
    state: {},
    companyStates: {},
    intakes: [],
    operations: { billingSubscriptions: [] },
    accounts: {
      companies: [{ id: 'harper', name: 'Harper Dispatch and Logistics', status: 'active' }],
      users: [{
        id: 'user-admin',
        email: 'admin@example.com',
        name: 'Harper Administrator',
        role: 'shipper',
        status: 'suspended',
        companyId: null,
        passwordSalt: 'stale',
        passwordHash: 'stale',
        createdAt: Date.now(),
      }],
      sessions: [],
      invitations: [],
      audit: [],
    },
  }));

  const app = await start({
    HARPER_DATA_FILE: file,
    HARPER_ACCOUNT_AUTH: 'true',
    HARPER_ADMIN_EMAIL: 'admin@example.com',
    HARPER_ADMIN_PASSWORD: password,
  });
  t.after(async () => { await app.stop(); fs.rmSync(dir, { recursive: true, force: true }); });

  const repaired = JSON.parse(fs.readFileSync(file)).accounts.users.find((u) => u.email === 'admin@example.com');
  assert.equal(repaired.status, 'active', 'a suspended administrator must be reactivated');
  assert.equal(repaired.role, 'admin', 'a demoted administrator must be restored');
  assert.equal(repaired.companyId, 'harper', 'a detached administrator must be reattached');
  assert.notEqual(repaired.passwordHash, 'stale', 'the configured password must take effect');

  const signin = await fetch(app.url + '/api/accounts/signin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password }),
  });
  assert.equal(signin.status, 200, 'the configured password must sign in');

  const cookie = signin.headers.get('set-cookie').split(';')[0];
  const workspace = await fetch(app.url + '/workspace.html', { headers: { cookie }, redirect: 'manual' });
  assert.equal(workspace.status, 200, 'the repaired session must reach a private page');
});
test('stale duplicate account cookies cannot override a valid sign-in and logout revokes presented sessions', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harper-cookie-'));
  const app = await start({ HARPER_DATA_FILE: path.join(dir,'store.json'), HARPER_ACCOUNT_AUTH:'true', HARPER_ADMIN_EMAIL:'admin@example.com', HARPER_ADMIN_PASSWORD:'test-cookie-password-123' });
  t.after(async()=>{await app.stop();fs.rmSync(dir,{recursive:true,force:true});});
  const login = await fetch(app.url+'/api/accounts/signin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'admin@example.com',password:'test-cookie-password-123'})});
  const valid = login.headers.get('set-cookie').split(';')[0];
  for (const cookie of [valid+'; harper_account=expired', 'harper_account=expired; '+valid]) {
    assert.equal((await fetch(app.url+'/workspace.html',{headers:{cookie},redirect:'manual'})).status,200);
  }
  await fetch(app.url+'/api/accounts/signout',{method:'POST',headers:{'content-type':'application/json',cookie:valid+'; harper_account=expired'},body:'{}'});
  assert.equal((await fetch(app.url+'/workspace.html',{headers:{cookie:valid},redirect:'manual'})).status,302);
});
