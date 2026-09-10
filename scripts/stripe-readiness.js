// Run on a trusted server with secrets supplied by its environment, never CLI arguments.
// Default is read-only. --configure-portal creates/updates only this app's own portal.
const crypto = require('node:crypto');
const Stripe = require('stripe');
const { plans } = require('../dispatch-plans');

const PORTAL_TAG = 'alphaway-customer-billing-v1';
const problem = message => Object.assign(new Error(message), { safe: true });
function configuration(env) {
  const live = env.STRIPE_MODE === 'live';
  if (!(live ? /^[sr]k_live_/ : /^[sr]k_test_/).test(env.STRIPE_SECRET_KEY || '')) {
    throw problem('Missing server key or key does not match STRIPE_MODE. No Stripe changes made.');
  }
  if (!/^acct_[A-Za-z0-9]+$/.test(env.STRIPE_ACCOUNT_ID || '')) throw problem('STRIPE_ACCOUNT_ID is required.');
  let base;
  try { base = new URL(env.STRIPE_PUBLIC_BASE_URL); } catch { throw problem('STRIPE_PUBLIC_BASE_URL is required.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (base.username || base.password || base.pathname !== '/' || base.search || base.hash
    || (base.protocol !== 'https:' && !(base.protocol === 'http:' && local && !live))) {
    throw problem('Use an HTTPS app origin (local HTTP is allowed only in test mode).');
  }
  return { live, origin: base.origin };
}

function portalParameters(origin) {
  return {
    business_profile: { headline: 'Manage your Alphaway Logistics billing' },
    default_return_url: `${origin}/workspace.html`,
    features: {
      customer_update: { enabled: true, allowed_updates: ['name', 'email', 'address', 'tax_id'] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true, mode: 'at_period_end', proration_behavior: 'none',
        cancellation_reason: { enabled: true, options: ['too_expensive', 'unused', 'customer_service', 'other'] }
      },
      // Staffing and truck changes require dispatch review before repricing.
      subscription_update: { enabled: false }
    },
    login_page: { enabled: false },
    metadata: { app: 'alphaway-logistics', purpose: PORTAL_TAG, origin }
  };
}

async function review(env = process.env, { client, configurePortal = false } = {}) {
  const { live, origin } = configuration(env);
  const stripe = client || new Stripe(env.STRIPE_SECRET_KEY, { timeout: 15000, maxNetworkRetries: 1 });
  const account = await stripe.accounts.retrieve();
  if (account.id !== env.STRIPE_ACCOUNT_ID) throw problem('Server key belongs to a different Stripe account. No Stripe changes made.');
  let portal;
  const matches = [];
  for await (const item of stripe.billingPortal.configurations.list({ limit: 100 })) {
    if (item.livemode === live && item.metadata?.purpose === PORTAL_TAG && item.metadata?.origin === origin) matches.push(item);
    if (item.id === env.STRIPE_PORTAL_CONFIGURATION_ID) portal = item;
  }
  if (configurePortal) {
    if (matches.length > 1) throw problem('Multiple app-owned portal configurations exist; select one before making changes.');
    const params = portalParameters(origin);
    portal = matches.length
      ? await stripe.billingPortal.configurations.update(matches[0].id, { ...params, active: true })
      : await stripe.billingPortal.configurations.create(params, {
        idempotencyKey: crypto.createHash('sha256').update(`${PORTAL_TAG}:${account.id}:${live}:${origin}`).digest('hex')
      });
  }
  const checks = {};
  checks.account = { id: account.id, mode: live ? 'live' : 'test', chargesEnabled: account.charges_enabled === true, payoutsEnabled: account.payouts_enabled === true,
    outstandingRequirements: account.requirements?.currently_due || [], disabledReason: account.requirements?.disabled_reason || null };
  checks.portal = portal ? { id: portal.id, active: portal.active, modeMatches: portal.livemode === live,
    cancellationEnabled: portal.features?.subscription_cancel?.enabled === true,
    cancellationMode: portal.features?.subscription_cancel?.mode,
    invoicesEnabled: portal.features?.invoice_history?.enabled === true,
    paymentMethodUpdatesEnabled: portal.features?.payment_method_update?.enabled === true,
    returnUrlMatches: portal.default_return_url === `${origin}/workspace.html`,
    installedInEnvironment: portal.id === env.STRIPE_PORTAL_CONFIGURATION_ID } : { configured: false };
  // This technical review reports facts; it never assigns legal tax categories or registrations.
  const [tax, registrations] = await Promise.all([stripe.tax.settings.retrieve(), stripe.tax.registrations.list({ status: 'active', limit: 100 })]);
  checks.tax = { status: tax.status, country: tax.head_office?.address?.country, region: tax.head_office?.address?.state,
    defaultTaxCode: tax.defaults?.tax_code, defaultTaxBehavior: tax.defaults?.tax_behavior,
    activeRegistrations: registrations.data.map(r => ({ id: r.id, country: r.country, countryOptions: r.country_options })),
    hasMoreRegistrations: registrations.has_more, legalReviewComplete: false };
  const priceSpecs = [
    ...Object.entries(plans).map(([id, plan]) => [id.toUpperCase().replaceAll('-', '_'), plan.weeklyCents, 'week']),
    ['CARRIER_ONBOARDING', 15000, null], ['SHIPPER', 79900, 'month'], ['BROKER', 29900, 'month']
  ];
  checks.prices = [];
  for (const [name, amount, interval] of priceSpecs) {
    const id = env[`STRIPE_PRICE_${name}`];
    if (!id) { checks.prices.push({ plan: name, configured: false }); continue; }
    const price = await stripe.prices.retrieve(id, { expand: ['product'] });
    const product = price.product;
    checks.prices.push({ plan: name, id, amount: price.unit_amount, currency: price.currency,
      matches: price.active && product.active === true && price.livemode === live && price.unit_amount === amount && price.currency === 'usd'
        && (interval ? price.recurring?.interval === interval && price.recurring?.interval_count === 1 && price.recurring?.usage_type === 'licensed' : price.type === 'one_time'),
      taxCode: typeof product.tax_code === 'string' ? product.tax_code : product.tax_code?.id || null,
      taxBehavior: price.tax_behavior });
  }
  checks.liveCollectionEnabled = env.STRIPE_LIVE_PAYMENTS_ENABLED === 'true';
  checks.endToEndPaymentAndCancellation = 'Not verified by this configuration review';
  return checks;
}

if (require.main === module) {
  review(process.env, { configurePortal: process.argv.includes('--configure-portal') })
    .then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch(error => {
      // Upstream error payloads can contain request data. Report only our own safe messages.
      process.stderr.write(`${error.safe ? error.message : 'Stripe configuration review failed. Check server-key permissions and account configuration; credentials and upstream request data were withheld.'}\n`);
      process.exitCode = 1;
    });
}
module.exports = { review, configuration, portalParameters };
