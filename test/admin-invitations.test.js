const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { start } = require('../test-support/server');
const { seed } = require('../test-support/review-fixture');

test('admin invitations support private password setup, role enforcement, one use, and restart', { timeout: 180000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alphaway-admin-invites-'));
  const file = path.join(dir, 'store.json'); const { tokens } = seed(file, 0);
  const expiredToken = crypto.randomBytes(24).toString('hex');
  const saved = JSON.parse(fs.readFileSync(file));
  saved.accounts.invitations = [{ id: 'expired', email: 'expired@example.com', role: 'admin', companyId: 'alphaway', status: 'pending', expiresAt: 1, tokenHash: crypto.createHash('sha256').update(expiredToken).digest('hex') }];
  fs.writeFileSync(file, JSON.stringify(saved));
  const config = { HARPER_DATA_FILE: file, HARPER_ACCOUNT_AUTH: 'true' }; let app;
  t.after(async () => { if (app) await app.stop(); fs.rmSync(dir, { recursive: true, force: true }); });
  app = await start(config);
  const adminCookie = `harper_account=${tokens['user-admin']}`;
  const post = (route, body, cookie = '', headers = {}) => fetch(app.url + route, { method: 'POST', headers: { 'content-type': 'application/json', cookie, ...headers }, body: JSON.stringify(body) });
  const invite = { email: 'new-admin@example.com', role: 'admin', companyId: 'alphaway' };
  for (const role of ['dispatcher', 'carrier-owner', 'driver', 'broker', 'shipper']) {
    assert.equal((await post('/api/accounts/invitations', invite, `harper_account=${tokens[`user-${role}`]}`)).status, 403);
  }
  assert.equal((await post('/api/accounts/invitations', invite)).status, 401);
  assert.equal((await post('/api/accounts/invitations', { ...invite, email: 'admin@example.com' }, adminCookie)).status, 409);
  assert.equal((await post('/api/accounts/invitations/preview', { token: expiredToken })).status, 400);
  const created = await post('/api/accounts/invitations', invite, adminCookie); assert.equal(created.status, 201);
  const { invitation } = await created.json();
  const preview = await post('/api/accounts/invitations/preview', { token: invitation.token });
  assert.equal(preview.status, 200);
  assert.deepEqual(Object.keys((await preview.json()).invitation).sort(), ['email', 'expiresAt', 'role']);
  assert.equal((await post('/api/accounts/invitations/preview', { token: invitation.token }, '', { origin: 'https://untrusted.example' })).status, 403);
  const body = { token: invitation.token, name: 'New Administrator', password: crypto.randomBytes(24).toString('hex') };
  assert.equal((await post('/api/accounts/accept', { ...body, password: 'short' })).status, 400);
  assert.equal((await post('/api/accounts/accept', { ...body, password: 'x'.repeat(257) })).status, 400);
  const recovery = path.join(dir, 'fault-recovery.json');
  fs.renameSync(file, recovery); fs.mkdirSync(file);
  try { assert.equal((await post('/api/accounts/accept', body)).status, 503); }
  finally { fs.rmdirSync(file); fs.renameSync(recovery, file); }
  const accepted = await post('/api/accounts/accept', body); assert.equal(accepted.status, 201);
  const account = (await accepted.json()).account;
  assert.equal(account.role, 'admin'); assert.equal(account.email, invite.email);
  assert.equal(account.passwordHash, undefined); assert.equal(account.password, undefined);
  const cookie = accepted.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(app.url + '/api/intakes', { headers: { cookie } })).status, 200);
  assert.equal((await post('/api/accounts/invitations/preview', { token: invitation.token })).status, 400);
  assert.equal((await post('/api/accounts/accept', body)).status, 400);
  const disk = JSON.parse(fs.readFileSync(file));
  const user = disk.accounts.users.find(user => user.id === account.id);
  assert.notEqual(user.passwordHash, body.password); assert.equal(JSON.stringify(disk).includes(body.password), false);
  assert.equal(disk.accounts.users.filter(user => user.email === invite.email).length, 1);
  assert.equal(disk.accounts.sessions.filter(session => session.userId === user.id).length, 1);
  const driverInvitation = await (await post('/api/accounts/invitations', { email: 'new-driver@example.com', role: 'driver', companyId: 'carrier-one' }, adminCookie)).json();
  const attemptedEscalation = await post('/api/accounts/accept', { token: driverInvitation.invitation.token, name: 'Invited Driver', password: body.password, role: 'admin', companyId: 'alphaway' });
  const driver = (await attemptedEscalation.json()).account; assert.equal(driver.role, 'driver'); assert.equal(driver.companyId, 'carrier-one');
  await app.stop(); app = await start(config);
  const signin = await post('/api/accounts/signin', { email: invite.email, password: body.password });
  assert.equal(signin.status, 200); assert.equal((await signin.json()).account.role, 'admin');
  for (const route of ['/accept-invitation.html', '/accept-invitation.js', '/account-setup.css']) assert.equal((await fetch(app.url + route)).status, 200);
});
