(() => {
  const byId = (id) => document.getElementById(id);
  let signedInAccount = null;
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

  const renderAccount = () => {
    byId('accountSummary').textContent = signedInAccount
      ? `Signed in as ${signedInAccount.name} (${signedInAccount.role}) · company ${signedInAccount.companyId || 'Alphaway'}`
      : 'Accounts are separated by company, role, and assignment scope.';
    byId('signoutButton').hidden = !signedInAccount;
    byId('inviteForm').closest('.admin-tool').hidden = !signedInAccount || !['admin', 'dispatcher'].includes(signedInAccount.role);
    byId('accountManagementPanel').hidden = !signedInAccount || signedInAccount.role !== 'admin';
  };

  const loadUsers = async () => {
    if (!signedInAccount || signedInAccount.role !== 'admin') return;
    const payload = await accountRequest('./api/accounts/users', { method: 'GET' });
    const list = byId('accountUsers');
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
  }).catch(() => renderAccount());

  byId('signinForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = byId('signinStatus');
    try {
      const payload = await accountRequest('./api/accounts/signin', { method: 'POST', body: JSON.stringify(formFields(event.currentTarget)) });
      signedInAccount = payload.account;
      event.currentTarget.reset();
      status.textContent = 'Signed in. Workspace permissions applied.';
      renderAccount();
      loadUsers();
    } catch (error) {
      status.textContent = error.message;
    }
  });

  byId('signoutButton')?.addEventListener('click', async () => {
    await accountRequest('./api/accounts/signout', { method: 'POST', body: '{}' });
    signedInAccount = null;
    renderAccount();
  });

  byId('inviteForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = byId('inviteStatus');
    try {
      const payload = await accountRequest('./api/accounts/invitations', { method: 'POST', body: JSON.stringify(formFields(event.currentTarget)) });
      event.currentTarget.reset();
      status.textContent = `Invitation created for ${payload.invitation.email}. Token: ${payload.invitation.token}`;
    } catch (error) {
      status.textContent = error.message;
    }
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
    const status = byId('assignmentStatus');
    try {
      await postOperation({ type: 'assignment.create', assignment: formFields(event.currentTarget) });
      event.currentTarget.reset();
      status.textContent = 'Driver assignment saved.';
    } catch (error) {
      status.textContent = error.message;
    }
  });

  byId('invoiceForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = byId('invoiceStatus');
    try {
      await postOperation({ type: 'invoice.create', invoice: formFields(event.currentTarget) });
      event.currentTarget.reset();
      status.textContent = 'Invoice draft created.';
    } catch (error) {
      status.textContent = error.message;
    }
  });

  byId('documentForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = byId('documentStatus');
    const fields = formFields(form);
    const file = form.elements.file.files[0];
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
