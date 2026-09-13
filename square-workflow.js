const crypto = require('node:crypto');
const { entitled } = require('./square-billing');
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
function createSquareWorkflow({ billing, getStore, persist }) {
  const locks = new Set();
  const entries = () => (getStore().squareBilling ||= []);
  const scope = actor => `${billing.environment}:${actor.companyId}`;
  function allowed(actor) {
    if (!actor?.companyId || !['admin','carrier-owner','broker','shipper'].includes(actor.role)) throw fail(403,'Sign in as a company owner before managing billing.');
    if (billing.environment === 'sandbox' && actor.role !== 'admin') throw fail(503,'Customer payments are not enabled yet. Contact Harper for onboarding assistance.');
  }
  async function locked(id, fn) {
    if (locks.has(id)) throw fail(409,'Billing is being updated. Please try again shortly.');
    locks.add(id); try { return await fn(); } finally { locks.delete(id); }
  }
  function save(entry) {
    const s = getStore();
    s.squareBilling = entries().filter(e => e.id !== entry.id).concat(entry);
    if (entry.environment === 'production' && entry.subscriptionId) {
      const id = `square_${entry.subscriptionId}`;
      const subscription = { id, provider: 'square', environment: entry.environment, customerId: entry.customerId, userId: entry.userId, companyId: entry.companyId, plan: entry.plan, truckCount: entry.truckCount, status: entry.status || 'pending', currentPeriodEnd: entry.currentPeriodEnd || 0, cancelAtPeriodEnd: Boolean(entry.cancelAtPeriodEnd), updatedAt: Date.now() };
      s.operations.billingSubscriptions = s.operations.billingSubscriptions.filter(e => e.id !== id).concat(subscription);
      if (entry.setupPaid) s.carrierOnboardedCompanies = [...new Set(s.carrierOnboardedCompanies.concat(entry.companyId))];
    }
    persist(); return entry;
  }
  function current(actor) { return entries().filter(e => e.scope === scope(actor)).sort((a,b) => b.createdAt-a.createdAt)[0]; }
  function safe(entry) {
    if (!entry) return null;
    return { id: entry.id, plan: entry.plan, truckCount: entry.truckCount, environment: entry.environment, status: entry.status || 'pending', setupPaid: Boolean(entry.setupPaid), onboardingRequired: entry.onboardingRequired, hasSubscriptionCheckout: Boolean(entry.subscriptionLink), currentPeriodEnd: entry.currentPeriodEnd || 0, cancelAtPeriodEnd: Boolean(entry.cancelAtPeriodEnd), invoiceUrl: entry.invoiceUrl || null, entitled: entitled({ ...entry, provider: 'square' }) };
  }
  async function start(actor, options) {
    allowed(actor);
    return locked(scope(actor), async () => {
      let entry = current(actor);
      if (entry?.status === 'canceled') entry = null;
      if (entry && (entry.plan !== options.plan || entry.truckCount !== options.truckCount)) throw fail(409,'A different Square plan is already pending or subscribed. Contact Harper before changing plans.');
      if (!entry) entry = save({ id: crypto.randomUUID(), scope: scope(actor), userId: actor.id, companyId: actor.companyId, environment: billing.environment, ...options, createdAt: Date.now(), status:'pending' });
      return { url: '/square-billing.html', sessionId: entry.id };
    });
  }
  async function state(actor, refresh = false) {
    allowed(actor);
    return locked(scope(actor), async () => {
      let entry = current(actor);
      if (entry && refresh) entry = save(await billing.refresh(entry));
      return { environment: billing.environment, configured: billing.ready, entry: safe(entry) };
    });
  }
  async function next(actor) {
    allowed(actor);
    return locked(scope(actor), async () => {
      let entry = current(actor);
      if (!entry) throw fail(409,'Choose your approved plan in the workspace first.');
      entry = save(await billing.refresh(entry));
      if (entry.subscriptionId) throw fail(409,'This subscription already exists. Use its billing status or invoice.');
      const setup = entry.onboardingRequired && !entry.setupPaid;
      const property = setup ? 'setupLink' : 'subscriptionLink';
      if (!entry[property]) entry = save({ ...entry, [property]: await billing.createLink(entry,setup) });
      return { url: entry[property].url };
    });
  }
  async function cancel(actor) {
    allowed(actor);
    return locked(scope(actor), async () => { const entry = current(actor); if (!entry) throw fail(409,'No Square subscription found.'); return safe(save(await billing.cancel(entry))); });
  }
  async function reconcile() {
    // Re-fetch authoritative objects. Webhook payloads never grant access directly.
    for (const entry of entries().filter(e => e.environment === billing.environment && (e.setupLink || e.subscriptionLink) && e.status !== 'canceled')) {
      if (locks.has(entry.scope)) continue;
      try { await locked(entry.scope, async () => save(await billing.refresh(entry))); } catch { /* Next timer/webhook/customer refresh retries without granting new access. */ }
    }
  }
  return { start, state, next, cancel, reconcile };
}
module.exports = { createSquareWorkflow };
