// Provisions the Twilio voice application and records its SID in the runtime
// store. This is the offline equivalent of the admin-only POST /api/voice/setup,
// for use on a trusted machine where the signed-in admin session is not handy.
//
//   npm run voice:setup
//
// It contacts Twilio, so it is NOT read-only and must never run in CI. It creates
// at most one TwiML App, reuses an existing matching App when one is found, and
// stores only the resulting App SID. It prints no secret values.
const fs = require('node:fs');
const path = require('node:path');
const { createBrowserVoice } = require('../browser-voice');

const dataFile = process.env.HARPER_DATA_FILE || path.join(__dirname, '..', 'data', 'harper-store.json');

let store;
try {
  store = JSON.parse(fs.readFileSync(dataFile, 'utf8').replace(/^\uFEFF/, ''));
} catch {
  console.error(`Cannot read the runtime store at ${dataFile}. Start the app once so it is created, then retry.`);
  process.exit(1);
}

// Persist through the same shape the server writes, so a store rewritten later
// by server.js normalizes cleanly. Only voiceAppSid is touched here.
const voice = createBrowserVoice({
  env: process.env,
  getStore: () => store,
  persist: () => fs.writeFileSync(dataFile, JSON.stringify(store, null, 2), { mode: 0o600 }),
});

if (!voice.state().configured) {
  console.error('Browser calling is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_VOICE_API_KEY_SID,');
  console.error('TWILIO_VOICE_API_KEY_SECRET and TWILIO_AUTH_TOKEN, then re-run "npm run voice:check".');
  process.exit(1);
}

voice.setup()
  .then((state) => {
    console.log(`Twilio voice application is ready in the ${state.configured ? 'configured' : 'unconfigured'} environment.`);
    console.log(`App SID stored in ${dataFile}.`);
    console.log('Run "npm run voice:check" to confirm, then sign in as an admin to place a test call.');
  })
  .catch((error) => {
    console.error(`Voice setup failed: ${error.message}`);
    console.error('Confirm the API key is a Voice API key with access to Applications, and that the account SID matches it.');
    process.exit(1);
  });
