// Reproduce the Railway healthcheck locally: boot the server with the same
// HARPER_* settings the hosted service uses, then poll /api/health the way
// Railway's healthcheck does.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'healthcheck-'));
const dataFile = path.join(dir, 'harper-store.json');

const env = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: '4188',
  HARPER_HOST: '0.0.0.0',
  HARPER_DATA_FILE: dataFile,
  HARPER_REQUIRE_AUTH: 'true',
  HARPER_PREVIEW_USERNAME: 'preview',
  HARPER_PREVIEW_PASSWORD: 'local-test-password',
  HARPER_PRIVATE_NETWORK: 'true',
  HARPER_NETWORK_INVITE_CODE: 'local-test-invite',
  HARPER_ACCOUNT_AUTH: 'true',
  HARPER_ACCOUNT_SESSION_SECRET: 'a'.repeat(48),
  HARPER_ADMIN_EMAIL: 'admin@example.com',
  HARPER_ADMIN_PASSWORD: 'local-test-password',
  HARPER_PUBLIC_ORIGIN: 'https://www.harperloadboard.com',
};
// Strip any leftover names so the child sees only HARPER_*.
for (const key of Object.keys(env)) {
  if (key.startsWith('ALPHAWAY_')) delete env[key];
}

const child = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve(__dirname),
  env,
  windowsHide: true
});

let out = '';
let err = '';
child.stdout.on('data', (d) => { out += d; });
child.stderr.on('data', (d) => { err += d; });

function done(code) {
  console.log('--- STDOUT ---');
  console.log(out.trim() || '(empty)');
  console.log('--- STDERR ---');
  console.log(err.trim() || '(empty)');
  try { child.kill(); } catch { }
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(code);
}

setTimeout(async () => {
  try {
    const res = await fetch('http://127.0.0.1:4188/api/health');
    console.log('HEALTH STATUS:', res.status);
    console.log('HEALTH BODY:  ', await res.text());
  } catch (e) {
    console.log('HEALTH REQUEST FAILED:', e.message);
  }
  done(0);
}, 6000);

child.on('exit', (c) => {
  console.log('server exited early with code', c);
  done(1);
});