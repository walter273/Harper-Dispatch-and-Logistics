const { randomUUID, createHash } = require('node:crypto');

const categories = Object.freeze({
  carrier: { label: 'Carrier', checks: [
    ['identity', 'Carrier identity and operating entity'], ['authority', 'Authority and safety review'],
    ['insurance', 'Insurance coverage'], ['tax_form', 'W-9'],
    ['agreement', 'Signed dispatch agreement'], ['service', 'Package, billing terms, and dispatcher availability']
  ] },
  broker: { label: 'Broker', checks: [
    ['identity', 'Broker identity'], ['authority', 'Authority and bond or trust'],
    ['credit', 'Credit and factoring review'], ['agreement', 'Signed agreement'], ['billing', 'Billing instructions']
  ] },
  shipper: { label: 'Shipper', checks: [
    ['identity', 'Business identity'], ['credit', 'Credit and payment terms'],
    ['agreement', 'Signed agreement'], ['facilities', 'Facilities and handling requirements']
  ] },
  access: { label: 'Account access', checks: [
    ['identity', 'Requester identity'], ['company', 'Company membership and requested role']
  ] },
  general: { label: 'General inquiry', checks: [
    ['request', 'Request reviewed'], ['resolution', 'Next action or resolution recorded']
  ] }
});
const statuses = Object.freeze({ received: 'Received', in_review: 'In review', needs_information: 'Needs information', approved: 'Approved', rejected: 'Rejected', suspended: 'Suspended' });
const openStatuses = new Set(['received', 'in_review', 'needs_information']);
const checkStatuses = ['pending', 'received', 'verified', 'not_applicable'];
const staffRoles = new Set(['admin', 'dispatcher']);
function fail(statusCode, message) { throw Object.assign(new Error(message), { statusCode }); }
function note(value, required = false) {
  if (value !== undefined && typeof value !== 'string') fail(400, 'Notes must be text.');
  const result = (value || '').trim();
  if (result.length > 4000) fail(400, 'Notes must be 4,000 characters or fewer.');
  if (required && !result) fail(400, 'Record a reason or evidence before saving.');
  return result;
}
function actorRecord(actor) { return { id: actor.id, name: actor.name, role: actor.role }; }
function categoryFor(intake) {
  return { 'carrier-onboarding': 'carrier', 'broker-intake': 'broker', 'access-request': 'access', contact: 'general' }[intake.type] || 'general';
}
function blankChecks(category) { return Object.fromEntries(categories[category].checks.map(([id]) => [id, { status: 'pending', evidence: '', expiresOn: '' }])); }
function createReview(intake, { migrated = false, now = Date.now() } = {}) {
  const category = categoryFor(intake);
  return { version: 1, category, status: 'received', assignee: null, checks: blankChecks(category), decision: null,
    updatedAt: now, history: [{ id: randomUUID(), version: 1, at: now, actor: null, action: migrated ? 'imported' : 'submitted',
      note: migrated ? 'Existing submission added to the review queue. Original submission retained.' : 'Intake received.' }] };
}
// Retain original submissions and every review event. Never trim records during startup.
function restoreReviews(intakes, saved) {
  if (saved !== undefined && (!saved || typeof saved !== 'object' || Array.isArray(saved))) throw new Error('Invalid saved intake reviews.');
  const reviews = Object.assign(Object.create(null), saved || {});
  const seen = new Set();
  for (const intake of intakes) {
    if (!intake || typeof intake.id !== 'string' || !intake.id || seen.has(intake.id) || !intake.fields || typeof intake.fields !== 'object' || Array.isArray(intake.fields)) throw new Error('Invalid retained intake record; refusing to discard data.');
    seen.add(intake.id);
    if (!Object.hasOwn(reviews, intake.id)) reviews[intake.id] = createReview(intake, { migrated: true });
    const review = reviews[intake.id];
    if (!review || !Number.isSafeInteger(review.version) || review.version < 1 || !Object.hasOwn(categories, review.category) || !Object.hasOwn(statuses, review.status) || !review.checks || !Array.isArray(review.history) || !review.history.length) throw new Error('Invalid retained intake review; refusing to discard history.');
  }
  return reviews;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function applyReview(current, input, actor, reviewers, now = Date.now()) {
  if (!actor || actor.status !== 'active' || !staffRoles.has(actor.role)) fail(403, 'Staff access is required.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'A review action is required.');
  if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(input.requestId)) fail(400, 'A unique request ID is required.');
  const requestHash = createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex');
  const previous = current.history.find(entry => entry.requestId === input.requestId);
  if (previous) {
    if (previous.requestHash !== requestHash || previous.actor?.id !== actor.id) fail(409, 'This request ID was already used for a different change.');
    return { review: current, replayed: true };
  }
  if (input.version !== current.version) fail(409, 'Another reviewer changed this intake. Reload the record before saving.');
  const review = structuredClone(current);
  const event = { id: randomUUID(), requestId: input.requestId, requestHash, version: current.version + 1,
    at: now, actor: actorRecord(actor), action: input.action, note: note(input.note) };
  const admin = () => { if (actor.role !== 'admin') fail(403, 'Only an admin can record a final decision or reopen a review.'); };
  const editable = () => { if (!openStatuses.has(review.status)) fail(409, 'An admin must reopen this review before changing its checks or assignment.'); };
  switch (input.action) {
    case 'assign': {
      editable();
      const assignee = input.assigneeId === '' ? null : reviewers.find(user => user.id === input.assigneeId && user.status === 'active' && staffRoles.has(user.role));
      if (input.assigneeId !== '' && !assignee) fail(400, 'Choose an active staff reviewer.');
      event.before = review.assignee;
      review.assignee = assignee ? actorRecord(assignee) : null;
      event.after = review.assignee;
      break;
    }
    case 'classify':
      editable();
      if (!Object.hasOwn(categories, input.category)) fail(400, 'Choose a valid review category.');
      event.note = note(input.note, true);
      if (review.category === input.category) fail(400, 'This category is already selected.');
      event.before = { category: review.category, checks: review.checks };
      review.category = input.category;
      review.checks = blankChecks(input.category);
      event.after = { category: review.category, checks: structuredClone(review.checks) };
      break;
    case 'status':
      editable();
      if (!openStatuses.has(input.status)) fail(400, 'Use a decision action for approval or rejection.');
      if (input.status === review.status) fail(400, 'This status is already selected.');
      event.note = note(input.note, true);
      event.before = review.status;
      review.status = input.status;
      event.after = review.status;
      break;
    case 'check': {
      editable();
      if (!categories[review.category].checks.some(([id]) => id === input.checkId) || !checkStatuses.includes(input.status)) fail(400, 'Choose a valid check and status.');
      const evidence = note(input.evidence, ['verified', 'not_applicable'].includes(input.status));
      const expiresOn = input.expiresOn || '';
      if (typeof expiresOn !== 'string' || (expiresOn && (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || !Number.isFinite(Date.parse(expiresOn)) || new Date(expiresOn).toISOString().slice(0, 10) !== expiresOn))) fail(400, 'Use a valid expiration date.');
      event.checkId = input.checkId;
      event.before = review.checks[input.checkId];
      review.checks[input.checkId] = { status: input.status, evidence, expiresOn, checkedBy: actorRecord(actor), checkedAt: now };
      event.after = structuredClone(review.checks[input.checkId]);
      break;
    }
    case 'note': event.note = note(input.note, true); break;
    case 'approve':
    case 'reject': {
      admin(); editable();
      event.note = note(input.note, true);
      if (input.action === 'approve') {
        if (!reviewers.some(user => user.id === review.assignee?.id && user.status === 'active' && staffRoles.has(user.role))) fail(400, 'Assign an active staff reviewer before approval.');
        for (const [id, label] of categories[review.category].checks) {
          const check = review.checks[id];
          if (!check || !['verified', 'not_applicable'].includes(check.status) || !check.evidence?.trim()) fail(400, `Complete the check: ${label}.`);
          if (check.expiresOn && check.expiresOn < new Date(now).toISOString().slice(0, 10)) fail(400, `The evidence for ${label} has expired.`);
        }
      }
      event.before = review.status;
      review.status = input.action === 'approve' ? 'approved' : 'rejected';
      event.after = review.status;
      review.decision = { status: review.status, at: now, actor: actorRecord(actor), note: event.note,
        version: event.version, category: review.category, assignee: structuredClone(review.assignee), checks: structuredClone(review.checks) };
      event.decision = structuredClone(review.decision);
      break;
    }
    case 'suspend':
      admin();
      if (review.status !== 'approved') fail(409, 'Only an approved intake can be suspended.');
      event.note = note(input.note, true);
      event.before = review.status;
      review.status = 'suspended';
      event.after = review.status;
      break;
    case 'reopen':
      admin();
      if (openStatuses.has(review.status)) fail(409, 'This review is already open.');
      event.note = note(input.note, true);
      event.before = review.status;
      review.status = 'in_review';
      event.after = review.status;
      break;
    default: fail(400, 'Unknown review action.');
  }
  review.version = event.version;
  review.updatedAt = now;
  review.history.push(event);
  return { review, replayed: false };
}
function publicReview(review) {
  const { history, ...result } = review;
  return { ...result, historyCount: history.length };
}
function publicHistory(history) {
  return history.map(({ requestHash, requestId, ...entry }) => entry);
}
function listIntakes(intakes, reviews, query) {
  const pageSize = Math.max(1, Math.min(50, parseInt(query.get('pageSize'), 10) || 25));
  const requestedPage = Math.max(1, parseInt(query.get('page'), 10) || 1);
  const q = (query.get('q') || '').trim().toLowerCase().slice(0, 200);
  const status = query.get('status') || '';
  const category = query.get('category') || '';
  const assignee = query.get('assignee') || '';
  const counts = Object.fromEntries(Object.keys(statuses).map(key => [key, 0]));
  const selected = intakes.filter(intake => {
    const review = reviews[intake.id];
    counts[review.status]++;
    return (!status || status === review.status) && (!category || category === review.category) &&
      (!assignee || (assignee === 'unassigned' ? !review.assignee : assignee === review.assignee?.id)) &&
      (!q || [intake.id, ...Object.values(intake.fields)].join(' ').toLowerCase().includes(q));
  }).sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  const pages = Math.max(1, Math.ceil(selected.length / pageSize));
  const page = Math.min(requestedPage, pages);
  return { intakes: selected.slice((page - 1) * pageSize, page * pageSize).map(intake => ({ ...intake, review: {
    version: reviews[intake.id].version, category: reviews[intake.id].category, status: reviews[intake.id].status,
    assignee: reviews[intake.id].assignee, updatedAt: reviews[intake.id].updatedAt
  } })), total: selected.length, retainedTotal: intakes.length, page, pageSize, pages, counts };
}
module.exports = { categories, statuses, createReview, restoreReviews, applyReview, publicReview, publicHistory, listIntakes };
