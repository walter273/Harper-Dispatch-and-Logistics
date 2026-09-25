'use strict';

// Draft-only, deterministic assistant for carrier intake review.
// It never approves, rejects, or changes a review. A staff member must apply
// every suggestion manually after checking the source evidence.
const CHECK_ORDER = ['identity', 'authority', 'insurance', 'tax_form', 'agreement', 'service'];

function text(value) {
  return String(value == null ? '' : value).trim();
}

function has(value) {
  return text(value).toLowerCase() === 'yes';
}

function createCarrierReviewAssistant(input) {
  const fields = input && input.fields ? input.fields : {};
  const review = input && input.review ? input.review : {};
  const automation = review.automation || null;
  const findings = [];
  const recommendations = [];
  const draftChecks = {};

  function add(id, status, rationale, evidence) {
    draftChecks[id] = { status, rationale, evidence: evidence || 'Verified from intake submission and automatic screening report.' };
  }

  const legalName = text(fields.legal_carrier_name);
  const contactName = text(fields.contact_name);
  const email = text(fields.business_email);
  const phone = text(fields.business_phone);
  if (legalName && contactName && email && phone) add('identity', 'verified', 'Required legal business and primary contact fields are present.');
  else {
    add('identity', 'pending', 'Legal business name, business email, or business phone is missing.');
    findings.push('Complete missing legal business and primary contact information.');
  }

  const screening = automation && automation.checks ? automation.checks : {};
  if (screening.identity && screening.identity.status === 'passed') add('authority', 'verified', 'FMCSA registry identity matched the submitted legal name and identifiers.');
  else if (automation) {
    add('authority', 'received', 'Registry comparison is incomplete or has an exception. A reviewer must resolve it before approval.', 'Review the current FMCSA screening report and registry record.');
    findings.push('Resolve the authority or operating-authority exception from the screening report.');
  } else {
    add('authority', 'pending', 'Automatic screening has not been run.');
    findings.push('Run automatic carrier checks before using this draft.');
  }

  if (text(fields.insurance_expiry) || has(fields.insurance_on_file)) add('insurance', 'verified', 'Insurance evidence or an expiry date was supplied.');
  else {
    add('insurance', 'pending', 'Insurance evidence was not identified in the submission.');
    findings.push('Obtain and verify current insurance evidence before approval.');
  }

  if (has(fields.w9_on_file)) add('tax_form', 'verified', 'Carrier confirmed that a W-9 is on file.');
  else {
    add('tax_form', 'received', 'The submission does not confirm a W-9 on file.');
    findings.push('Confirm secure storage and review of the carrier W-9.');
  }

  if (has(fields.agreement_accepted)) add('agreement', 'verified', 'Carrier confirmed acceptance of the carrier agreement.');
  else {
    add('agreement', 'received', 'Carrier agreement acceptance was not clearly confirmed.');
    findings.push('Confirm the carrier agreement and record the evidence reference.');
  }

  if (has(fields.dispatch_service_requested) || has(fields.service_interest) || has(fields.services)) {
    add('service', 'verified', 'The carrier requested dispatch service and selected a service interest.');
  } else {
    add('service', 'received', 'Service intent is not clearly recorded. Confirm the product and dispatch service selected.');
    findings.push('Confirm which Harper service the carrier wants and whether dispatch management is requested.');
  }

  for (const id of CHECK_ORDER) if (!draftChecks[id]) add(id, 'pending', 'The submission does not provide enough evidence to draft this check.');

  const blockers = Object.values(draftChecks).filter(check => check.status === 'pending');
  const missing = Object.values(draftChecks).filter(check => check.status === 'received');
  if (missing.length) recommendations.push('Resolve the received exceptions manually before approval.');
  recommendations.push('Do not activate service or billing from this draft. Record final decisions manually after evidence review.');

  const evidenceGaps = findings.slice();
  const overall = blockers.length ? 'needs_information' : 'ready_for_human_review';

  return {
    version: 1,
    generatedAt: Date.now(),
    draftOnly: true,
    requiresHumanReview: true,
    overall,
    summary: blockers.length ? 'Draft blocked by missing required information.' : missing.length ? 'Draft ready, with exceptions for human review.' : 'Draft prepared; human evidence review and final decision are still required.',
    draftChecks,
    findings,
    recommendations,
    evidenceGaps,
    decision: { recommendedAction: 'none', note: 'No automatic decision was made. An administrator must review and record the final decision.' },
  };
}

module.exports = { createCarrierReviewAssistant };
