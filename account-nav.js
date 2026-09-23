(() => {
  const navs = document.querySelectorAll('header nav');
  if (!navs.length) return;
  let revision = 0;
  let completedRecords = [];
  const HISTORY_PREFIX = '[HARPER_LOAD_COMPLETED]';

  const pathname = () => window.location?.pathname || '';
  const isLiveOperationsPage = () => /\/(admin|workspace|loadboard|tms)\.html$/.test(pathname());

  const requestJson = async (path, options = {}) => {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'The request could not be completed.');
    return payload;
  };

  const productionCopy = (value) => String(value || '')
    .replace(/shared demo catalog/gi, 'shared load catalog')
    .replace(/local demo catalog/gi, 'local load catalog')
    .replace(/original demo catalog/gi, 'default load catalog')
    .replace(/demo catalog/gi, 'load catalog')
    .replace(/demo loads/gi, 'loads')
    .replace(/demo load/gi, 'load')
    .replace(/demo driver assignments/gi, 'driver assignments')
    .replace(/demo vehicle/gi, 'vehicle')
    .replace(/demo tracking/gi, 'tracking')
    .replace(/Demo updating/g, 'Tracking updating')
    .replace(/Demo paused/g, 'Tracking paused')
    .replace(/Demo GPS/g, 'Tracking')
    .replace(/\s*\(demo\)/gi, '')
    .replace(/ mph demo/gi, ' mph')
    .replace(/Connected demo/gi, 'Connected');

  const polishOperationalCopy = () => {
    if (!isLiveOperationsPage()) return;
    document.querySelectorAll('h1,h2,h3,p,span,button,label,strong,small').forEach((element) => {
      if (element.children.length) return;
      const next = productionCopy(element.textContent);
      if (next !== element.textContent) element.textContent = next;
    });
    const title = document.getElementById('adminFormTitle');
    if (title && title.textContent === 'Add a demo load') title.textContent = 'Add a load';
    const save = document.getElementById('saveLoadButton');
    if (save && save.textContent === 'Add load') save.textContent = 'Add load';
  };

  const parseCompletedRecord = (message) => {
    if (!message?.text?.startsWith(HISTORY_PREFIX)) return null;
    try {
      const record = JSON.parse(message.text.slice(HISTORY_PREFIX.length));
      return record?.loadId ? { ...record, lifecycleStatus: 'Delivered / Closed' } : null;
    } catch {
      return null;
    }
  };

  const renderCompletionRecords = () => {
    const list = document.getElementById('completedLoadHistory');
    const status = document.getElementById('completedLoadHistoryStatus');
    const search = document.getElementById('completedLoadSearch');
    const sort = document.getElementById('completedLoadSort');
    if (!list || !status) return;
    const query = String(search?.value || '').trim().toLowerCase();
    const matches = completedRecords.filter((record) => [record.loadId, record.lane, record.driverName, record.truckId, record.equipment, record.notes, record.completedBy]
      .filter(Boolean).join(' ').toLowerCase().includes(query));
    matches.sort((a, b) => (sort?.value === 'oldest' ? 1 : -1) * (Number(b.completedAt || 0) - Number(a.completedAt || 0)));
    list.replaceChildren();
    if (!matches.length) {
      status.textContent = query ? 'No completed loads match that search.' : 'No completed loads have been recorded yet.';
      return;
    }
    matches.slice(0, 100).forEach((record) => {
      const row = document.createElement('div');
      row.className = 'account-user-row';
      const title = document.createElement('strong');
      title.textContent = `${record.loadId} · ${record.lane || 'Route unavailable'}`;
      const statusBadge = document.createElement('span');
      statusBadge.className = 'ops-status delivered';
      statusBadge.textContent = 'Delivered / Closed';
      const details = document.createElement('span');
      const completed = record.completedAt ? new Date(record.completedAt).toLocaleString() : 'Time unavailable';
      const rate = Number(record.rate || 0);
      details.textContent = `${record.driverName || 'Unassigned driver'} · ${record.truckId || 'No truck'} · ${record.equipment || 'Equipment not listed'} · ${rate ? `$${rate.toLocaleString()}` : 'Rate unavailable'} · Completed ${completed}${record.completedBy ? ` by ${record.completedBy}` : ''}${record.notes ? ` · ${record.notes}` : ''}`;
      row.append(title, statusBadge, details);
      list.append(row);
    });
    status.textContent = query
      ? `${matches.length} of ${completedRecords.length} completed loads match your search.`
      : `${completedRecords.length} completed load${completedRecords.length === 1 ? '' : 's'} retained in history.`;
  };

  const renderCompletionHistory = async () => {
    const status = document.getElementById('completedLoadHistoryStatus');
    if (!status) return;
    status.textContent = 'Loading completed loads…';
    try {
      const snapshot = await requestJson('/api/app');
      completedRecords = (snapshot.state?.messages || []).map(parseCompletedRecord).filter(Boolean);
      renderCompletionRecords();
    } catch (error) {
      status.textContent = error.message;
    }
  };

  const ensureAssignmentBridge = async (account) => {
    if (!/\/(loadboard|tms)\.html$/.test(pathname())) return;
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
      const activeLoads = new Map((snapshot.loads || []).map((load) => [load.id, load]));
      const assignments = (operations.operations?.assignments || []).filter((assignment) => activeLoads.has(assignment.loadId));
      list.replaceChildren();
      if (!assignments.length) {
        status.textContent = 'No saved driver assignments match the active load board.';
        return;
      }
      assignments.forEach((assignment) => {
        const load = activeLoads.get(assignment.loadId) || {};
        const row = document.createElement('div');
        row.className = 'account-user-row';
        const title = document.createElement('strong');
        title.textContent = `${assignment.loadId} · ${assignment.driverName}`;
        const badge = document.createElement('span');
        badge.className = `ops-status ${String(assignment.status || 'Dispatched').toLowerCase().replace(/\s+/g, '-')}`;
        badge.textContent = assignment.status || 'Dispatched';
        const details = document.createElement('span');
        details.textContent = `${assignment.truckId || 'No truck'} · Load status: ${load.status || 'Available'} · ${load.lane || 'Route unavailable'}`;
        row.append(title, badge, details);
        list.append(row);
      });
      status.textContent = `${assignments.length} active assignment${assignments.length === 1 ? '' : 's'} saved from the workspace.`;
    } catch (error) {
      status.textContent = error.message;
    }
  };

  const ensureCompletionPanel = (account) => {
    if (!/\/workspace\.html$/.test(pathname())) return;
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
      panel.innerHTML = '<p class="eyebrow">Load lifecycle</p><h2>Complete and close a load</h2><p class="tool-note">Use these stages consistently: <strong>Available</strong> → <strong>Booked</strong> → <strong>Dispatched</strong> → <strong>In transit</strong> → <strong>Delivered / Closed</strong>. Closing a load removes it from the active board and retains its completion record.</p><form id="completeLoadForm" class="operations-form"><label><span>Load ID</span><input name="loadId" required maxlength="28" placeholder="TEST-9002"></label><label><span>Completion notes</span><input name="notes" maxlength="180" placeholder="Delivered and paperwork received"></label><button class="primary-button" type="submit">Mark delivered and close</button><p id="completeLoadStatus" class="form-status" role="status"></p></form><hr><div class="section-panel-header"><div><p class="eyebrow">Load history</p><h3>Completed loads</h3></div></div><div class="operations-form-grid"><label><span>Search completed loads</span><input id="completedLoadSearch" type="search" placeholder="Load ID, driver, truck, route, notes"></label><label><span>Sort</span><select id="completedLoadSort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label></div><p id="completedLoadHistoryStatus" class="tool-note">Loading completed loads…</p><div id="completedLoadHistory" class="account-user-list"></div>';
      document.querySelector('main')?.append(panel);
      document.getElementById('completedLoadSearch')?.addEventListener('input', renderCompletionRecords);
      document.getElementById('completedLoadSort')?.addEventListener('change', renderCompletionRecords);

      document.getElementById('completeLoadForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const status = document.getElementById('completeLoadStatus');
        const submit = form.querySelector('button[type="submit"]');
        if (!status || submit.disabled) return;
        const data = new FormData(form);
        const loadId = String(data.get('loadId') || '').trim().toUpperCase();
        const notes = String(data.get('notes') || '').replace(/[<>]/g, '').trim().slice(0, 180);
        const board = window.AlphawayLoadboard;
        if (!board) { status.textContent = 'Load board connection is unavailable.'; return; }
        submit.disabled = true;
        status.textContent = 'Closing load…';
        try {
          await board.whenReady?.();
          const loads = board.getLoads?.() || [];
          const removedLoad = loads.find((load) => load.id === loadId);
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
            notes,
            lifecycleStatus: 'Delivered / Closed'
          };
          try {
            await board.sendEvent({ type: 'message.send', message: { loadId: 'general', sender: 'Dispatcher', text: `${HISTORY_PREFIX}${JSON.stringify(record)}` } });
          } catch (historyError) {
            await board.saveLoads([...remainingLoads, removedLoad]).catch(() => {});
            throw new Error(`The load could not be archived, so it was restored to the active board. ${historyError.message || ''}`.trim());
          }
          form.reset();
          status.textContent = `${loadId} marked Delivered / Closed, removed from the active board, and saved to completion history.`;
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
    polishOperationalCopy();
  };

  window.addEventListener('alphaway:account-changed', (event) => {
    revision += 1;
    render(event.detail);
  });
  window.addEventListener('alphaway-app-updated', () => {
    polishOperationalCopy();
    fetch('/api/accounts/me', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => response.ok ? response.json() : { account: null })
      .then((payload) => ensureAssignmentBridge(payload.account))
      .catch(() => {});
  });
  // The explicit account and app-update events above keep operational copy in
  // sync. Watching the entire page here can recursively queue mutations when
  // this script updates text, leaving the Admin page unresponsive.
  const initialRevision = revision;
  fetch('/api/accounts/me', { credentials: 'same-origin', cache: 'no-store' })
    .then((response) => response.ok ? response.json() : { account: null })
    .then((payload) => { if (revision === initialRevision) render(payload.account); })
    .catch(() => { if (revision === initialRevision) render(null); });
})();
