const Stripe = require('stripe');
const { plans } = require('./dispatch-plans');

// Read-only, administrator-only configuration evidence. Never authorizes collection.
function createBillingReview(env = process.env, client) {
  let cached, pending;
  async function run() {
    const checks = [];
    const add = (name, status, detail) => checks.push({ name, status, detail });
    const live = env.STRIPE_MODE === 'live';
    const key = env.STRIPE_SECRET_KEY || '';
    const modeMatches = (live ? /^[sr]k_live_/ : /^[sr]k_test_/).test(key);
    add('Payment connection', modeMatches ? 'pass' : 'fix', modeMatches ? 'Server key matches the configured payment mode.' : 'The payment key is missing or uses the wrong mode.');
    const stripe = client || (modeMatches ? new Stripe(key, { timeout: 8000, maxNetworkRetries: 0 }) : null);
    const check = async (name, fn) => {
      try { await fn(); } catch { add(name, 'unknown', 'Could not read this setting. Check connection or key permissions.'); }
    };
    if (stripe && modeMatches) {
      let accountMatches = false;
      await check('Stripe account', async () => {
        const a = await stripe.accounts.retrieve();
        accountMatches = a.id === env.STRIPE_ACCOUNT_ID;
        add('Stripe account', accountMatches && a.charges_enabled && a.payouts_enabled && !a.requirements?.currently_due?.length ? 'pass' : 'fix',
          !accountMatches ? 'The key belongs to a different account.' : a.charges_enabled && a.payouts_enabled && !a.requirements?.currently_due?.length ? 'Correct account; charges and payouts enabled; no current requirements.' : 'Stripe account activation needs attention.');
      });
      if (accountMatches) {
        const specs = [...Object.entries(plans).map(([name, p]) => [name.toUpperCase().replaceAll('-', '_'), p.weeklyCents, 'week']), ['CARRIER_ONBOARDING', 15000, null], ['SHIPPER', 79900, 'month'], ['BROKER', 29900, 'month']];
        await Promise.all(specs.map(([name, amount, interval]) => check(name.replaceAll('_', ' '), async () => {
          const label = name.replaceAll('_', ' '), id = env[`STRIPE_PRICE_${name}`];
          if (!id) return add(label, 'fix', 'Price is not configured.');
          const p = await stripe.prices.retrieve(id, { expand: ['product'] });
          const matches = p.active && p.product?.active === true && p.livemode === live && p.currency === 'usd' && p.unit_amount === amount && (interval ? p.recurring?.interval === interval && p.recurring?.interval_count === 1 && p.recurring?.usage_type === 'licensed' : p.type === 'one_time');
          add(label, matches ? 'pass' : 'fix', matches ? `$${(amount / 100).toFixed(2)} ${interval ? 'per ' + interval : 'once'} matches the website.` : 'Price, currency, frequency, product status or payment mode does not match.');
          add(label + ' tax setup', p.product?.tax_code && ['inclusive', 'exclusive'].includes(p.tax_behavior) ? 'review' : 'fix', p.product?.tax_code && ['inclusive', 'exclusive'].includes(p.tax_behavior) ? 'A tax code and price tax treatment are set; their suitability still needs confirmation.' : 'Product tax code or explicit price tax treatment is missing.');
        })));
        await Promise.all([
          check('Customer billing portal', async () => {
            if (!env.STRIPE_PORTAL_CONFIGURATION_ID) return add('Customer billing portal', 'fix', 'Billing portal is not configured.');
            const p = await stripe.billingPortal.configurations.retrieve(env.STRIPE_PORTAL_CONFIGURATION_ID);
            const f = p.features || {};
            const ok = p.active && p.livemode === live && f.invoice_history?.enabled && f.payment_method_update?.enabled && f.subscription_cancel?.enabled && f.subscription_cancel.mode === 'at_period_end' && f.subscription_update?.enabled === false && p.default_return_url === new URL('/workspace.html', env.STRIPE_PUBLIC_BASE_URL).href;
            add('Customer billing portal', ok ? 'pass' : 'fix', ok ? 'Invoices, payment methods and end-of-period cancellation are configured.' : 'Portal settings differ from the approved billing flow.');
          }),
          check('Stripe Tax settings', async () => {
            const t = await stripe.tax.settings.retrieve();
            add('Stripe Tax settings', t.status === 'active' ? 'review' : 'fix', t.status === 'active' ? 'Stripe Tax settings are active. This does not prove tax collection is enabled or required.' : 'Stripe Tax settings are incomplete.');
          }),
          check('Tax registrations', async () => {
            const r = await stripe.tax.registrations.list({ status: 'active', limit: 100 });
            add('Tax registrations', 'review', `${r.data.length}${r.has_more ? '+' : ''} active registrations found. Confirm which jurisdictions actually require registration; zero does not mean exempt.`);
          })
        ]);
      }
    }
    add('Webhook signing', env.STRIPE_WEBHOOK_SECRET ? 'review' : 'fix', env.STRIPE_WEBHOOK_SECRET ? 'Signing setting exists. Actual Stripe delivery and access updates still require an end-to-end test.' : 'Webhook signing setting is missing.');
    add('Tax decision', 'review', 'Owner review is still required for service classification, registrations and tax treatment. This check cannot approve those decisions.');
    add('Tax calculation in Checkout', 'review', 'The current Checkout integration does not request automatic tax calculation. Resolve tax treatment before launch.');
    return { checkedAt: new Date().toISOString(), liveCollectionEnabled: env.STRIPE_LIVE_PAYMENTS_ENABLED === 'true', launchApproved: false, checks };
  }
  return async () => {
    if (cached && Date.now() - cached.time < 60000) return cached.report;
    if (!pending) pending = run().then(report => { cached = { time: Date.now(), report }; return report; }).finally(() => { pending = null; });
    return pending;
  };
}
module.exports = { createBillingReview };
