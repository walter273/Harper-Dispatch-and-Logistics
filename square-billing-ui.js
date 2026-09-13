(() => {
  const el = id => document.getElementById(id);
  async function request(path, body) {
    const response = await fetch(path,{ method: body ? 'POST' : 'GET', credentials:'same-origin', headers: body ? {'Content-Type':'application/json'} : {}, ...(body ? {body:JSON.stringify(body)} : {}) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Billing is unavailable.'); return result;
  }
  function render(value) {
    const e = value.entry;
    el('mode').textContent = value.environment === 'sandbox' ? 'TEST MODE — no real charges. Test payments never activate customer access.' : 'Secure billing through Square';
    el('status').textContent = !e ? 'Choose your plan from the workspace to begin.' : `Payment status: ${e.status}. ${e.cancelAtPeriodEnd ? 'Renewal cancellation is scheduled.' : ''}`;
    el('details').textContent = !e ? '' : `${e.plan} · ${e.truckCount} truck(s). ${e.onboardingRequired ? e.setupPaid ? 'One-time fleet setup paid.' : 'Step 1: Pay the $150 one-time fleet setup. Step 2: Start the weekly subscription.' : 'No fleet setup payment required.'} ${e.currentPeriodEnd ? 'Paid through '+new Date(e.currentPeriodEnd*1000).toLocaleDateString()+'.' : ''}`;
    el('next').hidden = !e || ['active','past_due','paused','canceled'].includes(e.status);
    el('next').textContent = e?.onboardingRequired && !e.setupPaid ? 'Pay one-time fleet setup' : 'Continue to subscription checkout';
    el('cancel').hidden = !e || !['active','past_due','paused'].includes(e.status) || e.cancelAtPeriodEnd;
    el('invoice').hidden = !e?.invoiceUrl; if(e?.invoiceUrl) el('invoice').href=e.invoiceUrl;
  }
  async function run(button, fn) { button.disabled=true; try { await fn(); } catch(e) { el('status').textContent=e.message; } finally { button.disabled=false; } }
  el('refresh').onclick = () => run(el('refresh'),async()=>render(await request('./api/square/refresh',{})));
  el('next').onclick = () => run(el('next'),async()=>{ const result=await request('./api/square/next',{}); window.location.assign(result.url); });
  el('cancel').onclick = () => { if(window.confirm('Cancel automatic renewal of this subscription?')) run(el('cancel'),async()=>{await request('./api/square/cancel',{});render(await request('./api/square/state'));}); };
  el('webhook').onclick = () => run(el('webhook'),async()=>{const r=await request('./api/square/setup-webhook',{});el('status').textContent=r.passed?'Square payment updates connected and verified.':`Square callback test returned ${r.statusCode}.`;});
  el('probe').onclick = () => run(el('probe'),async()=>{const r=await request('./api/square/connection');el('status').textContent=`Square ${r.environment} connection verified. USD card payments are available.`;});
  el('testPlan').onsubmit = event => {event.preventDefault(); const form=event.currentTarget; run(form.querySelector('button'),async()=>{ const plan=form.elements.plan.value;await request('./api/billing/checkout',{plan,truckCount:window.AlphawayDispatch.isDispatchPlan(plan)?Number(form.elements.trucks.value):1,billingMethod:'weekly',termsVersion:window.AlphawayDispatch.termsVersion});render(await request('./api/square/state'));});};
  (async()=>{try {const account=await request('./api/accounts/me');const state=await request('./api/square/state');el('admin').hidden=!(account.account?.role==='admin' && state.environment==='sandbox');render(state);if(state.entry)render(await request('./api/square/refresh',{}));}catch(e){el('status').textContent=e.message;}})();
})();
