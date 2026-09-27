// Fails the commit if a credential for any provider the app actually uses
// appears in a staged file. Square and Twilio replaced Stripe, so the patterns
// here track the live integrations.
const { execFileSync } = require('node:child_process');
const files = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const patterns = [
  { label: 'Square', re: /\b(?:EAAA|sq0atp-)[A-Za-z0-9_-]{20,}\b/ },
  { label: 'Twilio API key', re: /\bSK[0-9a-f]{32}\b/ }
];
let failed = false;
for (const file of files) {
  const content = execFileSync('git', ['show', `:${file}`], { maxBuffer: 10 * 1024 * 1024 }).toString('utf8');
  for (const { label, re } of patterns) {
    if (re.test(content)) {
      console.error(`Possible ${label} credential in staged file: ${file}`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);
console.log(`Staged credential scan passed (${files.length} file(s) checked).`);
