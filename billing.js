const crypto = require('node:crypto');
const Stripe = require('stripe');

const AMOUNTS = Object.freeze({ carrier: 59900, shipper: 79900, broker: 29900 });
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });

// Test-mode only while launch authorization is pending. Never infer mode from a browser request.
function createBilling(env = process.env, client) {
  const key = env.STRIPE_SECRET_KEY || '';
  const expectedAccount = env.STRIPE_ACCOUNT_ID || '';
  const stripe = client || (key ? new Stripe(key, { timeout: 10000, maxNetworkRetries: 1 }) : null);
  const webhookStripe = stripe || new Stripe('unused-webhook-verifier');
  function redirects() {
    try {
      const base = new URL(env.STRIPE_PUBLIC_BASE_URL || `http://127.0.0.1:${env.PORT || 4173}`);
      const local = ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname);
      if (base.username || base.password || base.pathname !== '/' || base.search || base.hash
        || (base.protocol !== 'https:' && !(local && base.protocol === 'http:' && env.NODE_ENV !== 'production'))) throw new Error();
      return Object.fromEntries([
        ['success_url', env.STRIPE_SUCCESS_URL || `${base.origin}/workspace.html?billing=success`],
        ['cancel_url', env.STRIPE_CANCEL_URL || `${base.origin}/#plans`]
      ].map(([name, value]) => {
        const url = new URL(value);
        if (url.origin !== base.origin || url.username || url.password) throw new Error();
        return [name, value];
      }));
    } catch {
      throw fail(503, 'Stripe return URLs must use the configured app origin (HTTPS when hosted).');
    }
  }
  return {
    async checkout(plan, email, actor, requestId) {
      if (!Object.hasOwn(AMOUNTS, plan)) throw fail(400, 'Choose a supported subscription plan.');
      if (!stripe || !key) throw fail(503, 'Stripe is not configured yet.');
      if (!/^[sr]k_test_/.test(key)) throw fail(503, 'Only the authorized Stripe sandbox is enabled.');
      if (!/^acct_[A-Za-z0-9]+$/.test(expectedAccount)) throw fail(503, 'The Stripe account ID is not configured.');
      const priceId = env[`STRIPE_PRICE_${plan.toUpperCase()}`];
      if (!priceId) throw fail(503, `Stripe price is not configured for the ${plan} plan.`);
      if (!env.STRIPE_WEBHOOK_SECRET) throw fail(503, 'Stripe webhook signing is not configured yet.');
      if (!/^[a-f0-9-]{36}$/i.test(requestId || '')) throw fail(400, 'A checkout request ID is required.');
      const urls = redirects();
      try {
        const [account, price] = await Promise.all([stripe.accounts.retrieve(), stripe.prices.retrieve(priceId)]);
        if (account.id !== expectedAccount || price.livemode !== false || !price.active
          || price.currency !== 'usd' || price.unit_amount !== AMOUNTS[plan]
          || price.recurring?.interval !== 'month' || price.recurring?.interval_count !== 1
          || price.recurring?.usage_type !== 'licensed') {
          throw fail(503, 'Stripe account or monthly plan configuration does not match this sandbox.');
        }
        const metadata = { plan, ...(actor ? { userId: actor.id, companyId: actor.companyId } : {}) };
        const session = await stripe.checkout.sessions.create({
          mode: 'subscription', ...urls,
          line_items: [{ price: priceId, quantity: 1 }],
          metadata, subscription_data: { metadata },
          ...(actor ? { client_reference_id: actor.id } : {}),
          ...(email ? { customer_email: email } : {})
        }, { idempotencyKey: crypto.createHash('sha256').update(`${actor?.id || 'preview'}:${requestId}`).digest('hex') });
        const url = new URL(session.url);
        if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.username || url.password) throw new Error();
        return { url: session.url, sessionId: session.id };
      } catch (error) {
        if (error.statusCode === 503 && !error.type) throw error;
        // Stripe errors may contain request details; never return or log their raw message.
        throw fail(502, 'Stripe Checkout is unavailable. Please retry shortly.');
      }
    },
    event(raw, signature) {
      if (!env.STRIPE_WEBHOOK_SECRET) throw fail(503, 'Stripe webhook signing is not configured yet.');
      if (!/^acct_[A-Za-z0-9]+$/.test(expectedAccount)) throw fail(503, 'The Stripe account ID is not configured.');
      let event;
      try { event = webhookStripe.webhooks.constructEvent(raw, signature, env.STRIPE_WEBHOOK_SECRET); }
      catch { throw fail(400, 'Invalid Stripe webhook signature or payload.'); }
      if (!event || !/^evt_/.test(event.id || '') || typeof event.type !== 'string'
        || !event.data?.object || !Number.isSafeInteger(event.created)) throw fail(400, 'Invalid Stripe event.');
      if (event.livemode !== false || (event.account && event.account !== expectedAccount)) {
        throw fail(400, 'This endpoint accepts only authorized sandbox events.');
      }
      return event;
    },
    async portal(customerId) {
      if (!stripe || !key || !/^acct_[A-Za-z0-9]+$/.test(expectedAccount)) throw fail(503, 'Stripe is not configured yet.');
      if (!/^[sr]k_test_/.test(key) || !/^cus_[A-Za-z0-9]+$/.test(customerId || '')) throw fail(400, 'No Stripe customer is linked to this account.');
      try {
        const account = await stripe.accounts.retrieve();
        if (account.id !== expectedAccount) throw fail(503, 'Stripe account configuration does not match this sandbox.');
        const returnUrl = new URL('/workspace.html', redirects().success_url).href;
        const configuration = env.STRIPE_PORTAL_CONFIGURATION_ID || '';
        if (configuration && !/^bpc_[A-Za-z0-9]+$/.test(configuration)) throw fail(503, 'The Stripe customer portal configuration is invalid.');
        const session = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: returnUrl,
          ...(configuration ? { configuration } : {})
        });
        const url = new URL(session.url);
        if (url.protocol !== 'https:' || !url.hostname.endsWith('.stripe.com')) throw new Error();
        return { url: session.url };
      } catch (error) {
        if (error.statusCode === 503 && !error.type) throw error;
        throw fail(502, 'Stripe billing management is unavailable. Please retry shortly.');
      }
    }
  };
}

module.exports = { createBilling };
