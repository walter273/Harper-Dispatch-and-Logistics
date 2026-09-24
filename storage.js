const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function atomicWrite(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temporary, 'w', 0o600);
    fs.writeFileSync(fd, text, 'utf8'); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, file);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
function createStorage(file, env = process.env) {
  const validate = text => {
    const value = JSON.parse(text);
    if (!value || !Array.isArray(value.loads) || !value.accounts || !value.operations) throw new Error('Invalid stored application data');
    return value;
  };
  function bootstrap() {
    if (fs.existsSync(file) || !env.HARPER_MIGRATION_JSON) return;
    const text = env.HARPER_MIGRATION_JSON;
    validate(text);
    const digest = crypto.createHash('sha256').update(text).digest('hex');
    if (env.HARPER_MIGRATION_SHA256 && digest !== env.HARPER_MIGRATION_SHA256) throw new Error('Migration checksum mismatch');
    atomicWrite(`${file}.migration-backup`, text);
    atomicWrite(file, text);
    if (fs.readFileSync(file, 'utf8') !== text) throw new Error('Migration verification failed');
    console.log('Persistent data migration verified.');
  }
  return {
    read() { bootstrap(); return fs.existsSync(file) ? validate(fs.readFileSync(file, 'utf8')) : null; },
    write(value) {
      // The previous implementation re-read and re-parsed the entire store on
      // every save, then wrote the file with two-space indentation. On a store of
      // production size that made each save several times larger than the data it
      // carried, and slow enough that API routes such as sign-in exceeded the
      // host's proxy timeout and returned 502 - so the session was never written
      // and the visitor was bounced back to the sign-in form.
      //
      // The in-memory store is validated when it is read at startup, so the extra
      // read-and-parse bought nothing. The backup still runs, but from the text we
      // are about to replace rather than a second read of the same file, and the
      // payload is written compactly.
      const text = JSON.stringify(value);
      const backup = `${file}.backup`;
      let backupDue = true;
      try {
        backupDue = !fs.existsSync(backup) || Date.now() - fs.statSync(backup).mtimeMs >= 3600000;
      } catch { backupDue = true; }
      if (backupDue && fs.existsSync(file)) {
        try { atomicWrite(backup, fs.readFileSync(file, 'utf8')); } catch { /* a missed backup must not block the save */ }
      }
      atomicWrite(file, text);
    }
  };
}
module.exports = { createStorage };
