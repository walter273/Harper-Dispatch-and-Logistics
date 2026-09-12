(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  let meta, account, page = 1, pages = 1, selected = '', current = null, busy = false, queueRevision = 0, detailRevision = 0, historyPage = 1;
  const filters = $('queueFilters');
  const openStatuses = ['received', 'in_review', 'needs_information'];
  const fieldLabels = { eld_gps_provider: 'ELD/GPS provider', eld_gps_provider_other: 'Other provider name', gps_pilot_truck: 'Pilot truck number', gps_pilot_requested: 'One-truck pilot contact requested' };
  const label = value => fieldLabels[value] || String(value).replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  const date = value => new Date(value).toLocaleString();
  const title = intake => intake.fields.legal_carrier_name || intake.fields.broker_company || intake.fields.company || intake.fields.name || 'Intake request';
  const message = (text, error = false) => { $('reviewMessage').textContent = text; $('reviewMessage').dataset.error = String(error); };
  function lockAccess() {
    queueRevision++; detailRevision++; current = null; account = null;
    $('reviewApp').hidden = true; $('refreshQueue').hidden = true; $('reviewAccess').hidden = false;
    $('queueList').replaceChildren(); $('reviewDetail').replaceChildren();
  }
  async function api(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if ([401, 403].includes(response.status)) lockAccess();
      throw Object.assign(new Error(data.error || 'The request could not be completed. Please retry.'), { status: response.status });
    }
    return data;
  }
  const button = (text, handler, primary = false) => { const b = el('button', text, primary ? 'primary-button' : 'ghost-button'); b.type = 'button'; b.addEventListener('click', handler); return b; };
  function selectField(name, values, value, caption) {
    const wrapper = el('label', caption); const input = el('select'); input.name = name; input.setAttribute('aria-label', caption);
    for (const [key, text] of values) { const option = el('option', text); option.value = key; input.append(option); }
    input.value = value; wrapper.append(input); return wrapper;
  }
  function textField(name, caption, value = '', type = 'textarea') {
    const wrapper = el('label', caption); const input = el(type === 'textarea' ? 'textarea' : 'input'); input.name = name;
    input.setAttribute('aria-label', caption);
    if (type !== 'textarea') input.type = type; else input.maxLength = 4000;
    input.value = value; wrapper.append(input); return wrapper;
  }
  function badge(status) { const node = el('span', meta.statuses[status] || (status === 'missing' ? 'Missing information' : label(status)), 'review-badge'); node.dataset.status = status; return node; }
  function submitButton(text) { const node = el('button', text, 'primary-button'); node.type = 'submit'; return node; }
  function applicantFields(form) {
    if (current.intake.type !== 'carrier-onboarding' || current.review.category !== 'carrier') return;
    const wrapper = el('label', 'Email this decision to the applicant');
    const toggle = el('input'); toggle.type = 'checkbox'; toggle.name = 'notifyApplicant'; toggle.checked = true;
    wrapper.prepend(toggle);
    const submit = form.querySelector('button[type="submit"]') || form.querySelector('button');
    const fields = [wrapper, textField('applicantMessage', 'Message to applicant (emailed; do not include internal notes)'), el('p', `Recipient: ${current.intake.fields.business_email}. Approval includes an account invitation. Needs information includes a private response link. Denial includes your message. No email is sent for reopening or suspension. The email queue below shows sending issues.`, 'review-help')];
    fields.forEach(field => form.insertBefore(field, submit));
  }
  // Keep the same request ID for a retry after a lost response; the server records each change once.
  function reviewForm(action, build, caption, className = 'review-inline-form') {
    const form = el('form', undefined, className); let lastPayload = '', requestId = '';
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (busy || !current) return;
      const values = Object.fromEntries(new FormData(form));
      const payload = { action, version: current.review.version, ...build(values), notifyApplicant: values.notifyApplicant === 'on', applicantMessage: values.applicantMessage || '' };
      const serialized = JSON.stringify(payload);
      if (serialized !== lastPayload) { requestId = crypto.randomUUID(); lastPayload = serialized; }
      busy = true;
      const controls = [...$('reviewDetail').querySelectorAll('button, input, select, textarea')].map(node => [node, node.disabled]);
      controls.forEach(([node]) => node.disabled = true);
      message('Saving review…');
      try {
        const data = await api(`/api/intakes/${encodeURIComponent(selected)}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, requestId }) });
        current = data; renderDetail();
        message(data.replayed ? 'This change was already saved. The latest record is shown.' : 'Review saved. The change is recorded in the history.');
        loadQueue().catch(error => message(`The review was saved, but the queue could not refresh. ${error.message}`, true));
      } catch (error) { message(error.message + (error.status === 409 ? ' Use “Reload record” below; unsaved edits will be replaced.' : ''), true); }
      finally { busy = false; controls.forEach(([node, disabled]) => node.disabled = disabled); }
    });
    form.dataset.caption = caption;
    return form;
  }
  async function loadQueue() {
    const revision = ++queueRevision;
    const query = new URLSearchParams(new FormData(filters)); query.set('page', page);
    const data = await api(`/api/intakes?${query}`); if (revision !== queueRevision || !account) return;
    page = data.page; pages = data.pages;
    const counts = [['Retained requests', data.retainedTotal], ['Awaiting review', data.counts.received + data.counts.in_review], ['Needs information', data.counts.needs_information], ['Approved', data.counts.approved]];
    $('queueCounts').replaceChildren(...counts.map(([caption, count]) => { const item = el('div', undefined, 'review-count'); item.append(el('strong', String(count)), el('span', caption)); return item; }));
    $('queueTotal').textContent = `${data.total} matching`;
    $('queuePage').textContent = `Page ${page} of ${pages}`;
    $('queuePrevious').disabled = page <= 1; $('queueNext').disabled = page >= pages;
    $('queueList').replaceChildren(...data.intakes.map(intake => {
      const link = el('a', undefined, 'queue-item'); link.href = `#${encodeURIComponent(intake.id)}`;
      link.dataset.recordId = intake.id; link.setAttribute('aria-current', String(selected === intake.id));
      link.append(badge(intake.review.status), el('strong', title(intake)), el('p', meta.categories[intake.review.category].label),
        el('p', intake.fields.business_email || intake.fields.email || 'No email supplied'),
        el('small', `${intake.review.assignee?.name || 'Unassigned'} · ${new Date(intake.createdAt).toLocaleDateString()}`));
      if (intake.fields.eld_gps_provider) link.append(el('p', `ELD/GPS: ${intake.fields.eld_gps_provider === 'Other' ? intake.fields.eld_gps_provider_other || 'Other' : intake.fields.eld_gps_provider}`));
      if (intake.fields.gps_pilot_requested === 'yes') link.append(el('small', 'One-truck GPS pilot requested'));
      if (intake.type === 'carrier-onboarding') link.append(el('p', intake.review.automation ? `Automatic checks: ${Date.now() > intake.review.automation.expiresAt ? 'Refresh needed' : label(intake.review.automation.overall)}` : 'Automatic checks: not run'));
      link.addEventListener('click', event => { if (busy) event.preventDefault(); else if (selected === intake.id) { event.preventDefault(); openRecord(intake.id); } });
      return link;
    }));
    if (!data.intakes.length) $('queueList').append(el('p', 'No requests match these filters.', 'review-empty'));
  }
  async function openRecord(id) {
    if (busy || !account) return;
    const revision = ++detailRevision; selected = id; current = null;
    $('reviewDetail').replaceChildren(el('p', 'Loading record…')); message('');
    document.querySelectorAll('.queue-item').forEach(node => node.setAttribute('aria-current', String(node.dataset.recordId === id)));
    try {
      const data = await api(`/api/intakes/${encodeURIComponent(id)}`);
      if (revision !== detailRevision || !account) return;
      current = data; renderDetail();
    } catch (error) {
      if (revision === detailRevision) { $('reviewDetail').replaceChildren(el('p', 'This record could not be loaded.'), button('Retry', () => openRecord(id))); message(error.message, true); }
    }
  }
  function renderDetail() {
    detailRevision++;
    const { intake, review } = current; const root = $('reviewDetail'); root.replaceChildren();
    const editable = openStatuses.includes(review.status); const admin = account.role === 'admin';
    root.append(badge(review.status), el('h2', title(intake)), el('p', intake.id, 'review-record-id'), el('p', `Received ${date(intake.createdAt)} · Revision ${review.version}`, 'review-muted'));
    const toolbar = el('div', undefined, 'review-inline-form'); toolbar.append(button('Reload record', () => openRecord(selected)), button('Download record', exportRecord)); root.append(toolbar);
    const original = el('details'); original.open = true; original.append(el('summary', 'Original submission'));
    const fields = el('dl', undefined, 'review-fields');
    for (const [key, value] of Object.entries(intake.fields)) { const item = el('div'); item.append(el('dt', label(key)), el('dd', value)); fields.append(item); }
    original.append(fields); root.append(original);
    if (intake.type === 'carrier-onboarding' && review.category === 'carrier') {
      const automatic = el('section', undefined, 'review-divider');
      automatic.append(el('h3', 'Automatic carrier checks'), el('p', 'Screening flags help you review the application. You retain final approval. Passed checks describe only the specific comparison shown; they do not approve the carrier.', 'review-help'));
      const report = review.automation;
      if (report) {
        automatic.append(el('p', `Checked ${date(report.checkedAt)} · ${Date.now() > report.expiresAt ? 'Refresh needed: results are over 24 hours old.' : 'Refresh before making a final decision.'}`, 'review-muted'));
        if (!report.providerConfigured) automatic.append(el('p', 'FMCSA lookup is not connected. Add the FMCSA WebKey in server settings to enable registry checks.', 'review-help'));
        const titles = { submission: 'Test submission screening', contact: 'Contact completeness', identifiers: 'MC / USDOT format', identity: 'Registry identity match', authority: 'Registry operating flags', package: 'Package completeness', insurance: 'Insurance evidence', tax_form: 'W-9 evidence', agreement: 'Agreement evidence' };
        const list = el('div', undefined, 'review-checks');
        for (const [id, check] of Object.entries(report.checks)) {
          const card = el('div', undefined, 'review-check');
          card.append(el('h4', titles[id] || label(id)), badge(check.status), el('p', check.summary), el('small', `Source: ${check.source}`, 'review-muted'));
          list.append(card);
        }
        automatic.append(list);
      } else automatic.append(el('p', 'This older intake has not been screened. Run automatic checks to create a dated report.', 'review-help'));
      if (editable) automatic.append(button(report ? 'Run checks again' : 'Run automatic checks', async () => {
        if (busy || !current) return;
        busy = true;
        const controls = [...root.querySelectorAll('button, input, select, textarea')].map(node => [node, node.disabled]);
        controls.forEach(([node]) => node.disabled = true);
        message('Checking carrier details…');
        try {
          current = await api(`/api/intakes/${encodeURIComponent(selected)}/verification`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: review.version }) });
          renderDetail(); message('Automatic checks saved. Review any missing information or exceptions before your decision.');
          loadQueue().catch(error => message(error.message, true));
        } catch (error) { message(error.message, true); }
        finally { busy = false; controls.forEach(([node, disabled]) => node.disabled = disabled); }
      }));
      root.append(automatic);
    }
    if (intake.type === 'carrier-onboarding' && intake.fields.gps_pilot_requested === 'yes') {
      const pilot = el('section', undefined, 'review-divider');
      pilot.append(el('h3', 'GPS pilot setup requested'),
        el('p', `Truck: ${intake.fields.gps_pilot_truck || 'Confirm with the carrier'}.`, 'review-help'),
        el('p', 'Confirm the provider and one truck, then record the carrier and driver authorization references in the review notes. This submission requests contact; it does not authorize or activate tracking.', 'review-help'));
      root.append(pilot);
    }
    const assignment = el('section', undefined, 'review-divider'); assignment.append(el('h3', 'Review ownership'));
    assignment.append(el('p', `${meta.categories[review.category].label} · ${review.assignee?.name || 'No reviewer assigned'}`, 'review-help'));
    if (editable) {
      const assign = reviewForm('assign', values => values, 'Save reviewer');
      assign.append(selectField('assigneeId', [['', 'Unassigned'], ...meta.reviewers.map(user => [user.id, `${user.name} (${label(user.role)})`])], review.assignee?.id || '', 'Assigned reviewer'), submitButton('Save reviewer')); assignment.append(assign);
      const state = reviewForm('status', values => values, 'Save status', 'review-note-form');
      state.append(selectField('status', openStatuses.map(value => [value, meta.statuses[value]]), review.status, 'Review status'), textField('note', 'Status reason'), submitButton('Save status')); assignment.append(state);
      applicantFields(state);
      const classification = el('details'); classification.append(el('summary', 'Change review category'));
      const classify = reviewForm('classify', values => values, 'Change category', 'review-note-form');
      classify.append(el('p', 'Changing the category starts a new checklist. Previous checks remain in the history.', 'review-help'), selectField('category', Object.entries(meta.categories).map(([key, value]) => [key, value.label]), review.category, 'Category'), textField('note', 'Reason for changing category'), submitButton('Change category')); classification.append(classify); assignment.append(classification);
    }
    root.append(assignment);
    const checks = el('section', undefined, 'review-divider'); checks.append(el('h3', 'Supporting checks'), el('p', 'Record what you reviewed and where the evidence is stored. These are staff checks. Use a secure document reference; do not paste tax IDs, bank details, or passwords. “Not applicable” requires a reason.', 'review-help'));
    const checkList = el('div', undefined, 'review-checks');
    for (const [id, caption] of meta.categories[review.category].checks) {
      const check = review.checks[id]; const box = el('div', undefined, 'review-check'); box.append(el('h4', caption));
      if (editable) {
        const form = reviewForm('check', values => ({ ...values, checkId: id }), 'Save check', 'review-check-form');
        const row = el('div', undefined, 'review-check-grid');
        row.append(selectField('status', [['pending', 'Pending'], ['received', 'Received — not verified'], ['verified', 'Verified'], ['not_applicable', 'Not applicable']], check.status, 'Check status'), textField('expiresOn', 'Expiration date (optional)', check.expiresOn, 'date'));
        form.append(row, textField('evidence', 'Evidence reference and review notes', check.evidence), submitButton('Save check')); box.append(form);
      } else { box.append(el('p', label(check.status)), el('p', check.evidence || 'No evidence recorded.')); if (check.expiresOn) box.append(el('p', `Expires ${check.expiresOn}`)); }
      if (check.checkedBy) box.append(el('span', `${check.checkedBy.name} · ${date(check.checkedAt)}`, 'review-muted'));
      checkList.append(box);
    }
    checks.append(checkList); root.append(checks);
    const decision = el('section', undefined, 'review-decision'); decision.append(el('h3', 'Recorded decision'));
    if (review.decision) decision.append(el('p', `Last decision: ${label(review.decision.status)} by ${review.decision.actor.name} on ${date(review.decision.at)}.`), el('p', review.decision.note));
    else decision.append(el('p', 'No approval or rejection has been recorded yet.', 'review-help'));
    if (admin) {
      let choices = editable ? [['approve', 'Approve intake'], ['reject', 'Reject intake']] : [['reopen', 'Reopen for review']];
      if (review.status === 'approved') choices.push(['suspend', 'Suspend approval']);
      const form = reviewForm('decision', values => ({ action: values.decision, note: values.note }), 'Record decision', 'review-note-form');
      form.append(selectField('decision', choices, choices[0][0], 'Decision'), textField('note', 'Decision reason'), el('p', 'Approval requires an assigned reviewer and every supporting check verified or marked not applicable with evidence. This does not activate service or charge the customer.', 'review-help'), submitButton('Record decision')); decision.append(form);
      if (editable) applicantFields(form);
    } else decision.append(el('p', 'An admin must record the final decision. You can prepare the checks and leave notes.', 'review-help'));
    root.append(decision);
    if (intake.type === 'carrier-onboarding') {
      const flow = el('section', undefined, 'review-divider'); flow.append(el('h3', 'Applicant email and onboarding'), el('p', 'Loading workflow…')); root.append(flow);
      const recordId = intake.id;
      api(`/api/intakes/${encodeURIComponent(recordId)}/workflow`).then(data => {
        if (current?.intake.id !== recordId || !flow.isConnected) return;
        flow.replaceChildren(el('h3', 'Applicant email and onboarding'), el('p', data.configured ? 'Applicant email sending is enabled.' : 'Email sending is not enabled or configured. Queued emails will wait.', 'review-help'));
        for (const email of data.emails) flow.append(el('p', `${label(email.kind)} to ${email.recipient}: ${label(email.status)}${email.issue ? ` — ${email.issue}` : ''}`));
        for (const response of data.responses || []) {
          flow.append(el('h4', `Applicant response — ${date(response.at)}`), el('p', response.note));
          if (response.filename) { const download = el('a', `Download ${response.filename} (unverified)`); download.href = `/api/intakes/${recordId}/documents/${response.id}`; flow.append(download); }
        }
        if (data.workflow) {
          flow.append(el('h4', data.workflow.ready ? 'Ready for dispatch' : 'Onboarding incomplete'));
          for (const [step, complete] of Object.entries(data.workflow.steps)) flow.append(el('p', `${label(step)}: ${complete ? 'Complete' : 'Pending'}`));
          if (admin && review.status === 'approved') {
            const setup = el('form', undefined, 'review-note-form');
            setup.append(selectField('dispatcherId', [['', 'Choose dispatcher'], ...meta.reviewers.map(u => [u.id, u.name])], data.workflow.dispatcherId, 'Assigned dispatcher'), textField('billingReference', 'Percentage billing agreement/payment setup reference (weekly billing is checked automatically)', data.workflow.billingReference), submitButton('Save onboarding'));
            setup.addEventListener('submit', async event => {
              event.preventDefault(); if (busy) return; busy = true;
              try { await api(`/api/intakes/${recordId}/workflow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: review.version, ...Object.fromEntries(new FormData(setup)) }) }); busy = false; await openRecord(recordId); message('Onboarding updated. Readiness is checked automatically.'); }
              catch (error) { message(error.message, true); } finally { busy = false; }
            }); flow.append(setup);
          }
        } else flow.append(el('p', 'An applicant workflow starts when you save a decision with applicant email selected.', 'review-help'));
      }).catch(error => { if (flow.isConnected) flow.append(el('p', error.message)); });
    }
    const notes = el('section', undefined, 'review-divider'); notes.append(el('h3', 'Add a review note'));
    const noteForm = reviewForm('note', values => values, 'Add note', 'review-note-form'); noteForm.append(textField('note', 'Internal note'), submitButton('Add note')); notes.append(noteForm); root.append(notes);
    const history = el('section', undefined, 'review-divider'); history.append(el('h3', `Review history (${review.historyCount})`)); const list = el('ol', undefined, 'review-history'); list.id = 'reviewHistory'; history.append(list);
    const pager = el('div', undefined, 'review-pagination'); pager.id = 'historyPager'; history.append(pager); root.append(history);
    historyPage = 1; loadHistory().catch(error => message(error.message, true));
  }
  async function loadHistory() {
    const recordId = selected; const requestedPage = historyPage; const revision = detailRevision;
    const data = await api(`/api/intakes/${encodeURIComponent(recordId)}/history?page=${requestedPage}`);
    if (recordId !== selected || revision !== detailRevision || requestedPage !== historyPage || !account) return;
    $('reviewHistory').replaceChildren(...data.history.map(entry => {
      const item = el('li'); const actor = entry.actor?.name || 'System';
      item.append(el('strong', `${label(entry.action)} · ${actor}`), el('time', `${date(entry.at)} · Revision ${entry.version}`));
      if (entry.note) item.append(el('p', entry.note));
      if (entry.checkId) item.append(el('p', `Check: ${label(entry.checkId)} · ${label(entry.after.status)}`), el('p', entry.after.evidence || 'No evidence recorded.'));
      else if (typeof entry.after === 'string') item.append(el('p', `Status: ${label(entry.before)} → ${label(entry.after)}`));
      else if (entry.action === 'assign') item.append(el('p', `Reviewer: ${entry.before?.name || 'Unassigned'} → ${entry.after?.name || 'Unassigned'}`));
      if (entry.decision || entry.before || entry.after) { const details = el('details'); details.append(el('summary', entry.decision ? 'Decision evidence snapshot' : 'Recorded change'), el('pre', JSON.stringify(entry.decision || { before: entry.before, after: entry.after }, null, 2))); item.append(details); }
      return item;
    }));
    const previous = button('Newer', () => { historyPage--; loadHistory().catch(error => message(error.message, true)); }); previous.disabled = data.page <= 1;
    const next = button('Older', () => { historyPage++; loadHistory().catch(error => message(error.message, true)); }); next.disabled = data.page >= data.pages;
    $('historyPager').replaceChildren(previous, el('span', `Page ${data.page} of ${data.pages}`), next);
  }
  async function exportRecord() {
    if (!current) return;
    try {
      const id = selected; const data = await api(`/api/intakes/${encodeURIComponent(id)}/export`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = el('a'); link.href = url; link.download = `${id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      message('Record downloaded with its original submission and complete review history.');
    } catch (error) { message(error.message, true); }
  }
  filters.addEventListener('submit', event => { event.preventDefault(); page = 1; loadQueue().catch(error => message(error.message, true)); });
  $('refreshQueue').addEventListener('click', () => loadQueue().then(() => message('Queue refreshed.')).catch(error => message(error.message, true)));
  $('queuePrevious').addEventListener('click', () => { page--; loadQueue().catch(error => message(error.message, true)); });
  $('queueNext').addEventListener('click', () => { page++; loadQueue().catch(error => message(error.message, true)); });
  window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (/^[a-zA-Z0-9_-]+$/.test(id)) openRecord(id); });
  window.addEventListener('alphaway:account-changed', event => { if (!['admin', 'dispatcher'].includes(event.detail?.role)) lockAccess(); });
  // Clear private records restored from browser back/forward cache and recheck the session.
  window.addEventListener('pagehide', lockAccess);
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  (async () => {
    try {
      const session = await api('/api/accounts/me'); account = session.account;
      if (!['admin', 'dispatcher'].includes(account?.role)) { lockAccess(); message('Sign in with an active staff account to continue.'); return; }
      meta = await api('/api/intakes/meta');
      for (const [key, caption] of Object.entries(meta.statuses)) { const option = el('option', caption); option.value = key; filters.elements.status.append(option); }
      for (const [key, category] of Object.entries(meta.categories)) { const option = el('option', category.label); option.value = key; filters.elements.category.append(option); }
      for (const user of meta.reviewers) { const option = el('option', user.name); option.value = user.id; filters.elements.assignee.append(option); }
      $('reviewApp').hidden = false; $('refreshQueue').hidden = false; message('');
      await loadQueue();
      const id = location.hash.slice(1); if (/^[a-zA-Z0-9_-]+$/.test(id)) await openRecord(id);
    } catch (error) { message(error.message, true); }
  })();
})();
