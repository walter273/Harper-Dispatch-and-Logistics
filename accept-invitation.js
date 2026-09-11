(() => {
  'use strict';
  const form = document.getElementById('acceptInvitationForm');
  const status = document.getElementById('acceptInvitationStatus');
  const summary = document.getElementById('invitationSummary');
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
  let ready = false;
  const message = (text, error = false) => { status.textContent = text; status.classList.toggle('is-error', error); };
  async function request(route, body) {
    const response = await fetch(route, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Account setup could not be completed. Please retry.');
    return payload;
  }
  if (!/^[a-f0-9]{48}$/.test(token)) {
    summary.textContent = 'Open the complete invitation link your administrator shared with you.';
    message('This page needs a valid invitation link.', true);
    return;
  }
  request('./api/accounts/invitations/preview', { token }).then(({ invitation }) => {
    const role = invitation.role === 'admin' ? 'Admin' : invitation.role.replaceAll('-', ' ');
    document.getElementById('invitationEmail').value = invitation.email;
    summary.textContent = `You are invited to join Alphaway Logistics as ${role}. This invitation expires ${new Date(invitation.expiresAt).toLocaleDateString()}.`;
    ready = true; form.hidden = false;
  }).catch(error => { summary.textContent = 'This invitation could not be opened.'; message(error.message, true); });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (!ready) return;
    const submit = form.querySelector('button[type="submit"]');
    if (submit.disabled) return;
    const fields = Object.fromEntries(new FormData(form));
    if (fields.password !== fields.confirmPassword) { message('The passwords do not match. Please enter the same password twice.', true); return; }
    submit.disabled = true; message('Creating your account…');
    try {
      const payload = await request('./api/accounts/accept', { token, name: fields.name, password: fields.password });
      ready = false; form.reset(); form.hidden = true;
      window.history.replaceState(null, '', window.location.pathname);
      message('Your account is ready. Opening your workspace…');
      window.location.assign(payload.account.role === 'admin' ? './admin.html' : './workspace.html');
    } catch (error) { message(`${error.message} If you already completed setup, use the sign-in link below.`, true); }
    finally { submit.disabled = false; }
  });
})();
