const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createVerifier, attachReport } = require('../carrier-verification');
const { createReview, applyReview } = require('../intake-review');
const { termsVersion } = require('../dispatch-plans');
const intake = { id: 'carrier-test', type: 'carrier-onboarding', fields: { legal_carrier_name: 'Example Freight LLC', primary_contact: 'Owner', business_email: 'owner@example.com', business_phone: '3035550100', dot_number: '123456', mc_number: 'MC-654321', available_units: '1', dispatch_package: 'dispatch-standard', billing_method: 'weekly', dispatch_terms: termsVersion } };
const carrier = { dotNumber: 123456, legalName: 'Example Freight LLC', allowToOperate: 'Y', outOfService: 'N' };
const response = rows => new Response(JSON.stringify({ content: rows.map(carrier => ({ carrier })) }));
const run = (fetchImpl, subject = intake, review = createReview(subject)) => createVerifier({ key: 'secret-key', fetchImpl }).run(subject, review);
test('matches both identifiers and legal name; flags are evidence, never approval', async () => {
  const urls = [];
  const report = await run(async url => { urls.push(String(url)); return response([carrier]); });
  assert.equal(report.checks.identity.status, 'passed');
  assert.equal(report.checks.authority.status, 'passed');
  assert.equal(report.checks.insurance.status, 'missing');
  assert.equal(urls.length, 2);
  assert.ok(urls.some(url => url.includes('/docket-number/654321')));
  assert.ok(!JSON.stringify(report).includes('secret-key'));
  const before = createReview(intake);
  const updated = attachReport(before, report);
  assert.deepEqual(updated.checks, before.checks);
  assert.equal(updated.status, 'received');
  assert.equal(updated.decision, null);
  assert.equal(updated.history.length, 2);
});
test('mismatch, zero IDs, test records, missing flags and provider failures never pass', async () => {
  for (const record of [{ ...carrier, legalName: 'Someone Else' }, { ...carrier, outOfService: 'Y' }, { ...carrier, allowToOperate: 'N' }, { ...carrier, outOfService: undefined }]) {
    const report = await run(async () => response([record]));
    assert.equal(report.checks.authority.status, 'needs_review');
  }
  const mismatch = await run(async url => response([String(url).includes('docket-number') ? { ...carrier, dotNumber: 654321 } : carrier]));
  assert.equal(mismatch.checks.identity.status, 'needs_review');
  for (const fields of [{ dot_number: '000000' }, { legal_carrier_name: 'TEST ONLY Carrier' }]) {
    const report = await run(() => { throw Error('must not call provider'); }, { ...intake, fields: { ...intake.fields, ...fields } });
    assert.equal(report.checks.identity.status, 'needs_review');
  }
  for (const mock of [async () => new Response('', { status: 401 }), async () => { throw Error('secret-key'); }, async () => new Response('{}'), async () => response([])]) {
    const report = await run(mock);
    assert.equal(report.checks.identity.status, 'needs_review');
    assert.ok(!JSON.stringify(report).includes('secret-key'));
  }
});
test('missing connection and expired evidence are explicit and preserve manual checks', async () => {
  const review = createReview(intake);
  review.checks.insurance = { status: 'verified', evidence: 'secure reference', expiresOn: '2020-01-01' };
  const report = await createVerifier().run(intake, review);
  assert.equal(report.providerConfigured, false);
  assert.match(report.checks.identity.summary, /not configured/);
  assert.equal(report.checks.insurance.status, 'needs_review');
  assert.match(report.checks.insurance.summary, /expired/);
  assert.equal(review.checks.insurance.status, 'verified');
});
test('automatic reports cannot replace the existing approval checks', async () => {
  const report = await run(async () => response([carrier]));
  const current = attachReport(createReview(intake), report);
  const actor = { id: 'admin', name: 'Admin', role: 'admin', status: 'active' };
  current.assignee = actor;
  assert.throws(() => applyReview(current, { action: 'approve', requestId: 'approval-test-12345', version: current.version, note: 'Approve' }, actor, [actor]), /Complete the check/);
});
