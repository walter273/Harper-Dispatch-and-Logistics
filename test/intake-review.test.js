const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { categories, createReview, restoreReviews, applyReview, listIntakes, publicHistory } = require('../intake-review');
const admin = { id: 'admin', name: 'Admin Reviewer', role: 'admin', status: 'active' };
const dispatcher = { id: 'dispatcher', name: 'Dispatch Reviewer', role: 'dispatcher', status: 'active' };
const users = [admin, dispatcher];
const intake = { id: 'intake-original', type: 'carrier-onboarding', fields: { legal_carrier_name: 'Original Carrier' }, createdAt: 1 };
const input = (review, action, extra = {}) => ({ action, version: review.version, requestId: randomUUID(), ...extra });
const change = (review, action, extra = {}, actor = admin) => applyReview(review, input(review, action, extra), actor, users).review;
const fails = (fn, code) => assert.throws(fn, error => error.statusCode === code);
function prepared() {
  let review = change(createReview(intake), 'assign', { assigneeId: dispatcher.id });
  for (const [checkId] of categories.carrier.checks) review = change(review, 'check', { checkId, status: 'verified', evidence: `Reviewed secure record ${checkId}` }, dispatcher);
  return review;
}
test('approval requires active ownership, supporting evidence and an admin decision', () => {
  let review = createReview(intake);
  fails(() => change(review, 'approve', { note: 'Approve' }), 400);
  review = change(review, 'assign', { assigneeId: dispatcher.id });
  fails(() => change(review, 'approve', { note: 'Approve' }), 400);
  fails(() => change(review, 'check', { checkId: 'insurance', status: 'verified', evidence: '' }), 400);
  fails(() => change(review, 'check', { checkId: 'insurance', status: 'not_applicable', evidence: '' }), 400);
  fails(() => change(review, 'status', { status: 'approved', note: 'Bypass' }), 400);
  review = prepared();
  fails(() => change(review, 'approve', { note: 'Approve' }, dispatcher), 403);
  fails(() => change(review, 'approve', { note: '' }), 400);
  fails(() => applyReview(review, input(review, 'approve', { note: 'Approve' }), admin, [admin, { ...dispatcher, status: 'suspended' }]), 400);
  for (const role of ['carrier-owner', 'driver', 'broker', 'shipper']) fails(() => change(review, 'note', { note: 'Bypass' }, { ...admin, role }), 403);
  const approved = change(review, 'approve', { note: 'All supporting documents and service terms reviewed.' });
  assert.equal(approved.status, 'approved'); assert.equal(approved.decision.actor.id, admin.id);
  assert.equal(approved.decision.assignee.id, dispatcher.id); assert.ok(approved.decision.at > 0);
  assert.equal(review.decision, null, 'the reducer does not mutate the previous revision');
  assert.deepEqual(intake.fields, { legal_carrier_name: 'Original Carrier' });
});
test('expired evidence prevents approval; invalid dates are rejected', () => {
  let review = prepared();
  fails(() => change(review, 'check', { checkId: 'insurance', status: 'verified', evidence: 'Policy', expiresOn: '2026-02-30' }), 400);
  review = change(review, 'check', { checkId: 'insurance', status: 'verified', evidence: 'Old policy', expiresOn: '2000-01-01' });
  fails(() => change(review, 'approve', { note: 'Approve' }), 400);
});
test('closed reviews preserve decision snapshots through suspension, reopening and new evidence', () => {
  let review = change(prepared(), 'approve', { note: 'Initial approval' });
  const snapshot = structuredClone(review.decision);
  fails(() => change(review, 'check', { checkId: 'insurance', status: 'pending' }), 409);
  fails(() => change(review, 'assign', { assigneeId: admin.id }), 409);
  fails(() => change(review, 'reopen', { note: 'Recheck' }, dispatcher), 403);
  review = change(review, 'note', { note: 'Received a policy change.' }, dispatcher);
  review = change(review, 'suspend', { note: 'Coverage requires another review.' });
  assert.equal(review.status, 'suspended');
  review = change(review, 'reopen', { note: 'Start policy recheck.' });
  review = change(review, 'check', { checkId: 'insurance', status: 'pending', evidence: 'Waiting for renewal.' });
  assert.deepEqual(review.history.find(event => event.action === 'approve').decision, snapshot);
  assert.deepEqual(review.decision, snapshot);
  assert.equal(review.checks.insurance.status, 'pending');
  review = change(review, 'reject', { note: 'Required evidence was not provided.' });
  assert.equal(review.status, 'rejected');
  assert.equal(review.history.filter(event => event.decision).length, 2);
});
test('optimistic revisions reject conflicting writes and retries are recorded once', () => {
  const original = createReview(intake);
  const request = input(original, 'note', { note: 'Checked submission.' });
  const first = applyReview(original, request, dispatcher, users);
  assert.equal(first.replayed, false);
  const retry = applyReview(first.review, { ...request }, dispatcher, users);
  assert.equal(retry.replayed, true); assert.equal(retry.review.history.length, 2);
  fails(() => applyReview(first.review, { ...request, note: 'Different note' }, dispatcher, users), 409);
  fails(() => applyReview(first.review, request, admin, users), 409);
  fails(() => applyReview(first.review, input(original, 'note', { note: 'Stale' }), admin, users), 409);
  const visible = publicHistory(first.review.history);
  assert.equal(visible[1].requestHash, undefined); assert.equal(visible[1].requestId, undefined);
});
test('migration retains more than 200 original records and unbounded review history', () => {
  const intakes = Array.from({ length: 275 }, (_, i) => ({ ...intake, id: `legacy-${i}`, createdAt: i, fields: { ...intake.fields, legacy_field: 'Preserve older data' } }));
  const reviews = restoreReviews(intakes);
  assert.equal(Object.keys(reviews).length, 275); assert.equal(reviews['legacy-0'].history[0].action, 'imported');
  let review = reviews['legacy-0'];
  // Real historical events must not be trimmed by startup or a subsequent update.
  review.history.push(...Array.from({ length: 1100 }, (_, i) => ({ id: `historical-${i}`, action: 'note', note: 'Retained note', version: i + 2, at: i + 1, actor: admin })));
  review.version = 1101;
  reviews['legacy-0'] = change(review, 'note', { note: 'Latest note' });
  const restored = restoreReviews(intakes, JSON.parse(JSON.stringify(reviews)));
  assert.equal(restored['legacy-0'].history.length, 1102);
  assert.equal(intakes[0].fields.legacy_field, 'Preserve older data');
  const first = listIntakes(intakes, restored, new URLSearchParams('pageSize=50'));
  assert.equal(first.total, 275); assert.equal(first.pages, 6); assert.equal(first.intakes.length, 50);
  const last = listIntakes(intakes, restored, new URLSearchParams('pageSize=50&page=6'));
  assert.equal(last.intakes.length, 25); assert.equal(last.intakes.at(-1).id, 'legacy-0');
  assert.throws(() => restoreReviews([...intakes, intakes[0]], reviews), /refusing to discard/);
  assert.throws(() => restoreReviews(intakes, { ...reviews, 'legacy-0': { status: 'approved' } }), /refusing to discard/);
});
test('classification changes retain former evidence and reset the applicable checklist', () => {
  let review = prepared();
  review = change(review, 'classify', { category: 'shipper', note: 'The request is from the shipper.' });
  assert.equal(review.category, 'shipper'); assert.equal(review.checks.identity.status, 'pending');
  assert.equal(review.history.at(-1).before.checks.insurance.status, 'verified');
  assert.equal(review.history.at(-1).before.category, 'carrier');
  fails(() => change(review, 'classify', { category: '__proto__', note: 'Invalid' }), 400);
});
