const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
async function start(extra = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(HARPER_|STRIPE_|NODE_ENV$|PORT$|HOST$)/.test(key)));
  const child = spawn(process.execPath, ['--max-old-space-size=128', 'server.js'], { cwd: path.resolve(__dirname, '..'), env: { ...env, PORT: '0', HARPER_HOST: '127.0.0.1', ...extra }, windowsHide: true });
  let output = '', errors = '';
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Server startup timed out: ${errors || output}`)); }, Math.min(180000, Math.max(45000, Number(process.env.HARPER_TEST_STARTUP_TIMEOUT_MS) || 45000)));
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
    child.stderr.on('data', chunk => { errors += chunk; });
    child.once('exit', () => { clearTimeout(timer); reject(new Error(`Server exited before ready: ${errors}`)); });
  });
  return { url, async stop() { if (child.exitCode !== null) return; const done = once(child, 'exit'); child.kill(); await done; } };
}
module.exports = { start };
