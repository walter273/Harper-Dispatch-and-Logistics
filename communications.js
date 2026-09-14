const crypto = require('node:crypto');
const aliases = ['dispatch', 'admin', 'billing', 'info'].map(x => `${x}@harperloadboard.com`);
const fail = (code, message) => Object.assign(new Error(message), { statusCode: code });
function createCommunications({ getStore, persist, env = process.env, fetchImpl = fetch }) {
  const user = env.TWILIO_API_KEY_SID;
  const secret = env.TWILIO_API_KEY_SECRET;
  const ready = Boolean(user && secret);
  let refreshing = false;
  const rows = () => getStore().communications ||= [];
  const headers = () => ({ Authorization: `Basic ${Buffer.from(`${user}:${secret}`).toString('base64')}`, 'Content-Type': 'application/json' });
  function state() {
    return { emailReady: ready, senders: aliases, messages: rows().slice(-100).reverse(), browserCallingReady: false, inboxConnected: false };
  }
  async function send(input, actor) {
    if (!ready) throw fail(503, 'Email sending is not connected.');
    const from = String(input.from || aliases[0]);
    const to = String(input.recipient || '').trim();
    const subject = String(input.subject || '').trim();
    const message = String(input.message || '').trim();
    const id = String(input.requestId || '');
    if (!aliases.includes(from) || to.length > 254 || !/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(to) || !subject || subject.length > 180 || /[\r\n]/.test(subject) || !message || message.length > 4000 || !/^[a-f0-9-]{36}$/.test(id)) throw fail(400, 'Enter a valid sender, recipient, subject and message.');
    const digest = crypto.createHash('sha256').update(JSON.stringify({ from, to, subject, message })).digest('hex');
    const existing = rows().find(x => x.id === id);
    if (existing) {
      if (existing.actorId !== actor.id || existing.digest !== digest) throw fail(409, 'This send reference was already used for a different message.');
      return existing;
    }
    if (rows().filter(x => x.createdAt > Date.now() - 86400000).length >= 100) throw fail(429, 'The daily workspace email limit has been reached.');
    const row = { id, actorId: actor.id, from, to, subject, message, digest, createdAt: Date.now(), status: 'sending' };
    rows().push(row);
    persist(); // Save the unique send reference before contacting the provider.
    let response;
    try {
      response = await fetchImpl('https://comms.twilio.com/v1/Emails', { method: 'POST', headers: headers(), redirect: 'error', signal: AbortSignal.timeout(15000), body: JSON.stringify({ from: { address: from, name: 'Harper Dispatch and Logistics' }, to: [{ address: to }], content: { subject, text: message } }) });
    } catch { /* An interrupted request might already have been accepted. Never resend automatically. */ }
    const current = rows().find(x => x.id === id);
    current.status = response?.status === 202 ? 'accepted' : response && response.status >= 400 && response.status < 500 ? 'rejected' : 'uncertain';
    if (current.status === 'accepted') {
      try { const data = await response.json(); if (/^comms_operation_[a-zA-Z0-9_-]{1,100}$/.test(data.operationId || '')) current.operationId = data.operationId; } catch {}
    }
    persist();
    return current;
  }
  async function refresh() {
    if (!ready || refreshing) return;
    refreshing = true;
    try {
      for (const row of rows().filter(x => x.status === 'accepted' && x.operationId && Date.now() - (x.checkedAt || 0) > 30000 && Date.now() - x.createdAt < 7 * 86400000).slice(-20)) {
        try {
          const response = await fetchImpl(`https://comms.twilio.com/v1/Emails/Operations/${encodeURIComponent(row.operationId)}`, { headers: headers(), redirect: 'error', signal: AbortSignal.timeout(10000) });
          const current = rows().find(x => x.id === row.id);
          current.checkedAt = Date.now();
          if (response.ok) {
            const { stats = {} } = await response.json();
            if (stats.delivered >= 1) current.status = 'delivered';
            else if (stats.failed >= 1 || stats.undelivered >= 1 || stats.canceled >= 1) current.status = 'delivery_failed';
          }
          persist();
        } catch { /* Preserve the last confirmed state. */ }
      }
    } finally { refreshing = false; }
  }
  function recover() { for (const row of rows()) if (row.status === 'sending') row.status = 'uncertain'; }
  return { state, send, refresh, recover };
}
module.exports = { createCommunications };
