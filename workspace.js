(() => {
  const byId = (id) => document.getElementById(id);
  let signedInAccount = null;
  let invitationOwnerId = null;
  const accountRequest = async (path, options = {}) => {
    const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Account request failed.');
    return payload;
  };
  const postOperation = async (payload) => {
    const response = await fetch('./api/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'The operation could not be saved.');
    return result;
  };
  const formFields = (form) => Object.fromEntries(new FormData(form).entries());

  const loadSubscription = async () => {
    const status = byId('subscriptionStatus');
    const manage = byId('manageBillingButton');
    if (!status || !manage) return;
    manage.hidden = true;
    if (!signedInAccount) {
      status.textContent = 'Sign in to view your subscription.';
      return;
    }
    try {
      const payload = await accountRequest('./api/billing/subscription', { method: 'GET' });
      const subscription = payload.subscription;
      if (!subscription) {
        status.textContent = payload.required
          ? 'No subscription is linked. Choose a plan to activate operations access.'
          : 'No subscription is linked. Choose a plan to open secure checkout.';
        return;
      }
      const renewal = subscription.currentPeriodEnd
        ? ` Current period ends ${new Date(subscription.currentPeriodEnd * 1000).toLocaleDateString()}.`
        : '';
      status.textContent = `${window.HarperDispatch?.plans?.[subscription.plan]?.name || subscription.plan || 'Stripe'} plan · ${subscription.status}.${renewal}`;
      manage.hidden = !['carrier-owner', 'shipper', 'broker'].includes(signedInAccount.role);
    } catch (error) {
      status.textContent = error.message;
    }
  };

  const renderAccount = () => {
    window.dispatchEvent(new CustomEvent('harper:account-changed', { detail: signedInAccount }));
    const summary = byId('accountSummary');
    if (summary) {
      summary.textContent = signedInAccount
        ? `Signed in as ${signedInAccount.name} (${signedInAccount.role}) · company ${(['harper', 'alphaway'].includes(signedInAccount.companyId) ? 'Harper Dispatch and Logistics' : signedInAccount.companyId) || 'Harper Dispatch and Logistics'}`
        : 'Accounts are separated by company, role, and assignment scope.';
    }

    const signoutButton = byId('signoutButton');
    if (signoutButton) signoutButton.hidden = !signedInAccount;

    const inviteForm = byId('inviteForm');
    const invitePanel = inviteForm?.closest('.admin-tool');
    if (invitePanel) {
      invitePanel.hidden = !signedInAccount || !['admin', 'dispatcher'].includes(signedInAccount.role);
      const roles = inviteForm.elements.role;
      roles.setAttribute('aria-label', 'Role');
      roles.querySelectorAll('option[value="admin"], option[value="dispatcher"]').forEach(option => { if (signedInAccount?.role !== 'admin') option.remove(); });
      if (signedInAccount?.role === 'admin') {
        for (const [value, text] of [['dispatcher', 'Dispatcher'], ['admin', 'Admin']]) {
          if (!roles.querySelector(`option[value="${value}"]`)) { const option = document.createElement('option'); option.value = value; option.textContent = text; roles.append(option); }
        }
      }
      updateInvitationRole();
      if (!invitePanel.hidden && window.location.hash === '#inviteTeam') invitePanel.scrollIntoView({ block: 'start' });
      if (invitationOwnerId !== signedInAccount?.id) {
        if (byId('inviteResult')) byId('inviteResult').hidden = true;
        if (byId('inviteLink')) byId('inviteLink').value = '';
        if (byId('inviteStatus')) byId('inviteStatus').textContent = '';
      }
    }

    const accountManagementPanel = byId('accountManagementPanel');
    if (accountManagementPanel) {
      accountManagementPanel.hidden = !signedInAccount || signedInAccount.role !== 'admin';
    }
  };

  const loadUsers = async () => {
    if (!signedInAccount || signedInAccount.role !== 'admin') return;
    const payload = await accountRequest('./api/accounts/users', { method: 'GET' });
    const list = byId('accountUsers');
    if (!list) return;
    list.replaceChildren();
    payload.users.forEach((user) => {
      const row = document.createElement('div');
      row.className = 'account-user-row';
      row.innerHTML = `<strong>${user.name}</strong><span>${user.email} · ${user.role} · ${user.companyId || 'no company'} · ${user.status}</span>`;
      const approve = document.createElement('button');
      approve.className = 'ghost-button';
      approve.textContent = user.status === 'suspended' ? 'Reactivate' : user.status === 'active' ? 'Suspend' : 'Approve';
      approve.addEventListener('click', async () => {
        const status = user.status === 'active' ? 'suspended' : 'active';
        await accountRequest(`./api/accounts/users/${encodeURIComponent(user.id)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
        loadUsers();
      });
      row.append(approve);
      list.append(row);
    });
  };

  accountRequest('./api/accounts/me', { method: 'GET' }).then((payload) => {
    signedInAccount = payload.account;
    renderAccount();
    loadUsers();
    loadSubscription();
  }).catch(() => {
    renderAccount();
    loadSubscription();
  });

  byId('signinForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = byId('signinStatus');
    if (!form || !status) return;
    try {
      const payload = await accountRequest('./api/accounts/signin', { method: 'POST', body: JSON.stringify(formFields(form)) });
      signedInAccount = payload.account;
      form.reset();
      if (signedInAccount?.role === 'admin') {
        window.location.assign('./admin.html');
        return;
      }
      status.textContent = 'Signed in. Workspace permissions applied.';
      renderAccount();
      loadUsers();
      loadSubscription();
    } catch (error) {
      status.textContent = error.message;
    }
  });

  byId('signoutButton')?.addEventListener('click', async () => {
    await accountRequest('./api/accounts/signout', { method: 'POST', body: '{}' });
    signedInAccount = null;
    renderAccount();
    loadSubscription();
  });

  document.querySelectorAll('[data-workspace-plan]').forEach((button) => {
    button.addEventListener('click', async () => {
      const status = byId('subscriptionStatus');
      if (!status) return;
      if (!signedInAccount) {
        status.textContent = 'Sign in before choosing a subscription plan.';
        return;
      }
      try {
        button.disabled = true;
        status.textContent = 'Opening secure checkout…';
        const payload = await accountRequest('./api/billing/checkout', {
          method: 'POST',
          body: JSON.stringify({ plan: button.dataset.workspacePlan, requestId: crypto.randomUUID() })
        });
        window.location.assign(payload.url);
      } catch (error) {
        status.textContent = error.message;
        button.disabled = false;
      }
    });
  });

  byId('manageBillingButton')?.addEventListener('click', async (event) => {
    const status = byId('subscriptionStatus');
    try {
      event.currentTarget.disabled = true;
      status.textContent = 'Opening billing management…';
      const payload = await accountRequest('./api/billing/portal', { method: 'POST', body: '{}' });
      window.location.assign(payload.url);
    } catch (error) {
      status.textContent = error.message;
      event.currentTarget.disabled = false;
    }
  });

  function updateInvitationRole() {
    const form = byId('inviteForm');
    if (!form || !signedInAccount) return;
    const staffRole = ['admin', 'dispatcher'].includes(form.elements.role.value);
    const company = form.elements.companyId;
    if (staffRole || signedInAccount.role !== 'admin' || !company.value) company.value = signedInAccount.companyId || '';
    company.readOnly = staffRole || signedInAccount.role !== 'admin';
    if (byId('inviteCompanyLabel')) byId('inviteCompanyLabel').hidden = staffRole;
    if (byId('inviteRoleHelp')) byId('inviteRoleHelp').textContent = form.elements.role.value === 'admin'
      ? 'Admins can manage accounts, grant access, and record final intake decisions. This invitation uses your company.'
      : staffRole ? 'Dispatchers can prepare intake reviews and manage operations. Your company is selected automatically.' : 'Choose the company this person is authorized to access.';
  }
  byId('inviteForm')?.elements.role.addEventListener('change', updateInvitationRole);
  byId('copyInviteLink')?.addEventListener('click', async () => {
    const link = byId('inviteLink');
    if (!link?.value) return;
    try {
      await navigator.clipboard.writeText(link.value);
      byId('inviteStatus').textContent = 'Invitation link copied. Share it directly with your teammate.';
    } catch {
      link.focus(); link.select();
      byId('inviteStatus').textContent = 'Select and copy the invitation link, then share it directly with your teammate.';
    }
  });
  byId('inviteForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = byId('inviteStatus');
    if (!form || !status) return;
    const submit = form.querySelector('button[type="submit"]');
    if (submit.disabled) return;
    submit.disabled = true;
    const requestOwnerId = signedInAccount?.id;
    byId('inviteResult').hidden = true;
    byId('inviteLink').value = '';
    status.textContent = 'Creating invitation…';
    try {
      const payload = await accountRequest('./api/accounts/invitations', { method: 'POST', body: JSON.stringify(formFields(form)) });
      if (!signedInAccount || signedInAccount.id !== requestOwnerId) return;
      const link = new URL('./accept-invitation.html', window.location.href);
      link.hash = `token=${payload.invitation.token}`;
      byId('inviteLink').value = link.href;
      byId('inviteResult').hidden = false;
      invitationOwnerId = signedInAccount?.id;
      form.reset();
      updateInvitationRole();
      status.textContent = `Invitation created for ${payload.invitation.email} as ${payload.invitation.role}. Copy and share the link below.`;
    } catch (error) {
      status.textContent = error.message;
    } finally { submit.disabled = false; }
  });

  byId('fmcsaBrokerForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = byId('fmcsaStatus');
    const result = byId('fmcsaResult');
    status.textContent = 'Looking up FMCSA…';
    try {
      const query = encodeURIComponent(formFields(event.currentTarget).query);
      const response = await fetch(`./api/fmcsa/brokers?q=${query}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'FMCSA lookup failed.');
      result.hidden = false;
      result.textContent = JSON.stringify(payload.result || payload, null, 2);
      status.textContent = payload.configured ? 'Live FMCSA response received.' : payload.message;
    } catch (error) {
      status.textContent = error.message;
    }
  });

  byId('assignmentForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = byId('assignmentStatus');
    if (!form || !status) return;
    try {
      await postOperation({ type: 'assignment.create', assignment: formFields(form) });
      form.reset();
      status.textContent = 'Driver assignment saved.';
    } catch (error) {
      status.textContent = error.message;
    }
  });

  byId('invoiceForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = byId('invoiceStatus');
    if (!form || !status) return;
    try {
      await postOperation({ type: 'invoice.create', invoice: formFields(form) });
      form.reset();
      status.textContent = 'Invoice draft created.';
    } catch (error) {
      status.textContent = error.message;
    }
  });

  byId('documentForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = byId('documentStatus');
    if (!form || !status) return;
    const fields = formFields(form);
    const fileInput = form.elements.file;
    const file = fileInput?.files?.[0];
    if (!file || file.size > 3 * 1024 * 1024) {
      status.textContent = 'Choose a file no larger than 3 MB.';
      return;
    }
    status.textContent = 'Uploading document…';
    try {
      const contentBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(String(reader.result).split(',')[1] || ''));
        reader.addEventListener('error', () => reject(new Error('The file could not be read.')));
        reader.readAsDataURL(file);
      });
      await postOperation({ type: 'document.upload', document: { fileName: file.name, contentType: file.type, documentType: fields.documentType, loadId: fields.loadId, uploadedBy: 'Operations', contentBase64 } });
      form.reset();
      status.textContent = 'Document uploaded securely to the server volume.';
    } catch (error) {
      status.textContent = error.message;
    }
  });
})();

