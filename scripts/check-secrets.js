const { execFileSync } = require('node:child_process');
const files = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
let failed = false;
for (const file of files) {
  const content = execFileSync('git', ['show', `:${file}`], { maxBuffer: 10 * 1024 * 1024 }).toString('utf8');
  if (/\b(?:[sr]k_(?:test|live)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,})\b/.test(content)) {
    console.error(`Possible Stripe credential in staged file: ${file}`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log('Staged Stripe credential scan passed.');
