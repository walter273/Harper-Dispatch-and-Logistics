// One command that reports exactly how far billing has got, and what is
// blocking the next step. Read-only: it never changes a variable, contacts no
// provider, and prints no secret values.
//
//   npm run billing:check
//
// Exit code 0 means the current stage is complete and the next step is safe to
// start. Exit code 1 means something is blocking, and the output names it.
//
// This exists because the launch path used to require a lot of guessing about
// which variable to read next and what it implied. Every stage below is derived
// from the same conditions the server itself enforces, so this cannot report a
// stage as done when the server would disagree.
const fs = require('node:fs');
const path = require('node:path');
const env = process.env;
const rows = [];
let blocking = null;
const add = (label, ok, detail) => rows.push({ label, ok, detail });
const present = name => Boolean(String(env[name] || '').trim());

const store = (() => {
  const file = env.HARPER_DATA_FILE || path.join(__dirname, '..', 'data', 'harper-store.json');
  try { return { file, value: JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) }; }
  catch { return { file, value: null }; }
})();

const production = env.SQUARE_ENVIRONMENT === 'production';
const liveSwitch = env.SQUARE_LIVE_PAYMENTS_ENABLED === 'true';
const sandboxCreds = present('SQUARE_SANDBOX_ACCESS_TOKEN') && present('SQUARE_SANDBOX_LOCATION_ID');
const productionCreds = present('SQUARE_ACCESS_TOKEN') && present('SQUARE_LOCATION_ID');
const enforce = env.HARPER_REQUIRE_SUBSCRIPTION === 'true';

// --- Stage 1: credentials -------------------------------------------------
add('Sandbox credentials', sandboxCreds, sandboxCreds ? 'present' : 'SQUARE_SANDBOX_ACCESS_TOKEN and SQUARE_SANDBOX_LOCATION_ID are required');
add('Production credentials', productionCreds, productionCreds ? 'present' : 'SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID are required before going live');
if (!sandboxCreds && !productionCreds) blocking = 'No Square credentials are set at all.';

// The same interlock the server applies, surfaced as a plan instead of a wall.
const interlock = productionCreds && production && liveSwitch;
add('Live collection interlock', interlock || !production,
  production
    ? (interlock ? 'SQUARE_ENVIRONMENT=production, production credentials set, and SQUARE_LIVE_PAYMENTS_ENABLED=true'
                  : 'production environment is selected but live collection is still locked')
    : 'not in production, so live collection is correctly locked');

// --- Stage 2: webhook ------------------------------------------------------
const webhook = store.value?.squareWebhook;
const signatureKey = production ? present('SQUARE_WEBHOOK_SIGNATURE_KEY') : present('SQUARE_SANDBOX_WEBHOOK_SIGNATURE_KEY');
add('Webhook subscription', Boolean(webhook),
  webhook
    ? (signatureKey
        ? 'stored, and a signature key is also set in the environment (durable)'
        : 'stored in the runtime store, but no signature key is set in the environment')
    : 'not configured; set SQUARE_CONFIGURE_WEBHOOK=true once and redeploy');
if (!webhook && !blocking) blocking = 'Square webhooks are not configured, so paid state would never be confirmed.';

// --- Stage 3: evidence -----------------------------------------------------
const fixture = (store.value?.squareBilling || []).find(entry => entry.sandboxFixture);
const smokeRan = Boolean(fixture);
add('Sandbox purchase evidence', smokeRan,
  smokeRan ? 'a sandbox subscription was created and reconciled to active'
           : 'no sandbox checkout has been completed yet');
if (!smokeRan && !blocking) blocking = 'No sandbox purchase has been proven yet. Do not enable live payments before one is.';

// --- Stage 4: the gate -----------------------------------------------------
// In sandbox, billing.ready is normally true: that only means sandbox checkout
// works, and it is never real charges. Do not label it as live collection.
add('Live collection', liveSwitch && production,
  production && liveSwitch ? 'ENABLED - real charges can be taken'
                           : 'locked (safe default)');
if (!enforce) {
  add('Subscription enforcement', false, 'HARPER_REQUIRE_SUBSCRIPTION is not set, so unpaid accounts can still reach operations');
} else if (liveSwitch) {
  add('Subscription enforcement', true, 'enabled while live collection is on; unpaid non-admin accounts are refused');
} else {
  add('Subscription enforcement', false, 'enabled but not ready: no production subscription can exist while sandbox is selected, so this would lock every carrier, broker and shipper out');
  if (!blocking) blocking = 'HARPER_REQUIRE_SUBSCRIPTION is on too early and would lock out all paying roles.';
}

const width = Math.max(...rows.map(r => r.label.length));
for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'BLOCK'}  ${r.label.padEnd(width)}  ${r.detail}`);
console.log('');
console.log(`Environment : ${production ? 'production' : 'sandbox'}`);
console.log(`Data store  : ${store.file}`);
if (!store.value) {
  console.log('Note        : no runtime store was readable here, so webhook and purchase evidence');
  console.log('              could not be confirmed. Run this on the deployed environment, or against');
  console.log('              the mounted volume, to see the real state.');
}

console.log('');
if (blocking) {
  console.log(`Not ready. ${blocking}`);
  console.log('');
  console.log('Next step:');
  if (!sandboxCreds && !productionCreds) console.log('  Set SQUARE_SANDBOX_ACCESS_TOKEN and SQUARE_SANDBOX_LOCATION_ID.');
  else if (!webhook) console.log('  Set SQUARE_CONFIGURE_WEBHOOK=true, redeploy, then confirm the log says the subscription was configured.');
  else if (!smokeRan) console.log('  Sign in as a carrier, broker or shipper and complete a SANDBOX checkout, then cancel it. Admin accounts are exempt and prove nothing.');
  else if (!production) console.log('  Sandbox purchase proven. Review the tax position, then set SQUARE_ENVIRONMENT=production and SQUARE_LIVE_PAYMENTS_ENABLED=true and redeploy.');
  else if (!ready) console.log('  Production is selected. Set SQUARE_LIVE_PAYMENTS_ENABLED=true to enable real charges, after the tax review.');
  else console.log('  Live collection is enabled. Complete one real purchase, then set HARPER_REQUIRE_SUBSCRIPTION=true.');
  process.exit(1);
}

console.log('Ready for the next step.');
if (!production) console.log('Next: review the tax position, then go live.');
else if (!enforce) console.log('Next: complete one real purchase, then set HARPER_REQUIRE_SUBSCRIPTION=true.');
else console.log('Billing is fully configured and enforced.');
process.exit(0);
