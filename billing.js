const crypto = require('node:crypto');
const Stripe = require('stripe');

const { plans: dispatchPlans, isDispatchPlan, termsVersion } = require('./dispatch-plans');
const AMOUNTS = Object.freeze({ shipper: 79900, broker: 29900, ...Object.fromEntries(Object.entries(dispatchPlans).map(([id, plan]) => [id, plan.weeklyCents])) });
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });

// Mode is configured server-side. Test mode remains the default; never trust browser input.
function createBilling(env = process.env, client) {
  const key = env.STRIPE_SECRET_KEY || '';
  const live = env.STRIPE_MODE === 'live';
  // Installing credentials must not start collection before the launch checks pass.
  const collectionEnabled = !live || env.STRIPE_LIVE_PAYMENTS_ENABLED === 'true';
  const portalConfigured = /^bpc_[A-Za-z0-9]+$/.test(env.STRIPE_PORTAL_CONFIGURATION_ID || '');
  const keyMatchesMode = () => (live ? /^[sr]k_live_/ : /^[sr]k_test_/).test(key);
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
    ready: Boolean(stripe && key && keyMatchesMode() && expectedAccount && env.STRIPE_WEBHOOK_SECRET && collectionEnabled && (!live || portalConfigured)),
    async checkout(plan, email, actor, requestId, options = {}) {
      const dispatch = isDispatchPlan(plan);
      if (dispatch && options.billingMethod !== undefined && options.billingMethod !== 'weekly') throw fail(400, 'Percentage billing requires a dispatch review request, not a weekly subscription.');
      const truckCount = dispatch ? Number(options.truckCount ?? 1) : 1;
      if (!Number.isInteger(truckCount) || truckCount < 1 || truckCount > 100) throw fail(400, 'Choose a whole-number truck count from 1 to 100.');
      if (!Object.hasOwn(AMOUNTS, plan)) throw fail(400, 'Choose a supported subscription plan.');
      if (!stripe || !key) throw fail(503, 'Stripe is not configured yet.');
      if (!keyMatchesMode()) throw fail(503, 'Stripe key does not match the configured payment mode.');
      if (!collectionEnabled) throw fail(503, 'Live payments are awaiting the final billing and tax checks.');
      if (live && !portalConfigured) throw fail(503, 'The Stripe customer portal must be configured before accepting live payments.');
      if (!/^acct_[A-Za-z0-9]+$/.test(expectedAccount)) throw fail(503, 'The Stripe account ID is not configured.');
      const priceId = env[`STRIPE_PRICE_${plan.toUpperCase().replaceAll('-', '_')}`];
      if (!priceId) throw fail(503, `Stripe price is not configured for the ${plan} plan.`);
      if (!env.STRIPE_WEBHOOK_SECRET) throw fail(503, 'Stripe webhook signing is not configured yet.');
      if (!/^[a-f0-9-]{36}$/i.test(requestId || '')) throw fail(400, 'A checkout request ID is required.');
      const urls = redirects();
      try {
        const [account, price] = await Promise.all([stripe.accounts.retrieve(), stripe.prices.retrieve(priceId)]);
        if (account.id !== expectedAccount || (live && account.charges_enabled !== true) || price.livemode !== live || !price.active
          || price.currency !== 'usd' || price.unit_amount !== AMOUNTS[plan]
          || price.recurring?.interval !== (dispatch ? 'week' : 'month') || price.recurring?.interval_count !== 1
          || price.recurring?.usage_type !== 'licensed') {
          throw fail(503, 'Stripe account or plan configuration does not match the configured payment mode.');
        }
        const onboardingRequired = dispatch && options.onboardingRequired === true;
        const lineItems = [{ price: priceId, quantity: truckCount }];
        if (onboardingRequired) {
          const onboardingId = env.STRIPE_PRICE_CARRIER_ONBOARDING;
          if (!onboardingId) throw fail(503, 'Carrier onboarding price is not configured.');
          const onboarding = await stripe.prices.retrieve(onboardingId);
          if (!onboarding.active || onboarding.livemode !== live || onboarding.currency !== 'usd' || onboarding.unit_amount !== 15000 || onboarding.type !== 'one_time') throw fail(503, 'Carrier onboarding price must be a one-time USD 150 fee.');
          lineItems.push({ price: onboardingId, quantity: 1 });
        }
        const metadata = { plan, ...(dispatch ? { truckCount: String(truckCount), onboardingCharged: String(onboardingRequired), billingMethod: 'weekly', revenueFeePercent: '0', termsVersion } : {}), ...(actor ? { userId: actor.id, companyId: actor.companyId } : {}) };
        const session = await stripe.checkout.sessions.create({
          mode: 'subscription', ...urls,
          integration_identifier: 'alphaway_dispatch_' + Array.from(crypto.createHash('sha256').update(requestId).digest().subarray(0, 8), byte => String.fromCharCode(97 + byte % 26)).join(''),
          line_items: lineItems,
          ...(dispatch ? { custom_text: { submit: { message: 'Weekly dispatch billing includes app access. No percentage fee is added. Fleet onboarding is charged once. Service and any pause require dispatch confirmation.' } } } : {}),
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
      if (event.livemode !== live || (event.account && event.account !== expectedAccount)) {
        throw fail(400, 'This endpoint accepts only events from the configured account and payment mode.');
      }
      return event;
    },
    async portal(customerId) {
      if (!stripe || !key || !/^acct_[A-Za-z0-9]+$/.test(expectedAccount)) throw fail(503, 'Stripe is not configured yet.');
      if (!keyMatchesMode() || !/^cus_[A-Za-z0-9]+$/.test(customerId || '')) throw fail(400, 'No Stripe customer is linked to this account.');
      try {
        const account = await stripe.accounts.retrieve();
        if (account.id !== expectedAccount) throw fail(503, 'Stripe account configuration does not match the configured payment mode.');
        const returnUrl = new URL('/workspace.html', redirects().success_url).href;
        const configuration = env.STRIPE_PORTAL_CONFIGURATION_ID || '';
        if (live && !configuration) throw fail(503, 'The Stripe customer portal is not configured yet.');
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
