(() => {
  const catalog = window.AlphawayDispatch;
  if (!catalog) return;
  const byId = id => document.getElementById(id);
  const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(cents / 100);
  const request = async (url, options = {}) => {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json' } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Request could not be completed.');
    return result;
  };
  function summary(planId, method, trucks) {
    const plan = catalog.plans[planId];
    if (!plan) return '';
    if (method === 'percentage') return `${plan.name}: ${plan.percent}% of eligible collected revenue; no weekly retainer. ${catalog.revenueBasis} App access included. $150 onboarding once per fleet. Dispatch reviews your request before billing.`;
    if (!Number.isInteger(trucks) || trucks < 1 || trucks > 100) return 'Enter a whole-number truck count from 1 to 100.';
    return `${plan.name}: ${money(plan.weeklyCents * trucks)} per week for ${trucks} truck${trucks === 1 ? '' : 's'}. No percentage fee. App access included. First payment is ${money(plan.weeklyCents * trucks + 15000)} if fleet onboarding has not already been paid; applicable taxes are additional.`;
  }
  const onboardingPlan = byId('onboardingDispatchPlan');
  if (onboardingPlan) {
    const selected = new URLSearchParams(window.location.search).get('plan');
    if (catalog.isDispatchPlan(selected)) onboardingPlan.value = selected;
    const form = onboardingPlan.closest('form');
    const update = () => { byId('onboardingDispatchSummary').textContent = summary(onboardingPlan.value, byId('onboardingBillingMethod').value, Number(form.elements.available_units.value)); };
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    form.addEventListener('reset', () => setTimeout(update, 0));
    update();
  }
  const dispatchForm = byId('dispatchPlanForm');
  if (dispatchForm) {
    const update = () => {
      const method = byId('workspaceBillingMethod').value;
      byId('dispatchQuote').textContent = summary(byId('workspaceDispatchPlan').value, method, Number(byId('carrierTruckCount').value));
      byId('dispatchPlanSubmit').textContent = method === 'weekly' ? 'Continue to weekly Checkout' : 'Request percentage billing';
    };
    dispatchForm.addEventListener('input', update);
    dispatchForm.addEventListener('change', update);
    update();
    dispatchForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (!dispatchForm.reportValidity()) return;
      const status = byId('dispatchPlanStatus');
      const submit = byId('dispatchPlanSubmit');
      const billingMethod = byId('workspaceBillingMethod').value;
      submit.disabled = true;
      status.textContent = billingMethod === 'weekly' ? 'Opening secure weekly Checkout...' : 'Saving your request for dispatch review...';
      try {
        const result = await request(billingMethod === 'weekly' ? './api/stripe/checkout' : './api/dispatch/requests', {
          method: 'POST', body: JSON.stringify({ plan: byId('workspaceDispatchPlan').value, billingMethod, truckCount: Number(byId('carrierTruckCount').value), termsVersion: catalog.termsVersion, requestId: crypto.randomUUID() })
        });
        if (billingMethod === 'weekly') window.location.assign(result.url);
        else { status.textContent = 'Request saved. Dispatch will review your package and agreement before billing. No payment has been taken.'; refreshRequests(); }
      } catch (error) { status.textContent = error.message; }
      finally { submit.disabled = false; }
    });
  }
  let generation = 0;
  let approvedTermsGeneration = 0;
  async function loadApprovedTerms() {
    if (!dispatchForm) return;
    const current = ++approvedTermsGeneration;
    const controls = ['workspaceDispatchPlan', 'workspaceBillingMethod', 'carrierTruckCount'].map(byId);
    const submit = byId('dispatchPlanSubmit');
    submit.disabled = true;
    try {
      const { account } = await request('./api/accounts/me');
      if (current !== approvedTermsGeneration) return;
      if (account?.role !== 'carrier-owner') { controls.forEach(c => c.disabled = false); submit.disabled = !account || account.role !== 'admin'; return; }
      const { onboarding } = await request('./api/onboarding');
      if (current !== approvedTermsGeneration) return;
      if (onboarding) {
        byId('workspaceDispatchPlan').value = onboarding.plan;
        byId('workspaceBillingMethod').value = onboarding.billingMethod;
        byId('carrierTruckCount').value = onboarding.truckCount;
        controls.forEach(c => c.disabled = true);
        dispatchForm.dispatchEvent(new Event('change'));
        submit.disabled = onboarding.status !== 'approved' || (onboarding.billingMethod === 'weekly' && !onboarding.paymentConfigured);
        byId('dispatchPlanStatus').textContent = onboarding.status !== 'approved' ? 'Payment setup is available after approval.' : !onboarding.paymentConfigured && onboarding.billingMethod === 'weekly' ? 'Your approved package is saved. Payment setup is awaiting the Harper team; you have not been charged.' : 'Your approved application details are selected. Contact the team to change them.';
      } else { controls.forEach(c => c.disabled = false); submit.disabled = false; }
    } catch { if (current === approvedTermsGeneration) { submit.disabled = true; byId('dispatchPlanStatus').textContent = 'Sign in and reload to check your approved payment setup.'; } }
  }
  async function refreshRequests() {
    const current = ++generation;
    const list = byId('dispatchRequestsList');
    const panel = byId('dispatchRequestsPanel');
    if (!list || !panel) return;
    list.replaceChildren(); panel.hidden = true;
    try {
      const [{ account }, { requests }] = await Promise.all([request('./api/accounts/me'), request('./api/dispatch/requests')]);
      if (current !== generation) return;
      panel.hidden = requests.length === 0;
      for (const entry of requests) {
        const row = document.createElement('article'); row.className = 'dispatch-request-row';
        const title = document.createElement('strong'); title.textContent = `${catalog.plans[entry.plan].name} - ${entry.percent}% - ${entry.truckCount} trucks`;
        const detail = document.createElement('p'); detail.textContent = `${entry.email} | ${entry.status === 'pending_review' ? 'Pending dispatch review' : 'Withdrawn'} | ${new Date(entry.createdAt).toLocaleDateString()}`;
        row.append(title, detail);
        if (entry.companyId === account?.companyId && entry.status === 'pending_review' && ['admin', 'carrier-owner'].includes(account.role)) {
          const withdraw = document.createElement('button'); withdraw.className = 'ghost-button'; withdraw.textContent = 'Withdraw request';
          withdraw.addEventListener('click', async () => {
            withdraw.disabled = true;
            try { await request('./api/dispatch/requests', { method: 'POST', body: JSON.stringify({ action: 'withdraw', id: entry.id }) }); refreshRequests(); }
            catch (error) { detail.textContent = error.message; withdraw.disabled = false; }
          });
          row.append(withdraw);
        }
        list.append(row);
      }
    } catch { if (current === generation) { list.replaceChildren(); panel.hidden = true; } }
  }
  async function loadIntakes() {
    const panel = byId('dispatchIntakePanel'), list = byId('dispatchIntakeList');
    if (!panel || !list) return;
    try {
      const { intakes } = await request('./api/intakes');
      const carriers = intakes.filter(entry => entry.type === 'carrier-onboarding');
      panel.hidden = false;
      if (!carriers.length) list.textContent = 'No carrier onboarding requests yet.';
      for (const entry of carriers) {
        const row = document.createElement('article'); row.className = 'dispatch-request-row';
        const title = document.createElement('strong'); title.textContent = entry.fields.legal_carrier_name;
        const details = document.createElement('p');
        details.textContent = `${entry.fields.primary_contact} | ${entry.fields.business_email} | ${catalog.plans[entry.fields.dispatch_package]?.name || 'Legacy request'} | ${entry.fields.billing_method || 'Billing to be confirmed'} | ${entry.fields.available_units || 'Unspecified'} trucks`;
        const notes = document.createElement('p'); notes.textContent = entry.fields.operational_notes || '';
        row.append(title, details, notes); list.append(row);
      }
    } catch { panel.hidden = true; list.replaceChildren(); }
  }
  window.addEventListener('alphaway:account-changed', refreshRequests);
  window.addEventListener('alphaway:account-changed', loadApprovedTerms);
  loadApprovedTerms();
  refreshRequests(); loadIntakes();
})();
