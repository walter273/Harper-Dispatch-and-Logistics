const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createBilling } = require('../billing');

const env = { STRIPE_SECRET_KEY: ['sk', 'test', 'fixture'].join('_'), STRIPE_WEBHOOK_SECRET: crypto.randomBytes(32).toString('hex'), STRIPE_ACCOUNT_ID: 'acct_1UDJTIKqpp58H3DU', STRIPE_PRICE_CARRIER: 'price_fixture', STRIPE_PUBLIC_BASE_URL: 'https://app.example.com' };
const id = crypto.randomUUID();
function fixture(overrides = {}) {
  const calls = [];
  const price = { active: true, livemode: false, currency: 'usd', unit_amount: 59900, recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' }, ...overrides };
  return { calls, accounts: { retrieve: async () => ({ id: 'acct_1UDJTIKqpp58H3DU' }) }, prices: { retrieve: async () => price }, checkout: { sessions: { create: async (...args) => { calls.push(args); return { id: 'cs_test_fixture', url: 'https://checkout.stripe.com/c/pay/fixture' }; } } }, billingPortal: { sessions: { create: async (params) => ({ id: 'bps_fixture', url: 'https://billing.stripe.com/p/session/fixture', params }) } } };
}
test('Checkout uses verified server price, account metadata and stable retry key', async () => {
  const client = fixture(); const billing = createBilling(env, client);
  const actor = { id: 'user-1', companyId: 'company-1' };
  await billing.checkout('carrier', 'user@example.com', actor, id);
  await billing.checkout('carrier', 'user@example.com', actor, id);
  const [params, options] = client.calls[0];
  assert.equal(params.mode, 'subscription');
  assert.deepEqual(params.line_items, [{ price: 'price_fixture', quantity: 1 }]);
  assert.equal(params.subscription_data.metadata.companyId, 'company-1');
  assert.equal(params.client_reference_id, 'user-1');
  assert.equal(params.payment_method_types, undefined);
  assert.equal(options.idempotencyKey, client.calls[1][1].idempotencyKey);
});
test('missing configuration, live keys, wrong account, and incorrect prices cannot create Checkout', async () => {
  await assert.rejects(createBilling({}).checkout('carrier', '', null, id), { statusCode: 503 });
  await assert.rejects(createBilling({ ...env, STRIPE_SECRET_KEY: ['sk','live','fixture'].join('_') }, fixture()).checkout('carrier','',null,id), { statusCode: 503 });
  for (const overrides of [{ unit_amount: 599 }, { currency: 'eur' }, { livemode: true }, { active: false }, { recurring: { interval: 'year' } }]) {
    const client = fixture(overrides);
    await assert.rejects(createBilling(env, client).checkout('carrier','',null,id), { statusCode: 503 });
    assert.equal(client.calls.length, 0);
  }
  const client = fixture(); client.accounts.retrieve = async () => ({ id: 'acct_wrong' });
  await assert.rejects(createBilling(env,client).checkout('carrier','',null,id), { statusCode: 503 });
});
test('redirect configuration cannot send users to another origin or hosted HTTP', async () => {
  for (const config of [{ STRIPE_SUCCESS_URL: 'https://evil.example.com' }, { STRIPE_PUBLIC_BASE_URL: 'http://app.example.com' }, { STRIPE_CANCEL_URL: 'https://user:pass@app.example.com/' }, { NODE_ENV: 'production', STRIPE_PUBLIC_BASE_URL: 'http://localhost:4173' }]) {
    await assert.rejects(createBilling({...env,...config},fixture()).checkout('carrier','',null,id), { statusCode: 503 });
  }
});
test('Stripe failures are sanitized', async () => {
  const client = fixture(); client.checkout.sessions.create = async () => { throw new Error('confidential upstream payload'); };
  await assert.rejects(createBilling(env,client).checkout('carrier','',null,id), { statusCode: 502, message: 'Stripe Checkout is unavailable. Please retry shortly.' });
});
test('raw signed events support secret rotation and reject tampering, stale and live events', () => {
  const billing = createBilling({ STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET, STRIPE_ACCOUNT_ID: env.STRIPE_ACCOUNT_ID });
  const event = { id: 'evt_fixture', type: 'customer.subscription.updated', created: Math.floor(Date.now()/1000), livemode: false, data: { object: { id: 'sub_fixture' } } };
  const sign = (raw,t = event.created) => `t=${t},v1=${'0'.repeat(64)},v1=${crypto.createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(`${t}.`).update(raw).digest('hex')}`;
  const raw = Buffer.from(JSON.stringify(event));
  assert.equal(billing.event(raw,sign(raw)).id, event.id);
  assert.throws(() => billing.event(Buffer.from('{}'),sign(raw)), { statusCode: 400 });
  assert.throws(() => billing.event(raw,sign(raw,event.created-600)), { statusCode: 400 });
  const live = Buffer.from(JSON.stringify({...event,livemode:true}));
  assert.throws(() => billing.event(live,sign(live)), { statusCode: 400 });
});
