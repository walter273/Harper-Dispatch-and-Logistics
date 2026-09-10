const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createBilling } = require('../billing');

const env = { STRIPE_SECRET_KEY: ['sk', 'test', 'fixture'].join('_'), STRIPE_WEBHOOK_SECRET: crypto.randomBytes(32).toString('hex'), STRIPE_ACCOUNT_ID: 'acct_1UDJTIKqpp58H3DU', STRIPE_PRICE_DISPATCH_BASIC: 'price_fixture', STRIPE_PUBLIC_BASE_URL: 'https://app.example.com' };
const id = crypto.randomUUID();
function fixture(overrides = {}) {
  const calls = [], portalCalls = [];
  const price = { active: true, livemode: false, currency: 'usd', unit_amount: 30000, recurring: { interval: 'week', interval_count: 1, usage_type: 'licensed' }, ...overrides };
  return { calls, portalCalls, accounts: { retrieve: async () => ({ id: 'acct_1UDJTIKqpp58H3DU' }) }, prices: { retrieve: async () => price }, checkout: { sessions: { create: async (...args) => { calls.push(args); return { id: 'cs_test_fixture', url: 'https://checkout.stripe.com/c/pay/fixture' }; } } }, billingPortal: { sessions: { create: async (params) => { portalCalls.push(params); return { id: 'bps_fixture', url: 'https://billing.stripe.com/p/session/fixture' }; } } } };
}
test('Checkout uses verified server price, account metadata and stable retry key', async () => {
  const client = fixture(); const billing = createBilling(env, client);
  const actor = { id: 'user-1', companyId: 'company-1' };
  await billing.checkout('dispatch-basic', 'user@example.com', actor, id);
  await billing.checkout('dispatch-basic', 'user@example.com', actor, id);
  const [params, options] = client.calls[0];
  assert.equal(params.mode, 'subscription');
  assert.deepEqual(params.line_items, [{ price: 'price_fixture', quantity: 1 }]);
  assert.equal(params.subscription_data.metadata.companyId, 'company-1');
  assert.equal(params.client_reference_id, 'user-1');
  assert.equal(params.payment_method_types, undefined);
  assert.match(params.integration_identifier, /^alphaway_dispatch_[a-z]{8}$/);
  assert.equal(params.integration_identifier, client.calls[1][0].integration_identifier);
  assert.equal(options.idempotencyKey, client.calls[1][1].idempotencyKey);
});
test('missing configuration, live keys, wrong account, and incorrect prices cannot create Checkout', async () => {
  await assert.rejects(createBilling({}).checkout('dispatch-basic', '', null, id), { statusCode: 503 });
  await assert.rejects(createBilling({ ...env, STRIPE_SECRET_KEY: ['sk','live','fixture'].join('_') }, fixture()).checkout('dispatch-basic','',null,id), { statusCode: 503 });
  for (const overrides of [{ unit_amount: 599 }, { currency: 'eur' }, { livemode: true }, { active: false }, { recurring: { interval: 'year' } }]) {
    const client = fixture(overrides);
    await assert.rejects(createBilling(env, client).checkout('dispatch-basic','',null,id), { statusCode: 503 });
    assert.equal(client.calls.length, 0);
  }
  const client = fixture(); client.accounts.retrieve = async () => ({ id: 'acct_wrong' });
  await assert.rejects(createBilling(env,client).checkout('dispatch-basic','',null,id), { statusCode: 503 });
});
test('redirect configuration cannot send users to another origin or hosted HTTP', async () => {
  for (const config of [{ STRIPE_SUCCESS_URL: 'https://evil.example.com' }, { STRIPE_PUBLIC_BASE_URL: 'http://app.example.com' }, { STRIPE_CANCEL_URL: 'https://user:pass@app.example.com/' }, { NODE_ENV: 'production', STRIPE_PUBLIC_BASE_URL: 'http://localhost:4173' }]) {
    await assert.rejects(createBilling({...env,...config},fixture()).checkout('dispatch-basic','',null,id), { statusCode: 503 });
  }
});
test('Stripe failures are sanitized', async () => {
  const client = fixture(); client.checkout.sessions.create = async () => { throw new Error('confidential upstream payload'); };
  await assert.rejects(createBilling(env,client).checkout('dispatch-basic','',null,id), { statusCode: 502, message: 'Stripe Checkout is unavailable. Please retry shortly.' });
});
test('customer portal uses the reviewed configuration and same-origin return URL', async () => {
  const client = fixture();
  const billing = createBilling({ ...env, STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_fixture' }, client);
  const result = await billing.portal('cus_fixture');
  assert.equal(result.url, 'https://billing.stripe.com/p/session/fixture');
  assert.deepEqual(client.portalCalls, [{ customer: 'cus_fixture', return_url: 'https://app.example.com/workspace.html', configuration: 'bpc_fixture' }]);
  await assert.rejects(createBilling({ ...env, STRIPE_PORTAL_CONFIGURATION_ID: 'invalid' }, fixture()).portal('cus_fixture'), { statusCode: 503 });
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


test('live mode requires explicit server configuration and matching live resources', async () => {
  const liveEnv = {...env, STRIPE_MODE:'live', STRIPE_SECRET_KEY:['sk','live','fixture'].join('_'), STRIPE_LIVE_PAYMENTS_ENABLED:'true', STRIPE_PORTAL_CONFIGURATION_ID:'bpc_fixture'};
  const client = fixture({livemode:true});
  client.accounts.retrieve = async () => ({ id: env.STRIPE_ACCOUNT_ID, charges_enabled: true });
  await createBilling(liveEnv, client).checkout('dispatch-basic','', {id:'u',companyId:'c'}, id);
  assert.equal(client.calls.length,1);
  await assert.rejects(createBilling(liveEnv,fixture()).checkout('dispatch-basic','',null,id),{statusCode:503});
  await assert.rejects(createBilling({...liveEnv,STRIPE_SECRET_KEY:env.STRIPE_SECRET_KEY},client).checkout('dispatch-basic','',null,id),{statusCode:503});
  const billing = createBilling(liveEnv);
  const payload={id:'evt_live',type:'customer.subscription.updated',created:Math.floor(Date.now()/1000),livemode:true,data:{object:{id:'sub_live'}}};
  const sign=raw=>`t=${payload.created},v1=${crypto.createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(`${payload.created}.${raw}`).digest('hex')}`;
  const raw=JSON.stringify(payload);
  assert.equal(billing.event(Buffer.from(raw),sign(raw)).id,'evt_live');
  const wrong=JSON.stringify({...payload,livemode:false});
  assert.throws(()=>billing.event(Buffer.from(wrong),sign(wrong)),{statusCode:400});
});

test('installing a live key does not enable collection, but preserves cancellation and webhooks', async () => {
  const liveEnv = {...env, STRIPE_MODE:'live', STRIPE_SECRET_KEY:['sk','live','fixture'].join('_'), STRIPE_PORTAL_CONFIGURATION_ID:'bpc_fixture'};
  const client = fixture({livemode:true});
  client.accounts.retrieve = async () => ({ id: env.STRIPE_ACCOUNT_ID, charges_enabled: true });
  for (const enabled of [undefined, 'false', 'TRUE']) {
    const billing = createBilling({...liveEnv, STRIPE_LIVE_PAYMENTS_ENABLED:enabled}, client);
    assert.equal(billing.ready, false);
    await assert.rejects(billing.checkout('dispatch-basic', '', null, id), {statusCode:503});
    await billing.portal('cus_fixture');
  }
  assert.equal(client.calls.length, 0);
  assert.equal(client.portalCalls.length, 3);
  const enabled = {...liveEnv, STRIPE_LIVE_PAYMENTS_ENABLED:'true'};
  assert.equal(createBilling(enabled,client).ready, true);
  for (const portalId of ['', 'invalid']) {
    const billing = createBilling({...enabled, STRIPE_PORTAL_CONFIGURATION_ID:portalId}, client);
    assert.equal(billing.ready, false);
    await assert.rejects(billing.checkout('dispatch-basic', '', null, id), {statusCode:503});
  }
  client.accounts.retrieve = async () => ({ id: env.STRIPE_ACCOUNT_ID, charges_enabled: false });
  await assert.rejects(createBilling(enabled,client).checkout('dispatch-basic', '', null, id), {statusCode:503});
  assert.equal(client.calls.length, 0);
  const billing = createBilling(liveEnv);
  const payload = {id:'evt_live_disabled',type:'customer.subscription.deleted',created:Math.floor(Date.now()/1000),livemode:true,data:{object:{id:'sub_fixture'}}};
  const raw = JSON.stringify(payload);
  const signature = `t=${payload.created},v1=${crypto.createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(`${payload.created}.${raw}`).digest('hex')}`;
  assert.equal(billing.event(Buffer.from(raw),signature).id, payload.id);
});


test('carrier checkout uses truck quantity and one onboarding fee per fleet', async () => {
  const client=fixture(); const oldRetrieve=client.prices.retrieve;
  client.prices.retrieve=async price=>price==='price_onboarding' ? {active:true,livemode:false,currency:'usd',unit_amount:15000,type:'one_time'} : oldRetrieve(price);
  const billing=createBilling({...env,STRIPE_PRICE_CARRIER_ONBOARDING:'price_onboarding'},client);
  await billing.checkout('dispatch-basic','',{id:'owner',companyId:'fleet'},id,{truckCount:4,onboardingRequired:true});
  assert.deepEqual(client.calls[0][0].line_items,[{price:'price_fixture',quantity:4},{price:'price_onboarding',quantity:1}]);
  assert.equal(client.calls[0][0].metadata.revenueFeePercent,'0');
  await billing.checkout('dispatch-basic','',{id:'owner',companyId:'fleet'},crypto.randomUUID(),{truckCount:4,onboardingRequired:false});
  assert.equal(client.calls[1][0].line_items.length,1);
  for (const truckCount of [0, -1, 1.5, 101, 'invalid']) await assert.rejects(billing.checkout('dispatch-basic','',null,id,{truckCount}),{statusCode:400});
});

test('dispatch packages enforce exact weekly prices and never add a percentage fee', async () => {
  for (const [plan,amount] of [['dispatch-basic',30000],['dispatch-standard',50000],['dispatch-premium',70000]]) {
    const client=fixture({unit_amount:amount});
    const config={...env,[`STRIPE_PRICE_${plan.toUpperCase().replaceAll('-','_')}`]:'price_weekly'};
    await createBilling(config,client).checkout(plan,'',{id:'owner',companyId:'fleet'},id,{truckCount:2,billingMethod:'weekly'});
    assert.deepEqual(client.calls[0][0].line_items,[{price:'price_weekly',quantity:2}]);
    assert.equal(client.calls[0][0].metadata.revenueFeePercent,'0');
    assert.equal(client.calls[0][0].metadata.plan,plan);
    await assert.rejects(createBilling(config,fixture({unit_amount:amount,recurring:{interval:'month',interval_count:1,usage_type:'licensed'}})).checkout(plan,'',null,id),{statusCode:503});
  }
  await assert.rejects(createBilling(env,fixture()).checkout('dispatch-basic','',null,id,{billingMethod:'percentage'}),{statusCode:400});
  await assert.rejects(createBilling(env,fixture()).checkout('carrier','',null,id),{statusCode:400});
});

test('shipper and broker retain monthly billing without fleet onboarding', async () => {
  for (const [plan,amount] of [['shipper',79900],['broker',29900]]) {
    const client=fixture({unit_amount:amount,recurring:{interval:'month',interval_count:1,usage_type:'licensed'}});
    await createBilling({...env,[`STRIPE_PRICE_${plan.toUpperCase()}`]:'price_monthly'},client).checkout(plan,'',null,id,{truckCount:9,onboardingRequired:true});
    assert.deepEqual(client.calls[0][0].line_items,[{price:'price_monthly',quantity:1}]);
  }
});
