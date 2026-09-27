// Reports whether browser calling is ready to use, without contacting Twilio
// and without printing any secret value. Read-only: it never provisions, never
// mutates the runtime store, and never writes credentials anywhere.
//
//   npm run voice:check
//
// Exit code 0 means every requirement is present. Exit code 1 means browser
// calling is not usable yet, and the output says exactly which piece is missing.
const fs = require('node:fs');
const path = require('node:path');

const env = process.env;
const rows = [];
let ready = true;
const add = (label, ok, detail) => { rows.push({ label, ok, detail }); if (!ok) ready = false; };

// Mirrors the account-SID shape check in browser-voice.js so this cannot report
// "ready" for a value the server would reject at runtime.
const account = env.TWILIO_ACCOUNT_SID || '';
add('TWILIO_ACCOUNT_SID', /^AC[0-9a-f]{32}$/.test(account), /^AC[0-9a-f]{32}$/.test(account) ? `set (${account.slice(0, 4)}…)` : 'must match AC followed by 32 hex characters');
for (const [name, hint] of [['TWILIO_VOICE_API_KEY_SID', 'SK…'], ['TWILIO_VOICE_API_KEY_SECRET', 'at least 32 characters'], ['TWILIO_AUTH_TOKEN', 'at least 32 characters']]) {
  const value = env[name] || '';
  add(name, value.length >= 32, value ? `set (${value.length} characters)` : `missing - needs ${hint}`);
}

// The TwiML App SID is stored in the runtime store, not the environment, because
// it is created on first setup. Report what is on disk without modifying it.
const dataFile = env.HARPER_DATA_FILE || path.join(__dirname, '..', 'data', 'harper-store.json');
let appSid = null;
try {
  const store = JSON.parse(fs.readFileSync(dataFile, 'utf8').replace(/^\uFEFF/, ''));
  appSid = typeof store.voiceAppSid === 'string' ? store.voiceAppSid : null;
} catch {
  add('runtime store', false, `unreadable or not valid JSON at ${dataFile} - start the app once so it writes a store, then retry`);
}
add('Twilio voice App (voiceAppSid)', /^AP[0-9a-f]{32}$/.test(appSid || ''), /^AP[0-9a-f]{32}$/.test(appSid || '') ? 'provisioned in the runtime store' : 'not provisioned - run "npm run voice:setup" as an admin, or call POST /api/voice/setup once');

// The webhook origin is hardcoded in browser-voice.js and Twilio validates the
// signature against it, so a mismatch here means every callback is rejected.
const source = fs.readFileSync(path.join(__dirname, '..', 'browser-voice.js'), 'utf8');
const origin = source.match(/const origin = '([^']+)'/)?.[1] || '';
add('webhook origin', origin === 'https://www.harperloadboard.com', origin ? `pinned to ${origin}` : 'could not read the pinned origin from browser-voice.js');

const width = Math.max(...rows.map(r => r.label.length));
for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.label.padEnd(width)}  ${r.detail}`);

console.log('');
console.log(`Data store: ${dataFile}`);
if (ready) {
  console.log('Browser calling is configured. Sign in as an admin and place a call to confirm the Twilio side answers.');
} else {
  console.log('Browser calling is NOT ready. It fails closed with HTTP 503 until every item above passes.');
  console.log('Set the missing values in your hosting provider\'s service variables, redeploy, then re-run this check.');
}
process.exit(ready ? 0 : 1);
