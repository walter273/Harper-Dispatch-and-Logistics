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
      if (fs.existsSync(file)) {
        const old = fs.readFileSync(file, 'utf8'); validate(old);
        const backup = `${file}.backup`;
        if (!fs.existsSync(backup) || Date.now() - fs.statSync(backup).mtimeMs >= 3600000) atomicWrite(backup, old);
      }
      atomicWrite(file, JSON.stringify(value, null, 2));
    }
  };
}
module.exports = { createStorage };
