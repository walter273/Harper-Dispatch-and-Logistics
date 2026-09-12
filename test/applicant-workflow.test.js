const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createWorkflow } = require('../applicant-workflow');
const { createReview } = require('../intake-review');
function setup(fetchImpl = async () => new Response(null, { status: 202 })) {
  const record = { id: 'intake-unit', type: 'carrier-onboarding', fields: { legal_carrier_name: 'Example Carrier', business_email: 'owner@example.com', billing_method: 'weekly', dispatch_package: 'dispatch-standard' } };
  const review = createReview(record); review.status = 'approved'; review.version = 2;
  const actor = { id: 'staff', role: 'admin', name: 'Staff', status: 'active' };
  let store = { intakes: [record], intakeReviews: { [record.id]: review }, accounts: { companies: [], users: [actor], invitations: [] }, operations: { billingSubscriptions: [] } };
  const env = { ALPHAWAY_SESSION_SECRET: 'a'.repeat(48), SENDGRID_API_KEY: 'SG.test', ALPHAWAY_APPLICANT_EMAILS_ENABLED: 'true' };
  let saved;
  const w = createWorkflow({ env, getStore: () => store, persist: () => { saved = structuredClone(store); }, fetchImpl });
  const transition = (action = 'approve') => w.transition(record, review, { action, notifyApplicant: true, applicantMessage: 'Welcome. Please complete onboarding.', note: 'INTERNAL PRIVATE NOTE' }, actor);
  return { record, review, actor, w, transition, env, get store() { return store; }, restart() { store = structuredClone(saved); return createWorkflow({ env, getStore: () => store, persist: () => {}, fetchImpl }); } };
}
test('approved workflow isolates a company, generates a usable invitation, and sends only applicant text', async () => {
  let sent;
  const x = setup(async (url, options) => { sent = JSON.parse(options.body); return new Response(null, { status: 202 }); });
  x.transition();
  assert.equal(x.store.accounts.companies.length, 1);
  assert.equal(x.store.accounts.invitations[0].role, 'carrier-owner');
  assert.equal(x.w.summary(x.record, x.review).workflow.ready, false);
  await x.w.drain(); await x.w.drain();
  assert.equal(x.store.applicantOutbox[0].attempts, 1);
  assert.equal(x.store.applicantOutbox[0].status, 'accepted');
  assert.ok(!JSON.stringify(sent).includes('INTERNAL PRIVATE NOTE'));
  const token = sent.content[0].value.match(/#token=([a-f0-9]+)/)[1];
  assert.equal(crypto.createHash('sha256').update(token).digest('hex'), x.store.accounts.invitations[0].tokenHash);
  assert.ok(!JSON.stringify(x.store).includes(token));
  assert.equal(x.restart().summary(x.record, x.review).emails[0].status, 'accepted');
});
test('uncertain sends are not retried and provider failures are not claimed as delivery', async () => {
  for (const mock of [async () => { throw Error('network'); }, async () => new Response(null, { status: 500 }), async () => new Response(null, { status: 401 })]) {
    const x = setup(mock); x.transition(); await x.w.drain(); await x.w.drain();
    assert.equal(x.store.applicantOutbox[0].attempts, 1);
    assert.ok(['uncertain', 'blocked'].includes(x.store.applicantOutbox[0].status));
  }
  const x = setup(); x.transition(); x.store.applicantOutbox[0].status = 'sending'; x.w.recover();
  assert.equal(x.store.applicantOutbox[0].status, 'uncertain');
});
test('denial and missing-information never provision accounts; reopening cancels stale mail and invitations', async () => {
  for (const [action, status] of [['reject', 'rejected'], ['status', 'needs_information']]) {
    const x = setup(); x.review.status = status; x.transition(action);
    assert.equal(x.store.accounts.companies.length, 0); assert.equal(x.store.accounts.invitations.length, 0);
  }
  const x = setup(); x.transition(); x.review.status = 'in_review'; x.w.transition(x.record, x.review, { action: 'reopen' }, x.actor); await x.w.drain();
  assert.equal(x.store.accounts.invitations[0].expiresAt, 0);
  assert.equal(x.store.applicantOutbox[0].status, 'cancelled');
});
test('readiness requires matching paid plan, active account, staff assignment and unexpired evidence', () => {
  const x = setup(); x.transition(); const w = x.store.applicantWorkflows[x.record.id];
  for (const c of Object.values(x.review.checks)) { c.status = 'verified'; c.evidence = 'secure-reference'; }
  x.store.accounts.users.push({ id: 'owner', companyId: w.companyId, role: 'carrier-owner', email: 'owner@example.com', status: 'active' });
  x.w.update(x.record, x.review, { version: 2, dispatcherId: 'staff' }, x.actor);
  assert.equal(x.w.summary(x.record, x.review).workflow.ready, false);
  x.store.operations.billingSubscriptions.push({ companyId: w.companyId, userId: 'owner', plan: 'dispatch-standard', status: 'active' });
  assert.equal(x.w.summary(x.record, x.review).workflow.ready, true);
  x.review.checks.insurance.expiresOn = '2020-01-01';
  assert.equal(x.w.summary(x.record, x.review).workflow.ready, false);
  x.review.checks.insurance.expiresOn = ''; x.review.status = 'suspended';
  assert.equal(x.w.summary(x.record, x.review).workflow.ready, false);
});
test('existing account cannot gain a new company or role via email matching', () => {
  const x = setup(); x.store.accounts.users.push({ email: 'owner@example.com', role: 'admin', companyId: 'other' });
  assert.throws(() => x.transition(), /already has an account/);
  assert.equal(x.store.accounts.companies.length, 0);
});
test('secure information response validates token, rejects executable files, and deduplicates uploads', () => {
  const x = setup(); x.review.status = 'needs_information'; x.transition('status');
  const job = x.store.applicantOutbox[0];
  const token = x.w.message(job).text.match(/#token=([^\s]+)/)[1];
  assert.equal(x.w.receiveResponse({ token, action: 'preview' }).reference, x.record.id);
  assert.throws(() => x.w.receiveResponse({ token: token + '0', action: 'preview' }), /invalid or expired/);
  const input = { token, requestId: crypto.randomUUID(), note: 'Insurance document supplied', file: { name: 'insurance.pdf', contentBase64: Buffer.from('%PDF-1.7\nExample').toString('base64') } };
  assert.throws(() => x.w.receiveResponse({ ...input, file: { name: 'script.html', contentBase64: Buffer.from('<script>alert(1)</script>').toString('base64') } }), /PDF/);
  x.w.receiveResponse(input); x.w.receiveResponse(input);
  const data = x.w.summary(x.record, x.review);
  assert.equal(data.responses.length, 1); assert.equal(data.responses[0].contentBase64, undefined);
  assert.equal(data.workflow.responses, undefined);
  assert.equal(x.review.status, 'needs_information');
  x.review.status = 'approved'; assert.throws(() => x.w.receiveResponse({ token, action: 'preview' }), /invalid or expired/);
});
test('Twilio provider uses a private basic-auth key and its email payload', async () => {
  let request;
  const x = setup();
  const env = { ...x.env, ALPHAWAY_EMAIL_PROVIDER: 'twilio', TWILIO_API_KEY_SID: 'SKexample', TWILIO_API_KEY_SECRET: 'private-secret' };
  const w = createWorkflow({ env, getStore: () => x.store, persist() {}, fetchImpl: async (url, options) => { request = { url, ...options }; return new Response(JSON.stringify({ operationId: 'op-1' }), { status: 202 }); } });
  w.transition(x.record, x.review, { action: 'approve', notifyApplicant: true, applicantMessage: 'Welcome.' }, x.actor);
  await w.drain();
  assert.equal(request.url, 'https://comms.twilio.com/v1/Emails');
  assert.equal(JSON.parse(request.body).to[0].address, 'owner@example.com');
  assert.ok(JSON.parse(request.body).content.text.includes('Create your account'));
  assert.ok(JSON.parse(request.body).content.html.includes('Create your account'));
  assert.ok(!JSON.stringify(x.store).includes('private-secret'));
});

test('Twilio acceptance and operation completion are not confused with delivery', async () => {
  const x = setup(); let delivered = 0, sent = 0;
  const w = createWorkflow({ env: { ...x.env, ALPHAWAY_EMAIL_PROVIDER: 'twilio', TWILIO_API_KEY_SID: 'SKtest', TWILIO_API_KEY_SECRET: 'secret' }, getStore: () => x.store, persist() {}, fetchImpl: async (url, options) => {
    if (options.method === 'POST') { sent++; return new Response(JSON.stringify({ operationId: 'comms_operation_test' }), { status: 202 }); }
    assert.equal(url, 'https://comms.twilio.com/v1/Emails/Operations/comms_operation_test');
    return new Response(JSON.stringify({ status: 'COMPLETED', stats: { recipients: 1, delivered } }));
  } });
  w.transition(x.record, x.review, { action: 'approve', notifyApplicant: true, applicantMessage: 'Welcome' }, x.actor);
  await w.drain(); await w.drain();
  assert.equal(x.store.applicantOutbox[0].status, 'accepted');
  x.store.applicantOutbox[0].checkedAt = 0; delivered = 1;
  await w.drain();
  assert.equal(x.store.applicantOutbox[0].status, 'delivered'); assert.equal(sent, 1);
});
