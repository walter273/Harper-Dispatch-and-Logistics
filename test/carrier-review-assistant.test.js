'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCarrierReviewAssistant } = require('../carrier-review-assistant');

function fields(overrides = {}) {
  return {
    legal_carrier_name: 'Summit Ridge Transport LLC',
    contact_name: 'Casey Morgan',
    business_email: 'casey@example.com',
    business_phone: '303-555-0145',
    mc_number: '1234567',
    usdot_number: '123456',
    w9_on_file: 'Yes',
    insurance_expiry: '2027-01-31',
    insurance_on_file: 'Yes',
    agreement_accepted: 'Yes',
    dispatch_service_requested: 'Yes',
    service_interest: 'Dispatch management',
    ...overrides,
  };
}

test('assistant prepares a complete draft without making the review decision', () => {
  const review = {
    automation: {
      checks: { identity: { status: 'passed' } },
    },
  };

  const draft = createCarrierReviewAssistant({ fields: fields(), review });

  assert.equal(draft.draftOnly, true);
  assert.equal(draft.requiresHumanReview, true);
  assert.equal(draft.overall, 'ready_for_human_review');
  assert.equal(draft.decision.recommendedAction, 'none');
  assert.deepEqual(Object.keys(draft.draftChecks), [
    'identity',
    'authority',
    'insurance',
    'tax_form',
    'agreement',
    'service',
  ]);
  assert.ok(Object.values(draft.draftChecks).every((check) => check.status === 'verified'));
  assert.ok(draft.recommendations.some((item) => item.includes('Do not activate service or billing')));
});

test('assistant reports missing evidence as pending or received', () => {
  const draft = createCarrierReviewAssistant({
    fields: fields({
      business_phone: '',
      w9_on_file: 'No',
      insurance_expiry: '',
      insurance_on_file: 'No',
      agreement_accepted: 'No',
      dispatch_service_requested: 'No',
      service_interest: '',
    }),
    review: {},
  });

  assert.equal(draft.overall, 'needs_information');
  assert.equal(draft.draftChecks.identity.status, 'pending');
  assert.equal(draft.draftChecks.authority.status, 'pending');
  assert.equal(draft.draftChecks.insurance.status, 'pending');
  assert.equal(draft.draftChecks.tax_form.status, 'received');
  assert.equal(draft.draftChecks.agreement.status, 'received');
  assert.equal(draft.draftChecks.service.status, 'received');
  assert.ok(draft.evidenceGaps.length > 0);
  assert.equal(draft.decision.recommendedAction, 'none');
});

test('assistant does not mutate intake fields or review evidence', () => {
  const submitted = fields();
  const review = { automation: { checks: { identity: { status: 'passed' } } } };
  const submittedBefore = structuredClone(submitted);
  const reviewBefore = structuredClone(review);

  createCarrierReviewAssistant({ fields: submitted, review });

  assert.deepEqual(submitted, submittedBefore);
  assert.deepEqual(review, reviewBefore);
});
