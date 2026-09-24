(() => {
  const board = window.HarperLoadboard;
  const boardStateKey = 'harper-loadboard-state';
  const supportedEquipment = ['Dry Van', 'Reefer', 'Flatbed', 'Power Only'];
  const supportedStatuses = ['Hot', 'New', 'Available', 'Booked'];
  const defaultAssignments = [
    { loadId: 'LB-48201', driverName: 'Marcus Lane', truckId: 'TRK-204', status: 'In transit', tracking: { progress: 0.42, speedMph: 64, etaMinutes: 525 } },
    { loadId: 'LB-48322', driverName: 'Daniela Ruiz', truckId: 'TRK-317', status: 'Dispatched', tracking: { progress: 0.12, speedMph: 0, etaMinutes: 845 } },
    { loadId: 'LB-48190', driverName: 'Andre Cole', truckId: 'TRK-185', status: 'Attention', tracking: { progress: 0.58, speedMph: 18, etaMinutes: 640 } },
    { loadId: 'LB-48410', driverName: 'Casey Owens', truckId: 'TRK-278', status: 'In transit', tracking: { progress: 0.31, speedMph: 58, etaMinutes: 430 } }
  ];

  const byId = (id) => document.getElementById(id);
  const setText = (id, value) => {
    const element = byId(id);
    if (element) element.textContent = value;
  };

  const readBoardState = () => {
    const remoteState = board?.getState?.();
    if (remoteState && typeof remoteState === 'object') return remoteState;
    try {
      const state = JSON.parse(localStorage.getItem(boardStateKey) || 'null');
      return state && typeof state === 'object' ? state : {};
    } catch (error) {
      return {};
    }
  };

  const getCatalog = () => board?.getLoads?.() || [];

  function getAssignments(catalog) {
    const storedAssignments = readBoardState()?.tms?.assignments;
    const candidates = Array.isArray(storedAssignments) ? storedAssignments : defaultAssignments;
    const catalogIds = new Set(catalog.map((load) => load.id));
    return candidates
      .filter((assignment) => assignment && catalogIds.has(assignment.loadId))
      .map((assignment) => ({
        loadId: String(assignment.loadId),
        driverName: String(assignment.driverName || 'Unassigned driver'),
        truckId: String(assignment.truckId || 'Unassigned'),
        status: ['Dispatched', 'In transit', 'Attention'].includes(assignment.status) ? assignment.status : 'Dispatched',
        tracking: {
          progress: Math.min(0.96, Math.max(0.04, Number(assignment.tracking?.progress) || 0.04)),
          speedMph: Math.max(0, Math.round(Number(assignment.tracking?.speedMph) || 0)),
          etaMinutes: Math.max(0, Math.round(Number(assignment.tracking?.etaMinutes) || 0))
        }
      }));
  }

  const currency = (amount) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(Number(amount) || 0);

  const statusClass = (status) => String(status || '').toLowerCase().replace(/\s+/g, '-');

  function renderTmsOverview() {
    const trackingList = byId('tmsTrackingList');
    if (!trackingList) return;

    const catalog = getCatalog();
    const assignments = getAssignments(catalog);
    const inTransit = assignments.filter((assignment) => assignment.status === 'In transit').length;
    const attention = assignments.filter((assignment) => assignment.status === 'Attention').length;
    const catalogById = new Map(catalog.map((load) => [load.id, load]));
    const storedState = readBoardState();
    const booked = Array.isArray(storedState.bookedLoads) ? storedState.bookedLoads.filter((id) => catalogById.has(id)).length : 0;

    setText('operationsLoadCount', String(catalog.length));
    setText('operationsDriverCount', String(assignments.length));
    setText('operationsTransitCount', String(inTransit));
    setText('operationsAttentionCount', String(attention));
    setText('operationsBookingCount', String(booked));
    setText('operationsRevenue', currency(catalog.reduce((total, load) => total + Number(load.rate || 0), 0)));
    setText('operationsUpdatedAt', `Snapshot refreshed ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);

    trackingList.replaceChildren();
    if (!assignments.length) {
      const empty = document.createElement('p');
      empty.className = 'ops-empty-state';
      empty.textContent = 'No driver assignments match the active catalog.';
      trackingList.append(empty);
      return;
    }

    assignments.forEach((assignment) => {
      const load = catalogById.get(assignment.loadId);
      const item = document.createElement('article');
      item.className = 'tracking-row';

      const summary = document.createElement('div');
      summary.className = 'tracking-summary';
      const driver = document.createElement('strong');
      driver.textContent = `${assignment.driverName} · ${assignment.truckId}`;
      const route = document.createElement('span');
      route.textContent = `${load.id} · ${load.lane}`;
      summary.append(driver, route);

      const progressWrap = document.createElement('div');
      progressWrap.className = 'tracking-progress-wrap';
      const progressLabel = document.createElement('span');
      progressLabel.textContent = `${Math.round(assignment.tracking.progress * 100)}% route progress`;
      const progress = document.createElement('span');
      progress.className = 'tracking-progress';
      const progressFill = document.createElement('i');
      progressFill.style.width = `${Math.round(assignment.tracking.progress * 100)}%`;
      progress.append(progressFill);
      progressWrap.append(progressLabel, progress);

      const meta = document.createElement('div');
      meta.className = 'tracking-meta';
      const speed = document.createElement('span');
      speed.textContent = assignment.tracking.speedMph ? `${assignment.tracking.speedMph} mph` : 'Awaiting departure';
      const state = document.createElement('span');
      state.className = `ops-status ${statusClass(assignment.status)}`;
      state.textContent = assignment.status;
      meta.append(speed, state);

      item.append(summary, progressWrap, meta);
      trackingList.append(item);
    });
  }

  function formLabel(field) {
    const label = field.closest('label')?.querySelector(':scope > span');
    return label?.textContent?.trim() || field.name.replace(/[_-]+/g, ' ');
  }

  function setupRequestForms() {
    document.querySelectorAll('[data-request-form]').forEach((form) => {
      const status = form.querySelector('[data-form-status]');
      const gpsProvider = form.elements.namedItem('eld_gps_provider');
      const otherProvider = form.elements.namedItem('eld_gps_provider_other');
      if (gpsProvider && otherProvider) {
        const updateProviderRequirement = () => { otherProvider.required = gpsProvider.value === 'Other'; };
        gpsProvider.addEventListener('change', updateProviderRequirement);
        form.addEventListener('reset', () => setTimeout(updateProviderRequirement, 0));
        updateProviderRequirement();
      }
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const fields = {};
        const values = Array.from(new FormData(form).entries())
          .map(([name, value]) => {
            const field = form.elements.namedItem(name);
            const safeValue = String(value || '').replace(/[<>]/g, '').trim();
            const safeName = String(name || '').replace(/[^a-z0-9_-]/gi, '');
            if (field && safeName && safeValue) fields[safeName] = safeValue;
            return field && safeValue ? `${formLabel(field)}: ${safeValue}` : null;
          })
          .filter(Boolean);
        const subject = form.dataset.subject || 'Harper Dispatch and Logistics request';
        const recipient = form.dataset.recipient || 'info@harperloadboard.com';
        const notice = form.dataset.notice || 'Opening a draft in your email app.';

        await board?.whenReady?.();
        if (board?.isServerConnected?.() && form.dataset.requestType) {
          if (status) status.textContent = 'Saving your request…';
          try {
            await board.submitIntake({ type: form.dataset.requestType, fields });
            form.reset();
            if (status) status.textContent = 'Request saved for the Harper Dispatch and Logistics team.';
          } catch (error) {
            if (status) status.textContent = error.message || 'We could not save your request.';
          }
          return;
        }

        if (form.dataset.requestType === 'carrier-onboarding') {
          if (status) status.textContent = 'The request could not reach the app. Please retry when the connection is restored.';
          return;
        }
        if (status) status.textContent = notice;
        window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(values.join('\n'))}`;
      });
    });
  }

  function safeAdminText(value, maxLength = 90) {
    return String(value || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }

  function renderAdminTable(catalog, query = '') {
    const tableBody = byId('adminLoadRows');
    const count = byId('adminLoadCount');
    if (!tableBody) return;
    const normalizedQuery = safeAdminText(query).toLowerCase();
    const visibleLoads = catalog.filter((load) => [load.id, load.origin, load.destination, load.equipment, load.broker, load.status]
      .join(' ')
      .toLowerCase()
      .includes(normalizedQuery));

    if (count) count.textContent = `${visibleLoads.length} of ${catalog.length} loads`;
    tableBody.replaceChildren();

    if (!visibleLoads.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.className = 'admin-empty-cell';
      cell.textContent = 'No loads match this catalog search.';
      row.append(cell);
      tableBody.append(row);
      return;
    }

    visibleLoads.forEach((load) => {
      const row = document.createElement('tr');
      const cells = [load.id, load.lane, load.equipment, load.broker, currency(load.rate), load.status];
      cells.forEach((value, index) => {
        const cell = document.createElement('td');
        if (index === 5) {
          const badge = document.createElement('span');
          badge.className = `ops-status ${statusClass(value)}`;
          badge.textContent = value;
          cell.append(badge);
        } else {
          cell.textContent = value;
        }
        row.append(cell);
      });

      const actions = document.createElement('td');
      actions.className = 'admin-row-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'ghost-button compact-button';
      edit.dataset.editLoad = load.id;
      edit.textContent = 'Edit';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'link-button destructive-button';
      remove.dataset.removeLoad = load.id;
      remove.textContent = 'Remove';
      actions.append(edit, remove);
      row.append(actions);
      tableBody.append(row);
    });
  }

  function setupAdminPage() {
    const form = byId('adminLoadForm');
    const tableBody = byId('adminLoadRows');
    if (!form || !tableBody || !board) return;

    const status = byId('adminStatus');
    const search = byId('adminSearch');
    const reset = byId('resetCatalogButton');
    const exportButton = byId('exportCatalogButton');
    const importInput = byId('importCatalogInput');
    const cancel = byId('cancelLoadEdit');
    const formTitle = byId('adminFormTitle');
    const save = byId('saveLoadButton');
    const idField = form.elements.namedItem('id');
    let editingId = null;

    const report = (message, isError = false) => {
      if (!status) return;
      status.textContent = message;
      status.classList.toggle('is-error', isError);
    };

    const clearForm = () => {
      editingId = null;
      form.reset();
      if (idField) idField.readOnly = false;
      if (formTitle) formTitle.textContent = 'Add a load';
      if (save) save.textContent = 'Add load';
      if (cancel) cancel.hidden = true;
    };

    const updateTable = () => renderAdminTable(getCatalog(), search?.value || '');

    const editLoad = (load) => {
      if (!load) return;
      editingId = load.id;
      Object.entries(load).forEach(([name, value]) => {
        const field = form.elements.namedItem(name);
        if (field) field.value = value;
      });
      if (idField) idField.readOnly = true;
      if (formTitle) formTitle.textContent = `Edit ${load.id}`;
      if (save) save.textContent = 'Save changes';
      if (cancel) cancel.hidden = false;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const id = safeAdminText(formData.get('id'), 28).toUpperCase().replace(/[^A-Z0-9-]/g, '');
      const origin = safeAdminText(formData.get('origin'));
      const destination = safeAdminText(formData.get('destination'));
      const broker = safeAdminText(formData.get('broker'));
      const pickup = safeAdminText(formData.get('pickup'), 60);
      const delivery = safeAdminText(formData.get('delivery'), 60);

      if (!id || !origin || !destination || !broker || !pickup || !delivery) {
        report('Complete the load ID, route, broker, pickup, and delivery fields.', true);
        return;
      }

      const candidate = {
        id,
        origin,
        destination,
        equipment: supportedEquipment.includes(formData.get('equipment')) ? formData.get('equipment') : 'Dry Van',
        miles: Math.max(0, Number(formData.get('miles')) || 0),
        rate: Math.max(0, Number(formData.get('rate')) || 0),
        pickup,
        delivery,
        weight: safeAdminText(formData.get('weight'), 40) || 'TBD',
        broker,
        status: supportedStatuses.includes(formData.get('status')) ? formData.get('status') : 'Available'
      };

      const catalog = getCatalog();
      const position = catalog.findIndex((load) => load.id === (editingId || id));
      const nextCatalog = position === -1
        ? [candidate, ...catalog]
        : catalog.map((load, index) => index === position ? candidate : load);

      try {
        await board.saveLoads(nextCatalog);
        updateTable();
        clearForm();
        report(`${candidate.id} saved to the ${board.isServerConnected() ? 'shared' : 'local'} load catalog.`);
      } catch (error) {
        report(error.message || 'The load catalog could not be saved.', true);
      }
    });

    tableBody.addEventListener('click', async (event) => {
      const editButton = event.target.closest('[data-edit-load]');
      const removeButton = event.target.closest('[data-remove-load]');
      if (editButton) editLoad(getCatalog().find((load) => load.id === editButton.dataset.editLoad));
      if (removeButton) {
        const loadId = removeButton.dataset.removeLoad;
        if (!window.confirm(`Remove ${loadId} from the ${board.isServerConnected() ? 'shared' : 'local'} load catalog?`)) return;
        try {
          await board.saveLoads(getCatalog().filter((load) => load.id !== loadId));
          updateTable();
          if (editingId === loadId) clearForm();
          report(`${loadId} removed from the ${board.isServerConnected() ? 'shared' : 'local'} load catalog.`);
        } catch (error) {
          report(error.message || 'At least one load must remain.', true);
        }
      }
    });

    search?.addEventListener('input', updateTable);
    cancel?.addEventListener('click', () => {
      clearForm();
      report('Edit cancelled.');
    });
    reset?.addEventListener('click', async () => {
      if (!window.confirm(`Restore the default load catalog? Your ${board.isServerConnected() ? 'shared' : 'local'} catalog edits will be removed.`)) return;
      try {
        await board.resetLoads();
        updateTable();
        clearForm();
        report('Default loads restored.');
      } catch (error) {
        report(error.message || 'The load catalog could not be restored.', true);
      }
    });
    exportButton?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(getCatalog(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'harper-load-catalog.json';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      report(`${board.isServerConnected() ? 'Shared' : 'Local'} load catalog exported.`);
    });
    importInput?.addEventListener('change', () => {
      const file = importInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.addEventListener('load', async () => {
        try {
          const parsed = JSON.parse(String(reader.result || 'null'));
          await board.saveLoads(parsed);
          updateTable();
          clearForm();
          report(`${board.isServerConnected() ? 'Shared' : 'Local'} load catalog imported.`);
        } catch (error) {
          report('Choose a JSON file containing one or more valid loads.', true);
        }
      });
      reader.readAsText(file);
      importInput.value = '';
    });

    window.addEventListener('storage', (event) => {
      if (event.key === board.catalogStorageKey) updateTable();
    });
    window.addEventListener('harper-app-updated', updateTable);

    clearForm();
    updateTable();
  }

  setupRequestForms();
  renderTmsOverview();
  setupAdminPage();

  window.addEventListener('storage', (event) => {
    if (event.key === boardStateKey || event.key === board?.catalogStorageKey) renderTmsOverview();
  });
  window.addEventListener('harper-app-updated', renderTmsOverview);
  board?.whenReady?.().then(renderTmsOverview);
})();

