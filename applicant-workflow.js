const crypto = require('node:crypto');
const DAY = 86400000;
const email = value => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
function createWorkflow({ env = process.env, getStore, persist, fetchImpl = fetch }) {
  const secret = env.ALPHAWAY_SESSION_SECRET || env.ALPHAWAY_ACCOUNT_SESSION_SECRET || '';
  const provider = env.ALPHAWAY_EMAIL_PROVIDER || 'sendgrid';
  const from = env.ALPHAWAY_EMAIL_FROM || 'info@alphawaylogisticsllc.com';
  const replyTo = env.ALPHAWAY_EMAIL_REPLY_TO || 'info@alphawaylogisticsllc.com';
  const origin = env.ALPHAWAY_PUBLIC_ORIGIN || 'https://www.alphawaylogisticsllc.com';
  const enabled = env.ALPHAWAY_APPLICANT_EMAILS_ENABLED === 'true';
  const twilioUser = env.TWILIO_API_KEY_SID || env.TWILIO_ACCOUNT_SID;
  const twilioSecret = env.TWILIO_API_KEY_SECRET || env.TWILIO_AUTH_TOKEN;
  const configured = enabled && email(from) && email(replyTo) && secret.length >= 32 &&
    /^https:\/\/[^/?#]+$/.test(origin) && (provider === 'sendgrid' ? Boolean(env.SENDGRID_API_KEY) : provider === 'twilio' && Boolean(twilioUser && twilioSecret));
  const token = id => crypto.createHmac('sha256', secret).update(`applicant-invitation:${id}`).digest('hex');
  function init() { const s = getStore(); s.applicantWorkflows ||= {}; s.applicantOutbox ||= []; return s; }
  function cancel(w, s) {
    for (const job of s.applicantOutbox.filter(j => j.intakeId === w.intakeId && ['queued', 'blocked'].includes(j.status))) job.status = 'cancelled';
    const invite = s.accounts.invitations.find(i => i.id === w.invitationId);
    if (invite && invite.status !== 'accepted') invite.expiresAt = 0;
  }
  function transition(record, review, input, actor) {
    const s = init(), previous = s.applicantWorkflows[record.id];
    // Reopening/suspending revokes unused invitations and blocks readiness immediately.
    if (previous && ['reopen', 'suspend', 'reject', 'classify'].includes(input.action)) cancel(previous, s);
    if (!input.notifyApplicant || record.type !== 'carrier-onboarding' || review.category !== 'carrier') return;
    const kind = input.action === 'approve' ? 'approved' : input.action === 'reject' ? 'rejected' : input.action === 'status' && review.status === 'needs_information' ? 'needs_information' : '';
    if (!kind) return;
    if (secret.length < 32) fail('Applicant workflow needs a private server secret before it can create secure invitations.');
    const applicantMessage = String(input.applicantMessage || '').trim();
    if (!applicantMessage || applicantMessage.length > 2000) fail('Write an applicant-facing message of 1 to 2,000 characters. Internal notes are not emailed.');
    if (!email(record.fields.business_email)) fail('The application needs a valid email address.');
    if (previous) cancel(previous, s);
    const w = { intakeId: record.id, reviewVersion: review.version, status: kind, createdAt: Date.now(), companyId: previous?.companyId || '', invitationId: '', dispatcherId: '', billingReference: '', actorId: actor.id };
    w.responses = previous?.responses || [];
    if (kind === 'approved') {
      const existing = s.accounts.users.find(u => u.email === record.fields.business_email.toLowerCase());
      if (existing) {
        // An email match never grants access to an existing company or changes a role.
        if (!w.companyId || existing.companyId !== w.companyId || existing.role !== 'carrier-owner') fail('This email already has an account. Resolve its company membership in Account management before sending an automated invitation.');
      } else {
        w.companyId ||= `carrier-${crypto.randomUUID()}`;
        if (!s.accounts.companies.some(c => c.id === w.companyId)) s.accounts.companies.push({ id: w.companyId, name: record.fields.legal_carrier_name, type: 'carrier', status: 'pending', createdAt: Date.now() });
        w.invitationId = `invite-${crypto.randomUUID()}`;
        s.accounts.invitations.push({ id: w.invitationId, email: record.fields.business_email.toLowerCase(), role: 'carrier-owner', companyId: w.companyId, tokenHash: crypto.createHash('sha256').update(token(w.invitationId)).digest('hex'), status: 'pending', expiresAt: Date.now() + 7 * DAY });
      }
    }
    s.applicantWorkflows[record.id] = w;
    s.applicantOutbox.push({ id: crypto.randomUUID(), intakeId: record.id, version: review.version, kind, recipient: record.fields.business_email.toLowerCase(), applicantMessage, invitationId: w.invitationId, origin, from, replyTo, status: 'queued', createdAt: Date.now(), attempts: 0 });
  }
  function readiness(record, review, w) {
    const s = init();
    const checks = Object.values(review.checks).every(c => ['verified', 'not_applicable'].includes(c.status) && c.evidence?.trim() && (!c.expiresOn || c.expiresOn >= new Date().toISOString().slice(0, 10)));
    const account = s.accounts.users.find(u => u.companyId === w.companyId && u.email === record.fields.business_email.toLowerCase() && u.role === 'carrier-owner' && u.status === 'active');
    const dispatcher = s.accounts.users.find(u => u.id === w.dispatcherId && u.status === 'active' && ['dispatcher', 'admin'].includes(u.role));
    const payment = record.fields.billing_method === 'percentage' ? Boolean(w.billingReference) : Boolean(account && s.operations.billingSubscriptions.some(b => b.companyId === w.companyId && b.userId === account.id && b.plan === record.fields.dispatch_package && b.status === 'active'));
    const steps = { approval: review.status === 'approved' && w.status === 'approved', evidence: checks, account: Boolean(account), dispatcher: Boolean(dispatcher), payment };
    return { ready: Object.values(steps).every(Boolean), steps };
  }
  function summary(record, review) {
    const s = init(), w = s.applicantWorkflows[record.id];
    const { responses: privateResponses, ...publicWorkflow } = w || {};
    return { configured: Boolean(configured), provider, workflow: w ? { ...publicWorkflow, ...readiness(record, review, w) } : null,
      emails: s.applicantOutbox.filter(j => j.intakeId === record.id).map(j => ({ id: j.id, kind: j.kind, recipient: j.recipient, applicantMessage: j.applicantMessage, status: j.status, attempts: j.attempts, createdAt: j.createdAt, acceptedAt: j.acceptedAt, issue: j.issue || '' })),
      responses: (w?.responses || []).map(({contentBase64, ...r}) => r) };
  }
  function responseJob(raw) {
    const [id, value] = String(raw || '').split('.'), s = init();
    const job = s.applicantOutbox.find(j => j.id === id && j.kind === 'needs_information');
    if (!job || !value || value.length !== 64 || !/^[a-f0-9]+$/.test(value) || !crypto.timingSafeEqual(Buffer.from(value), Buffer.from(token(`response:${id}`))) || job.createdAt + 7 * DAY < Date.now() || s.applicantWorkflows[job.intakeId]?.reviewVersion !== job.version || s.intakeReviews[job.intakeId]?.status !== 'needs_information') fail('This secure response link is invalid or expired. Contact the AlphaWay team.', 403);
    return job;
  }
  function receiveResponse(input) {
    const job = responseJob(input.token), s = init(), w = s.applicantWorkflows[job.intakeId];
    if (input.action === 'preview') return { message: job.applicantMessage, reference: job.intakeId };
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(input.requestId || '')) fail('A unique response ID is required.');
    w.responses ||= [];
    if (w.responses.some(r => r.requestId === input.requestId)) return { saved: true };
    if (w.responses.length >= 10) fail('This request has reached its response limit. Contact the team.');
    const note = String(input.note || '').trim();
    if (!note || note.length > 2000) fail('Provide a note of 1 to 2,000 characters.');
    const file = input.file || {}, base64 = String(file.contentBase64 || '');
    let mime = '', filename = '';
    if (base64) {
      if (base64.length > 4 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) fail('Use a PDF, PNG or JPEG under 3 MB.');
      const bytes = Buffer.from(base64, 'base64');
      mime = bytes.subarray(0, 5).toString() === '%PDF-' ? 'application/pdf' : bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg' : '';
      if (!mime || bytes.length > 3 * 1024 * 1024) fail('Use a PDF, PNG or JPEG under 3 MB.');
      filename = String(file.name || 'document').replace(/[^a-zA-Z0-9_. -]/g, '_').slice(0, 100);
    }
    const entry = { id: crypto.randomUUID(), requestId: input.requestId, at: Date.now(), note, filename, mime, contentBase64: base64 };
    w.responses.push(entry);
    const review = s.intakeReviews[job.intakeId]; review.version++; review.updatedAt = Date.now();
    review.history.push({ id: crypto.randomUUID(), version: review.version, at: review.updatedAt, actor: null, action: 'applicant_response', note: 'Applicant supplied information. Documents are unverified and require staff review.', after: { responseId: entry.id, filename } });
    return { saved: true };
  }
  function update(record, review, input, actor) {
    if (actor.role !== 'admin') fail('Only an administrator can update onboarding readiness.', 403);
    if (review.version !== input.version) fail('The review changed. Reload it first.', 409);
    const s = init(), w = s.applicantWorkflows[record.id];
    if (!w || review.status !== 'approved') fail('Approve and notify this carrier before updating onboarding.');
    if (!s.accounts.users.some(u => u.id === input.dispatcherId && ['admin', 'dispatcher'].includes(u.role) && u.status === 'active')) fail('Choose an active dispatcher.');
    if (String(input.billingReference || '').length > 2000) fail('Payment reference is too long.');
    w.dispatcherId = input.dispatcherId;
    w.billingReference = String(input.billingReference || '').trim();
    w.updatedAt = Date.now(); w.actorId = actor.id;
    review.version++; review.updatedAt = Date.now();
    review.history.push({ id: crypto.randomUUID(), version: review.version, at: review.updatedAt, actor: { id: actor.id, name: actor.name, role: actor.role }, action: 'onboarding', note: 'Onboarding assignment and payment review updated.', after: { dispatcherId: w.dispatcherId, billingReference: w.billingReference } });
  }
  function message(job) {
    const subject = { approved: 'Your AlphaWay carrier application is approved for onboarding', rejected: 'Update on your AlphaWay carrier application', needs_information: 'Information needed for your AlphaWay carrier application' }[job.kind];
    const next = job.kind === 'approved' ? `Your application is approved for onboarding. Dispatch is not active yet.\n\n${job.invitationId ? `Create your account within 7 days: ${job.origin}/accept-invitation.html#token=${token(job.invitationId)}` : `Sign in: ${job.origin}/workspace.html`}\n\nOnce signed in, open ${job.origin}/onboarding.html to see remaining steps. Complete your selected payment setup in Account. Our team will confirm documents and assign your dispatcher.` :
      job.kind === 'rejected' ? 'Your application has not been approved. Reply to request reconsideration or correct an error. No service has been activated.' : `We need the information listed below before we can finish reviewing your application. Use this private link within 7 days to send your response and documents: ${job.origin}/applicant-response.html#token=${job.id}.${token(`response:${job.id}`)}\nDo not forward this link or email tax IDs or bank details.`;
    return { subject, text: `Hello,\n\n${next}\n\nMessage from the AlphaWay team:\n${job.applicantMessage}\n\nApplication reference: ${job.intakeId}\n\nAlphaWay Logistics LLC\n${job.replyTo}` };
  }
  let running = false;
  async function drain() {
    if (running || !configured) return;
    running = true;
    try {
      const s = init();
      const job = s.applicantOutbox.find(j => j.status === 'queued' && (!j.nextAttemptAt || j.nextAttemptAt <= Date.now()));
      if (!job) {
        const pending = s.applicantOutbox.find(j => j.status === 'accepted' && j.operationId && (!j.checkedAt || j.checkedAt < Date.now() - 60000) && j.acceptedAt > Date.now() - 7 * DAY);
        if (!pending || provider !== 'twilio') return;
        pending.checkedAt = Date.now(); persist();
        try {
          const result = await fetchImpl(`https://comms.twilio.com/v1/Emails/Operations/${encodeURIComponent(pending.operationId)}`, { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Authorization: `Basic ${Buffer.from(`${twilioUser}:${twilioSecret}`).toString('base64')}` } });
          if (result.ok) {
            const data = await result.json(), stats = data.stats || {};
            const current = init().applicantOutbox.find(j => j.id === pending.id);
            if (stats.delivered >= 1) { current.status = 'delivered'; current.issue = 'Recipient mail server confirmed delivery.'; }
            else if (stats.failed >= 1 || stats.undelivered >= 1 || stats.canceled >= 1) { current.status = 'delivery_failed'; current.issue = 'Provider reported unsuccessful delivery. Check the applicant address and provider activity.'; }
            persist();
          } else if (result.body) await result.body.cancel();
        } catch { /* Keep accepted distinct from confirmed delivery. */ }
        return;
      }
      const review = s.intakeReviews[job.intakeId], w = s.applicantWorkflows[job.intakeId];
      if (!w || w.reviewVersion !== job.version || review.status !== job.kind) { job.status = 'cancelled'; persist(); return; }
      if (job.invitationId && !s.accounts.invitations.some(i => i.id === job.invitationId && i.expiresAt > Date.now())) { job.status = 'blocked'; job.issue = 'Invitation expired. Reopen the review and issue a new decision invitation.'; persist(); return; }
      // Persist before the external send. A crash or timeout leaves an uncertain job for staff,
      // never an automatic duplicate (neither provider guarantees send idempotency here).
      job.status = 'sending'; job.attempts++; job.attemptedAt = Date.now(); persist();
      const body = message(job);
      body.html = '<p>' + body.text.replace(/[&<>"{}]/g, c => `&#${c.charCodeAt(0)};`).replace(/\n/g, '<br>') + '</p>';
      let response;
      try {
        response = await fetchImpl(provider === 'sendgrid' ? 'https://api.sendgrid.com/v3/mail/send' : 'https://comms.twilio.com/v1/Emails', {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', Authorization: provider === 'sendgrid' ? `Bearer ${env.SENDGRID_API_KEY}` : `Basic ${Buffer.from(`${twilioUser}:${twilioSecret}`).toString('base64')}` },
          body: JSON.stringify(provider === 'sendgrid' ? { from: { email: job.from, name: 'AlphaWay Logistics' }, reply_to: { email: job.replyTo }, personalizations: [{ to: [{ email: job.recipient }], custom_args: { applicant_job: job.id } }], subject: body.subject, content: [{ type: 'text/plain', value: body.text }], tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false } } } : { from: { address: job.from, name: 'AlphaWay Logistics' }, to: [{ address: job.recipient }], content: body })
        });
      } catch { /* Status remains uncertain; no blind retry. */ }
      const current = init().applicantOutbox.find(j => j.id === job.id);
      if (response?.status === 202) {
        current.status = 'accepted'; current.acceptedAt = Date.now(); current.issue = 'Accepted by email provider; delivery is not confirmed.';
        if (provider === 'twilio') try { const data = await response.json(); if (/^comms_operation_[a-zA-Z0-9_-]{1,100}$/.test(data.operationId || '')) current.operationId = data.operationId; } catch { /* Sending succeeded even if tracking data was unavailable. */ }
      }
      else if (response?.status === 429 && current.attempts < 5) { current.status = 'queued'; current.nextAttemptAt = Date.now() + Math.min(3600000, 60000 * 2 ** current.attempts); current.issue = 'Provider rate limit; retry scheduled.'; }
      else { current.status = response && response.status >= 400 && response.status < 500 ? 'blocked' : 'uncertain'; current.issue = current.status === 'blocked' ? 'Provider rejected the email. Check sender verification and credentials.' : 'Delivery is uncertain. Check provider activity before sending another message.'; }
      if (response?.body) await response.body.cancel().catch(() => {});
      persist();
    } finally { running = false; }
  }
  function recover() { for (const job of init().applicantOutbox) if (job.status === 'sending') { job.status = 'uncertain'; job.issue = 'Server restarted during send. Check provider activity before resending.'; } }
  return { transition, summary, update, readiness, drain, recover, configured, message, receiveResponse };
}
module.exports = { createWorkflow };
