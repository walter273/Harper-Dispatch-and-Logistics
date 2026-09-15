(() => {
  const navs = document.querySelectorAll('header nav');
  if (!navs.length) return;
  let revision = 0;
  const HISTORY_PREFIX = '[HARPER_LOAD_COMPLETED]';

  const requestJson = async (path, options = {}) => {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'The request could not be completed.');
    return payload;
  };

  const parseCompletedRecord = (message) => {
    if (!message?.text?.startsWith(HISTORY_PREFIX)) return null;
    try {
      const record = JSON.parse(message.text.slice(HISTORY_PREFIX.length));
      return record?.loadId ? record : null;
    } catch {
      return null;
    }
  };

  const renderCompletionHistory = async () => {
    const list = document.getElementById('completedLoadHistory');
    const status = document.getElementById('completedLoadHistoryStatus');
    if (!list || !status) return;
    status.textContent = 'Loading completed loads…';
    try {
      const snapshot = await requestJson('/api/app');
      const records = (snapshot.state?.messages || []).map(parseCompletedRecord).filter(Boolean).sort((a, b) => Number(b.completedAt || 0) - Number(a.completedAt || 0));
      list.replaceChildren();
      if (!records.length) {
        status.textContent = 'No completed loads have been recorded yet.';
        return;
      }
      records.slice(0, 50).forEach((record) => {
        const row = document.createElement('div');
        row.className = 'account-user-row';
        const title = document.createElement('strong');
        title.textContent = `${record.loadId} · ${record.lane || 'Route unavailable'}`;
        const details = document.createElement('span');
        const completed = record.completedAt ? new Date(record.completedAt).toLocaleString() : 'Time unavailable';
        details.textContent = `${record.driverName || 'Unassigned driver'} · ${record.truckId || 'No truck'} · ${record.rate ? `$${Number(record.rate).toLocaleString()}` : 'Rate unavailable'} · Completed ${completed}${record.completedBy ? ` by ${record.completedBy}` : ''}`;
        row.append(title, details);
        list.append(row);
      });
      status.textContent = `${records.length} completed load${records.length === 1 ? '' : 's'} retained in history.`;
    } catch (error) {
      status.textContent = error.message;
    }
  };

  const ensureAssignmentBridge = async (account) => {
    const pathname = window.location?.pathname || '';
    if (!/\/(loadboard|tms)\.html$/.test(pathname)) return;
    const host = document.getElementById('tmsDriverList');
    if (!host) return;
    let panel = document.getElementById('savedDriverAssignments');
    if (!account) {
      panel?.remove();
      return;
    }
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'savedDriverAssignments';
      panel.className = 'portal-panel';
      panel.innerHTML = '<p class="eyebrow">Dispatch assignments</p><h3>Saved driver assignments</h3><p id="savedDriverAssignmentsStatus" class="tool-note">Loading assignments…</p><div id="savedDriverAssignmentsList" class="account-user-list"></div>';
      const parent = host.parentElement || host;
      parent.insertAdjacentElement('afterend', panel);
    }
    const status = document.getElementById('savedDriverAssignmentsStatus');
    const list = document.getElementById('savedDriverAssignmentsList');
    if (!status || !list) return;
    try {
      const [operations, snapshot] = await Promise.all([requestJson('/api/operations'), requestJson('/api/app')]);
      const activeIds = new Set((snapshot.loads || []).map((load) => load.id));
      const assignments = (operations.operations?.assignments || []).filter((assignment) => activeIds.has(assignment.loadId));
      list.replaceChildren();
      if (!assignments.length) {
        status.textContent = 'No saved driver assignments match the active load board.';
        return;
      }
      assignments.forEach((assignment) => {
        const row = document.createElement('div');
        row.className = 'account-user-row';
        const title = document.createElement('strong');
        title.textContent = `${assignment.loadId} · ${assignment.driverName}`;
        const details = document.createElement('span');
        details.textContent = `${assignment.truckId || 'No truck'} · ${assignment.status || 'Dispatched'}`;
        row.append(title, details);
        list.append(row);
      });
      status.textContent = `${assignments.length} active assignment${assignments.length === 1 ? '' : 's'} saved from the workspace.`;
    } catch (error) {
      status.textContent = error.message;
    }
  };

  const ensureCompletionPanel = (account) => {
    const pathname = window.location?.pathname || '';
    if (!/\/workspace\.html$/.test(pathname)) return;
    const allowed = ['admin', 'dispatcher'].includes(account?.role);
    let panel = document.getElementById('loadCompletionPanel');
    if (!allowed) {
      panel?.remove();
      return;
    }
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'loadCompletionPanel';
      panel.className = 'portal-panel account-management-panel';
      panel.innerHTML = '<p class="eyebrow">Load lifecycle</p><h2>Complete and close a load</h2><p class="tool-note">Completing a load removes it from the active load board and keeps a permanent completion record here.</p><form id="completeLoadForm" class="operations-form"><label><span>Load ID</span><input name="loadId" required maxlength="28" placeholder="TEST-9001"></label><label><span>Completion notes</span><input name="notes" maxlength="180" placeholder="Delivered and paperwork received"></label><button class="primary-button" type="submit">Mark delivered and close</button><p id="completeLoadStatus" class="form-status" role="status"></p></form><hr><h3>Completed load history</h3><p id="completedLoadHistoryStatus" class="tool-note">Loading completed loads…</p><div id="completedLoadHistory" class="account-user-list"></div>';
      document.querySelector('main')?.append(panel);

      document.getElementById('completeLoadForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const status = document.getElementById('completeLoadStatus');
        const submit = form.querySelector('button[type="submit"]');
        if (!status || submit.disabled) return;
        const loadId = String(new FormData(form).get('loadId') || '').trim().toUpperCase();
        const notes = String(new FormData(form).get('notes') || '').replace(/[<>]/g, '').trim().slice(0, 180);
        const board = window.AlphawayLoadboard;
        if (!board) { status.textContent = 'Load board connection is unavailable.'; return; }
        submit.disabled = true;
        status.textContent = 'Closing load…';
        let removedLoad = null;
        try {
          await board.whenReady?.();
          const loads = board.getLoads?.() || [];
          removedLoad = loads.find((load) => load.id === loadId);
          if (!removedLoad) throw new Error('That load is not on the active board. It may already be completed.');
          const operations = await requestJson('/api/operations');
          const assignment = (operations.operations?.assignments || []).find((item) => item.loadId === loadId) || {};
          const remainingLoads = loads.filter((load) => load.id !== loadId);
          if (!remainingLoads.length) throw new Error('At least one active load must remain on the board. Add another load before closing this one.');
          await board.saveLoads(remainingLoads);
          const record = {
            loadId: removedLoad.id,
            lane: removedLoad.lane || `${removedLoad.origin || ''} → ${removedLoad.destination || ''}`,
            equipment: removedLoad.equipment || '',
            rate: Number(removedLoad.rate || 0),
            driverName: assignment.driverName || 'Unassigned driver',
            truckId: assignment.truckId || 'Unassigned',
            completedAt: Date.now(),
            completedBy: account?.name || 'Harper staff',
            notes
          };
          try {
            await board.sendEvent({ type: 'message.send', message: { loadId: 'general', sender: 'Dispatcher', text: `${HISTORY_PREFIX}${JSON.stringify(record)}` } });
          } catch (historyError) {
            await board.saveLoads([...remainingLoads, removedLoad]).catch(() => {});
            throw new Error(`The load could not be archived, so it was restored to the active board. ${historyError.message || ''}`.trim());
          }
          form.reset();
          status.textContent = `${loadId} marked delivered, removed from the active board, and saved to completion history.`;
          await renderCompletionHistory();
        } catch (error) {
          status.textContent = error.message;
        } finally {
          submit.disabled = false;
        }
      });
    }
    renderCompletionHistory();
  };

  const render = (account) => {
    navs.forEach((nav) => {
      [
        { attribute: 'data-admin-nav', allowed: account?.role === 'admin', href: './admin.html', label: 'Admin' },
        { attribute: 'data-intake-nav', allowed: ['admin', 'dispatcher'].includes(account?.role), href: './intake-review.html', label: 'Intake review' }
      ].forEach(item => {
        let link = nav.querySelector(`[${item.attribute}]`);
        if (!item.allowed) { link?.remove(); return; }
        if (!link) {
          link = document.createElement('a');
          link.href = item.href;
          link.textContent = item.label;
          link.setAttribute(item.attribute, '');
          nav.append(link);
        }
      });
    });
    ensureCompletionPanel(account);
    ensureAssignmentBridge(account);
  };
  window.addEventListener('alphaway:account-changed', (event) => {
    revision += 1;
    render(event.detail);
  });
  window.addEventListener('alphaway-app-updated', () => {
    fetch('/api/accounts/me', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => response.ok ? response.json() : { account: null })
      .then((payload) => ensureAssignmentBridge(payload.account))
      .catch(() => {});
  });
  const initialRevision = revision;
  fetch('/api/accounts/me', { credentials: 'same-origin', cache: 'no-store' })
    .then((response) => response.ok ? response.json() : { account: null })
    .then((payload) => { if (revision === initialRevision) render(payload.account); })
    .catch(() => { if (revision === initialRevision) render(null); });
})();
