const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBillingReview } = require('../billing-review');
test('missing key never calls Stripe or approves launch', async () => {
  const env = { STRIPE_MODE: 'live', STRIPE_LIVE_PAYMENTS_ENABLED: 'false' };
  const report = await createBillingReview(env, new Proxy({}, { get() { throw Error('must not access'); } }))();
  assert.equal(report.launchApproved, false);
  assert.equal(report.liveCollectionEnabled, false);
  assert.equal(report.checks[0].status, 'fix');
});
test('wrong account stops further inspection; concurrent reviews share one request', async () => {
  let calls = 0;
  const review = createBillingReview({ STRIPE_SECRET_KEY: 'rk_live_TEST', STRIPE_MODE: 'live', STRIPE_ACCOUNT_ID: 'acct_expected' }, { accounts: { retrieve: async () => { calls++; return { id: 'acct_wrong' }; } } });
  const [a, b] = await Promise.all([review(), review()]);
  assert.equal(a, b); assert.equal(calls, 1);
  assert.equal(a.checks.find(c => c.name === 'Stripe account').status, 'fix');
  assert.equal(a.checks.some(c => c.name === 'Tax registrations'), false);
});
test('restricted tax permissions yield unknown without exposing raw errors or blocking billing evidence', async () => {
  const fail = async () => { throw Error('SECRET PRIVATE UPSTREAM'); };
  const client = { accounts: { retrieve: async () => ({ id: 'acct_expected', charges_enabled: true, payouts_enabled: true }) }, tax: { settings: { retrieve: fail }, registrations: { list: fail } } };
  const report = await createBillingReview({ STRIPE_SECRET_KEY: 'rk_live_TEST', STRIPE_MODE: 'live', STRIPE_ACCOUNT_ID: 'acct_expected' }, client)();
  assert.equal(report.checks.find(c => c.name === 'Stripe account').status, 'pass');
  assert.equal(report.checks.find(c => c.name === 'Tax registrations').status, 'unknown');
  assert.equal(report.launchApproved, false); assert.equal(JSON.stringify(report).includes('SECRET'), false);
});
test('review endpoint requires an administrator', async t => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const { start } = require('../test-support/server');
  const { seed } = require('../test-support/review-fixture');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-review-'));
  const file = path.join(dir, 'store.json');
  const { tokens } = seed(file, 0);
  const app = await start({ ALPHAWAY_DATA_FILE: file, ALPHAWAY_ACCOUNT_AUTH: 'true', STRIPE_SECRET_KEY: '' });
  t.after(async () => { await app.stop(); fs.rmSync(dir, { recursive: true, force: true }); });
  const url = app.url + '/api/admin/billing-review';
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { cookie: `alphaway_account=${tokens['user-dispatcher']}` } })).status, 403);
  const result = await fetch(url, { headers: { cookie: `alphaway_account=${tokens['user-admin']}` } });
  assert.equal(result.status, 200); assert.match(result.headers.get('cache-control'), /no-store/);
  assert.equal((await result.json()).launchApproved, false);
});
