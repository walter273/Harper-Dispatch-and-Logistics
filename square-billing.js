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
    cadence: isDispatchPlan(plan) ? 'WEEKLY' : 'MONTHLY', name: isDispatchPlan(plan) ? `${plans[plan].name} â€” ${trucks} truck(s)` : plan === 'broker' ? 'Broker Desk' : 'Shipper Control' };
}
function entitled(record, now = Date.now()) {
  return record?.provider === 'square' && record.environment === 'production' && record.status === 'active' && record.currentPeriodEnd * 1000 > now;
}
function periodEnd(date, timezone = 'UTC') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return 0;
  try {
    const target = Date.parse(`${date}T00:00:00Z`) + 86400000;
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' });
    let instant = target;
    for (let i=0;i<4;i++) {
      const p = Object.fromEntries(fmt.formatToParts(new Date(instant)).map(p=>[p.type,p.value]));
      const local = Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
      instant += target-local;
    }
    return instant/1000;
  } catch { return 0; }
}
function createSquareBilling(env = process.env, fetchImpl = fetch) {
  const environment = env.SQUARE_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
  const sandbox = environment === 'sandbox';
  const token = env[sandbox ? 'SQUARE_SANDBOX_ACCESS_TOKEN' : 'SQUARE_ACCESS_TOKEN'];
  const locationId = env[sandbox ? 'SQUARE_SANDBOX_LOCATION_ID' : 'SQUARE_LOCATION_ID'];
  const base = sandbox ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
  const ready = Boolean(token && locationId && (sandbox || env.SQUARE_LIVE_PAYMENTS_ENABLED === 'true'));
  async function api(path, body, method = body ? 'POST' : 'GET') {
    const connectionRead = method === 'GET' && path === `/locations/${identity(locationId)}` && token && locationId;
    if (!ready && !connectionRead) throw fail(503, 'Square payments are not enabled. Contact Harper for assistance.');
    let response, data;
    try {
      response = await fetchImpl(`${base}/v2${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Square-Version': '2026-08-19', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
      data = await response.json();
    } catch { throw fail(502, 'Square is unavailable. Please retry; the same payment request will be reused.'); }
    if (!response.ok || data.errors?.length) throw fail(502, `Square could not complete this step (${String(data.errors?.[0]?.code || response.status).replace(/[^A-Z0-9_]/g, '').slice(0,60)}).`);
    return data;
  }
  function returnUrl() {
    const url = new URL(env.HARPER_PUBLIC_ORIGIN || 'http://localhost:4173');
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || (url.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && ['localhost','127.0.0.1'].includes(url.hostname)))) throw fail(503, 'Configure the secure Harper website address.');
    return `${url.origin}/square-billing.html`;
  }
  async function verify() {
    const { location } = await api(`/locations/${identity(locationId)}`);
    if (location?.id !== locationId || location.status !== 'ACTIVE' || location.currency !== 'USD' || !location.capabilities?.includes('CREDIT_CARD_PROCESSING')) throw fail(503, 'Square location is not ready for USD card payments.');
    return { environment, locationId, merchantId: location.merchant_id, businessName: location.business_name || location.name, ready: true, collectionEnabled: ready && !sandbox };
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
      quick_pay: { name: `${sandbox ? 'TEST â€” ' : ''}${setup ? 'Harper fleet onboarding â€” one time' : q.name}`, price_money: money(setup ? 15000 : q.amount), location_id: locationId },
      checkout_options: { redirect_url: returnUrl(), allow_tipping: false, ...(variationId ? { subscription_plan_id: variationId } : {}) },
      description: `Harper checkout ${entry.id} ${setup ? 'onboarding' : 'subscription'}`
    });
    const url = new URL(link.url);
    if (url.protocol !== 'https:' || url.username || url.password || !['square.link','checkout.square.site','sandbox.square.link','sandbox.checkout.square.site'].includes(url.hostname)) throw fail(502, 'Square returned an unexpected checkout address.');
    return { id: link.id, orderId: link.order_id, url: link.url, ...(variationId ? { variationId } : {}) };
  }
  async function paymentEvidence(link, expected) {
    const { order } = await api(`/orders/${identity(link.orderId)}`);
    // Paid digital orders can remain OPEN until fulfillment is completed.
    // The independently retrieved COMPLETED payment is the payment authority.
    if (order?.location_id !== locationId || order.total_money?.currency !== 'USD' || order.total_money.amount !== expected || !['OPEN','COMPLETED'].includes(order.state)) return { status:'pending' };
    for (const tender of order.tenders || []) {
      if (!tender.payment_id && !tender.id) continue;
      const { payment } = await api(`/payments/${identity(tender.payment_id || tender.id)}`);
      const matching = payment.order_id === order.id && payment.location_id === locationId && payment.amount_money?.amount === expected && payment.amount_money.currency === 'USD';
      if (!matching) continue;
      if (payment.status === 'COMPLETED' && !(payment.refunded_money?.amount > 0)) return { status:'paid', payment:{ ...payment, customer_id:payment.customer_id || order.customer_id } };
      if (payment.status === 'FAILED' || payment.status === 'CANCELED' || payment.refunded_money?.amount > 0) return { status:'past_due' };
    }
    return { status:'pending' };
  }
  async function paidOrder(link, expected) {
    const evidence = await paymentEvidence(link, expected);
    return evidence.status === 'paid' ? evidence.payment : null;
  }
  async function refresh(entry) {
    if (entry.environment !== environment) throw fail(409, 'This checkout belongs to another payment environment.');
    const next = structuredClone(entry), q = quote(entry.plan, entry.truckCount);
    if (entry.setupLink) next.setupPaid = Boolean(await paidOrder(entry.setupLink,15000));
    if (!entry.subscriptionLink) return next;
    const initialPayment = await paymentEvidence(entry.subscriptionLink,q.amount);
    const payment = initialPayment.payment;
    if (!payment) { next.status = initialPayment.status; next.currentPeriodEnd = 0; return next; }
    let customerId = payment.customer_id || entry.customerId;
    let sub;
    if (entry.subscriptionId) ({ subscription: sub } = await api(`/subscriptions/${identity(entry.subscriptionId)}`));
    else {
      let cursor;
      do {
        const result = await api('/subscriptions/search', { query: { filter: { ...(customerId ? {customer_ids: [customerId]} : {}), location_ids: [locationId] } }, ...(cursor ? { cursor } : {}) });
        sub = result.subscriptions?.find(s => s.plan_variation_id === entry.subscriptionLink.variationId);
        cursor = result.cursor;
      } while (!sub && cursor);
    }
    // Every checkout has its own immutable variation. This provides linkage when
    // Square omits customer_id on the initial payment; never match by email.
    if (!sub || (customerId && sub.customer_id !== customerId) || sub.location_id !== locationId || sub.plan_variation_id !== entry.subscriptionLink.variationId) return next;
    customerId = sub.customer_id;
    next.customerId = customerId; next.subscriptionId = sub.id;
    // charged_through_date means invoiced, not paid. Verify the newest invoice
    // and its actual payment before using that inclusive billing date.
    let invoice, invoicePaid = false;
    if (sub.invoice_ids?.length) {
      ({ invoice } = await api(`/invoices/${identity(sub.invoice_ids[0])}`));
      if (invoice.subscription_id === sub.id && invoice.location_id === locationId && invoice.primary_recipient?.customer_id === customerId && invoice.status === 'PAID' && invoice.order_id) {
        invoicePaid = Boolean(await paidOrder({orderId:invoice.order_id},q.amount));
      }
    }
    next.currentPeriodEnd = invoicePaid ? periodEnd(sub.charged_through_date,sub.timezone) : 0;
    if (sandbox && entry.sandboxFixture && env.SQUARE_SANDBOX_SMOKE_TEST === 'true') console.log('Square TEST subscription evidence: ' + JSON.stringify({status:sub.status,invoiceStatus:invoice?.status || null,invoicePaid,currentPeriodEnd:next.currentPeriodEnd}));
    next.status = sub.status === 'CANCELED' ? 'canceled' : sub.status === 'DEACTIVATED' ? 'unpaid' : sub.status === 'PAUSED' ? 'paused' : sub.status === 'ACTIVE' && next.currentPeriodEnd * 1000 > Date.now() && (!entry.onboardingRequired || next.setupPaid) ? 'active' : 'past_due';
    next.cancelAtPeriodEnd = Boolean(sub.canceled_date || sub.actions?.some(a => a.type === 'CANCEL'));
    // Invoice URLs let the customer resolve failed renewals directly at Square.
    if (invoice) {
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
    const { subscription } = await api('/webhooks/subscriptions', { idempotency_key:key(`${environment}:${url}`,'webhook').slice(0,45), subscription: { name:'Harper billing', notification_url:url, enabled:true, api_version:'2026-08-19', event_types:['payment.created','payment.updated','refund.updated','subscription.created','subscription.updated','invoice.payment_made','invoice.scheduled_charge_failed'] } });
    if (!subscription.signature_key || subscription.notification_url !== url) throw fail(502,'Square webhook configuration was incomplete.');
    return { id:subscription.id, url, secret:subscription.signature_key, environment };
  }
  async function sandboxSubscriptionFixture(entry) {
    if (!sandbox || entry.environment !== 'sandbox' || entry.companyId !== 'TEST-SQUARE-INTEGRATION' || !entry.subscriptionLink) throw fail(403,'Test subscription fixtures are restricted to the sandbox integration test.');
    const testEmail = env.SQUARE_SANDBOX_TEST_EMAIL;
    if (!testEmail || !/^[^@]+@[^@]+\.[^@]+$/.test(testEmail)) throw fail(503,'An approved test receipt email is required.');
    const fixtureKey = entry.id + ':' + testEmail;
    const {customer} = await api('/customers',{idempotency_key:key(fixtureKey,'test-customer'),given_name:'TEST Harper',family_name:'Integration',email_address:testEmail});
    const {card} = await api('/cards',{idempotency_key:key(fixtureKey,'test-card').slice(0,45),source_id:'cnon:card-nonce-ok',card:{customer_id:customer.id,cardholder_name:'TEST Harper Integration'}});
    const {subscription} = await api('/subscriptions',{idempotency_key:key(fixtureKey,'test-subscription'),location_id:locationId,customer_id:customer.id,card_id:card.id,plan_variation_id:entry.subscriptionLink.variationId});
    return { ...entry, customerId:customer.id, subscriptionId:subscription.id, sandboxFixture:true, sandboxFixtureVersion:2 };
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
  return { environment, ready, verify, createLink, refresh, cancel, event, configureWebhook, testWebhook, sandboxSubscriptionFixture };
}
module.exports = { createSquareBilling, quote, entitled, periodEnd };
