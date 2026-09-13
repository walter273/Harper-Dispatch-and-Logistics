const crypto = require('node:crypto');
const { plans, isDispatchPlan } = require('./dispatch-plans');
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const money = amount => ({ amount, currency: 'USD' });
const identity = value => encodeURIComponent(String(value));
const key = (id, step) => crypto.createHash('sha256').update(`${id}:${step}`).digest('hex');
function quote(plan, trucks = 1) {
  if (!isDispatchPlan(plan) && !['broker', 'shipper'].includes(plan)) throw fail(400, 'Choose a supported plan.');
  if (!Number.isInteger(trucks) || trucks < 1 || trucks > 100 || (!isDispatchPlan(plan) && trucks !== 1)) throw fail(400, 'Invalid truck count.');
  return { amount: isDispatchPlan(plan) ? plans[plan].weeklyCents * trucks : plan === 'broker' ? 29900 : 79900,
    cadence: isDispatchPlan(plan) ? 'WEEKLY' : 'MONTHLY', name: isDispatchPlan(plan) ? `${plans[plan].name} — ${trucks} truck(s)` : plan === 'broker' ? 'Broker Desk' : 'Shipper Control' };
}
function entitled(record, now = Date.now()) {
  return record?.provider === 'square' && record.environment === 'production' && record.status === 'active' && record.currentPeriodEnd * 1000 > now;
}
function createSquareBilling(env = process.env, fetchImpl = fetch) {
  const environment = env.SQUARE_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
  const sandbox = environment === 'sandbox';
  const token = env[sandbox ? 'SQUARE_SANDBOX_ACCESS_TOKEN' : 'SQUARE_ACCESS_TOKEN'];
  const locationId = env[sandbox ? 'SQUARE_SANDBOX_LOCATION_ID' : 'SQUARE_LOCATION_ID'];
  const base = sandbox ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
  const ready = Boolean(token && locationId && (sandbox || env.SQUARE_LIVE_PAYMENTS_ENABLED === 'true'));
  async function api(path, body, method = body ? 'POST' : 'GET') {
    if (!ready) throw fail(503, 'Square payments are not enabled. Contact Harper for assistance.');
    let response, data;
    try {
      response = await fetchImpl(`${base}/v2${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Square-Version': '2026-08-19', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
      data = await response.json();
    } catch { throw fail(502, 'Square is unavailable. Please retry; the same payment request will be reused.'); }
    if (!response.ok || data.errors?.length) throw fail(502, `Square could not complete this step (${String(data.errors?.[0]?.code || response.status).replace(/[^A-Z0-9_]/g, '').slice(0,60)}).`);
    return data;
  }
  function returnUrl() {
    const url = new URL(env.ALPHAWAY_PUBLIC_ORIGIN || 'http://localhost:4173');
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || (url.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && ['localhost','127.0.0.1'].includes(url.hostname)))) throw fail(503, 'Configure the secure Harper website address.');
    return `${url.origin}/square-billing.html`;
  }
  async function verify() {
    const { location } = await api(`/locations/${identity(locationId)}`);
    if (location?.id !== locationId || location.status !== 'ACTIVE' || location.currency !== 'USD' || !location.capabilities?.includes('CREDIT_CARD_PROCESSING')) throw fail(503, 'Square location is not ready for USD card payments.');
    return { environment, locationId, merchantId: location.merchant_id, ready: true };
  }
  async function createLink(entry, setup = false) {
    const q = quote(entry.plan, entry.truckCount);
    await verify();
    let variationId;
    if (!setup) {
      const { catalog_object: plan } = await api('/catalog/object', { idempotency_key: key(entry.id,'plan'), object: { type: 'SUBSCRIPTION_PLAN', id: '#plan', subscription_plan_data: { name: `${sandbox ? 'TEST ' : ''}Harper ${q.name}`, all_items: true } } });
      const { catalog_object: variation } = await api('/catalog/object', { idempotency_key: key(entry.id,'variation'), object: { type: 'SUBSCRIPTION_PLAN_VARIATION', id: '#variation', subscription_plan_variation_data: { name: q.name, subscription_plan_id: plan.id, phases: [{ ordinal: 0, cadence: q.cadence, pricing: { type: 'STATIC', price_money: money(q.amount) } }] } } });
      variationId = variation.id;
    }
    const { payment_link: link } = await api('/online-checkout/payment-links', {
      idempotency_key: key(entry.id, setup ? 'setup-link' : 'subscription-link'),
      quick_pay: { name: `${sandbox ? 'TEST — ' : ''}${setup ? 'Harper fleet onboarding — one time' : q.name}`, price_money: money(setup ? 15000 : q.amount), location_id: locationId },
      checkout_options: { redirect_url: returnUrl(), allow_tipping: false, ...(variationId ? { subscription_plan_id: variationId } : {}) },
      description: `Harper checkout ${entry.id} ${setup ? 'onboarding' : 'subscription'}`
    });
    const url = new URL(link.url);
    if (url.protocol !== 'https:' || url.username || url.password || !['square.link','checkout.square.site','sandbox.square.link','sandbox.checkout.square.site'].includes(url.hostname)) throw fail(502, 'Square returned an unexpected checkout address.');
    return { id: link.id, orderId: link.order_id, url: link.url, ...(variationId ? { variationId } : {}) };
  }
  async function paidOrder(link, expected) {
    const { order } = await api(`/orders/${identity(link.orderId)}`);
    if (order?.location_id !== locationId || order.total_money?.currency !== 'USD' || order.total_money.amount !== expected || order.state !== 'COMPLETED') return null;
    for (const tender of order.tenders || []) {
      if (!tender.payment_id) continue;
      const { payment } = await api(`/payments/${identity(tender.payment_id)}`);
      if (payment.status === 'COMPLETED' && payment.order_id === order.id && payment.location_id === locationId && payment.amount_money?.amount === expected && payment.amount_money.currency === 'USD' && !(payment.refunded_money?.amount > 0)) return payment;
    }
    return null;
  }
  async function refresh(entry) {
    if (entry.environment !== environment) throw fail(409, 'This checkout belongs to another payment environment.');
    const next = structuredClone(entry), q = quote(entry.plan, entry.truckCount);
    if (entry.setupLink) next.setupPaid = Boolean(await paidOrder(entry.setupLink,15000));
    if (!entry.subscriptionLink) return next;
    const payment = await paidOrder(entry.subscriptionLink,q.amount);
    if (!payment) { next.status = 'pending'; next.currentPeriodEnd = 0; return next; }
    const customerId = payment.customer_id;
    if (!customerId) return next;
    let sub;
    if (entry.subscriptionId) ({ subscription: sub } = await api(`/subscriptions/${identity(entry.subscriptionId)}`));
    else {
      let cursor;
      do {
        const result = await api('/subscriptions/search', { query: { filter: { customer_ids: [customerId], location_ids: [locationId] } }, ...(cursor ? { cursor } : {}) });
        sub = result.subscriptions?.find(s => s.plan_variation_id === entry.subscriptionLink.variationId);
        cursor = result.cursor;
      } while (!sub && cursor);
    }
    if (!sub || sub.customer_id !== customerId || sub.location_id !== locationId || sub.plan_variation_id !== entry.subscriptionLink.variationId) return next;
    next.customerId = customerId; next.subscriptionId = sub.id;
    next.currentPeriodEnd = /^\d{4}-\d{2}-\d{2}$/.test(sub.paid_until_date || '') ? Date.parse(`${sub.paid_until_date}T00:00:00Z`)/1000 : 0;
    next.status = ['CANCELED','DEACTIVATED'].includes(sub.status) ? 'canceled' : sub.status === 'PAUSED' ? 'paused' : sub.status === 'ACTIVE' && next.currentPeriodEnd * 1000 > Date.now() && (!entry.onboardingRequired || next.setupPaid) ? 'active' : 'past_due';
    next.cancelAtPeriodEnd = Boolean(sub.canceled_date || sub.actions?.some(a => a.type === 'CANCEL'));
    // Invoice URLs let the customer resolve failed renewals directly at Square.
    if (sub.invoice_ids?.length) {
      const { invoice } = await api(`/invoices/${identity(sub.invoice_ids[0])}`);
      if (invoice.subscription_id === sub.id && invoice.public_url) {
        const url = new URL(invoice.public_url);
        if (url.protocol === 'https:' && ['squareup.com','squareupsandbox.com'].some(h => url.hostname === h || url.hostname.endsWith(`.${h}`))) next.invoiceUrl = url.href;
      }
    }
    next.updatedAt = Date.now();
    return next;
  }
  async function cancel(entry) {
    if (!entry.subscriptionId || entry.environment !== environment) throw fail(409,'No matching Square subscription exists.');
    const { subscription } = await api(`/subscriptions/${identity(entry.subscriptionId)}/cancel`, {});
    return { ...entry, cancelAtPeriodEnd: true, status: subscription.status === 'CANCELED' ? 'canceled' : entry.status, updatedAt: Date.now() };
  }
  async function configureWebhook() {
    const url = new URL('/api/square/webhook',returnUrl()).href;
    const { subscription } = await api('/webhooks/subscriptions', { idempotency_key:key(`${environment}:${url}`,'webhook').slice(0,45), subscription: { name:'Harper billing', notification_url:url, enabled:true, api_version:'2026-08-19', event_types:['payment.updated','refund.updated','subscription.created','subscription.updated','invoice.payment_made','invoice.scheduled_charge_failed'] } });
    if (!subscription.signature_key || subscription.notification_url !== url) throw fail(502,'Square webhook configuration was incomplete.');
    return { id:subscription.id, url, secret:subscription.signature_key, environment };
  }
  async function testWebhook(id) {
    const response = await api(`/webhooks/subscriptions/${identity(id)}/test`, {event_type:'payment.updated'});
    const r = response.subscription_test_result || response.test_result;
    return { statusCode:r?.status_code || null, passed:r?.status_code === 200, pending:!r?.status_code };
  }
  function event(raw, signature, config) {
    const secret = config?.environment === environment ? config.secret : env[sandbox ? 'SQUARE_SANDBOX_WEBHOOK_SIGNATURE_KEY' : 'SQUARE_WEBHOOK_SIGNATURE_KEY'];
    const url = config?.environment === environment ? config.url : env.SQUARE_WEBHOOK_URL;
    if (!secret || !url) throw fail(503,'Square webhook signing is not configured.');
    const expected = crypto.createHmac('sha256', secret).update(url).update(raw).digest('base64');
    if (typeof signature !== 'string' || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) throw fail(400,'Invalid Square webhook signature.');
    let value; try { value = JSON.parse(raw); } catch { throw fail(400,'Invalid webhook payload.'); }
    if (!value.event_id || typeof value.type !== 'string') throw fail(400,'Invalid webhook event.');
    return value;
  }
  return { environment, ready, verify, createLink, refresh, cancel, event, configureWebhook, testWebhook };
}
module.exports = { createSquareBilling, quote, entitled };
