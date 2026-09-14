const crypto = require('node:crypto');
const twilio = require('twilio');
const fail = (code, message) => Object.assign(new Error(message), { statusCode: code });
function createBrowserVoice({ getStore, persist, env = process.env }) {
  const origin = 'https://www.harperloadboard.com';
  const account = env.TWILIO_ACCOUNT_SID;
  const key = env.TWILIO_VOICE_API_KEY_SID;
  const secret = env.TWILIO_VOICE_API_KEY_SECRET;
  const auth = env.TWILIO_AUTH_TOKEN;
  const caller = '+17205226523';
  const configured = Boolean(/^AC[0-9a-f]{32}$/.test(account || '') && key && secret && auth);
  const rows = () => getStore().voiceCalls ||= [];
  function state() { return { configured, ready: configured && Boolean(getStore().voiceAppSid), caller, calls: rows().slice(-100).reverse() }; }
  async function setup() {
    try {
    if (!configured) throw fail(503, 'The private Twilio voice key and webhook authentication are not configured yet.');
    const client = twilio(key, secret, { accountSid: account });
    const url = origin + '/api/voice/twiml';
    const apps = await client.applications.list({ limit: 100 });
    let app = apps.find(a => a.friendlyName === 'Harper workspace browser calling' && a.voiceUrl === url);
    if (!app) app = await client.applications.create({ friendlyName: 'Harper workspace browser calling', voiceUrl: url, voiceMethod: 'POST' });
    getStore().voiceAppSid = app.sid; persist(); return state();
    } catch (error) {
      console.error('Voice setup failed', JSON.stringify({ code: Number.isInteger(error.code) ? error.code : null, status: Number.isInteger(error.status) ? error.status : null, configured }));
      throw error;
    }
  }
  function token(input, actor) {
    if (!state().ready) throw fail(503, 'Browser calling is awaiting its private Twilio connection.');
    let phone = String(input.phone || '').replace(/[ ().-]/g, '');
    if (/^[2-9][0-9]{9}$/.test(phone)) phone = '+1' + phone;
    if (/^1[2-9][0-9]{9}$/.test(phone)) phone = '+' + phone;
    if (!/^\+1[2-9][0-9]{2}[2-9][0-9]{6}$/.test(phone)) throw fail(400, 'Enter a North American phone number.');
    if (rows().filter(x => x.createdAt > Date.now() - 86400000).length >= 25) throw fail(429, 'The daily browser call limit has been reached.');
    const id = crypto.randomUUID();
    const identity = 'harper_' + crypto.createHash('sha256').update(actor.id).digest('hex').slice(0, 24);
    rows().push({ id, actorId: actor.id, identity, phone, createdAt: Date.now(), status: 'prepared' }); persist();
    const access = new twilio.jwt.AccessToken(account, key, secret, { identity, ttl: 120 });
    access.addGrant(new twilio.jwt.AccessToken.VoiceGrant({ outgoingApplicationSid: getStore().voiceAppSid, incomingAllow: false }));
    return { token: access.toJwt(), callId: id };
  }
  function webhook(pathname, signature, params) {
    if (!configured || !twilio.validateRequest(auth, signature || '', origin + pathname, params) || params.AccountSid !== account) throw fail(403, 'Invalid voice callback.');
    const xml = new twilio.twiml.VoiceResponse();
    if (pathname === '/api/voice/twiml') {
      const row = rows().find(x => x.id === params.CallIntent);
      const actor = row && getStore().accounts.users.find(x => x.id === row.actorId && x.status === 'active' && ['admin','dispatcher'].includes(x.role));
      if (!row || !actor || Date.now() - row.createdAt > 120000 || params.From !== 'client:' + row.identity || (row.callSid && row.callSid !== params.CallSid)) { xml.hangup(); return xml.toString(); }
      row.callSid = params.CallSid; row.status = 'connecting'; persist();
      xml.dial({ callerId: caller, timeout: 30, timeLimit: 1800, answerOnBridge: true }).number({ statusCallback: origin + '/api/voice/status', statusCallbackEvent: ['initiated','ringing','answered','completed'], statusCallbackMethod: 'POST' }, row.phone);
    } else {
      const row = rows().find(x => x.callSid === params.ParentCallSid);
      if (row && ['initiated','queued','ringing','in-progress','completed','busy','failed','no-answer','canceled'].includes(params.CallStatus)) {
        const sequence = Number(params.SequenceNumber);
        if (Number.isFinite(sequence) && sequence > (row.sequence ?? -1)) { row.status = params.CallStatus; row.sequence = sequence; row.updatedAt = Date.now(); persist(); }
      }
    }
    return xml.toString();
  }
  return { state, setup, token, webhook };
}
module.exports = { createBrowserVoice };
