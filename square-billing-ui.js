(() => {
  const el = id => document.getElementById(id);
  // Read the body as text first, then parse. Calling response.json() directly
  // throws a raw parse error ("Unexpected token ...") whenever the server
  // answers with HTML, plain text or an empty body, and that message was
  // surfacing to the customer on the payment page.
  async function request(path, body) {
    let response;
    try {
      response = await fetch(path,{ method: body ? 'POST' : 'GET', credentials:'same-origin', headers: body ? {'Content-Type':'application/json'} : {}, ...(body ? {body:JSON.stringify(body)} : {}) });
    } catch (networkError) {
      throw new Error('Could not reach billing. Check your connection and try again.');
    }

    const raw = await response.text();
    let result = null;
    if (raw) {
      try { result = JSON.parse(raw); }
      catch (parseError) {
        // Not JSON at all. Never show the parser message to a customer.
        throw new Error(response.ok
          ? 'Billing returned an unexpected response. Please try again.'
          : 'Billing is temporarily unavailable. Please try again shortly.');
      }
    }

    if (!response.ok) {
      throw new Error((result && result.error) || 'Billing is temporarily unavailable. Please try again shortly.');
    }
    return result || {};
  }
  function render(value) {
    const e = value.entry;
    el('mode').textContent = value.environment === 'sandbox' ? 'TEST MODE — no real charges. Test payments never activate customer access.' : 'Secure billing through Square';
    el('status').textContent = !e ? 'Choose your plan from the workspace to begin.' : `Payment status: ${e.status}. ${e.cancelAtPeriodEnd ? 'Renewal cancellation is scheduled.' : ''}`;
    el('details').textContent = !e ? '' : `${e.plan} · ${e.truckCount} truck(s). ${e.onboardingRequired ? e.setupPaid ? 'One-time fleet setup paid.' : 'Step 1: Pay the $150 one-time fleet setup. Step 2: Start the weekly subscription.' : 'No fleet setup payment required.'} ${e.currentPeriodEnd ? 'Paid through '+new Date(e.currentPeriodEnd*1000).toLocaleDateString()+'.' : ''}`;
    el('next').hidden = !e || e.hasSubscription || ['active','past_due','paused','canceled'].includes(e.status);
    el('next').textContent = e?.onboardingRequired && !e.setupPaid ? 'Pay one-time fleet setup' : 'Continue to subscription checkout';
    el('cancel').hidden = !e?.hasSubscription || e.status === 'canceled' || e.cancelAtPeriodEnd;
    el('invoice').hidden = !e?.invoiceUrl; if(e?.invoiceUrl) el('invoice').href=e.invoiceUrl;
  }
  async function run(button, fn) { button.disabled=true; try { await fn(); } catch(e) { el('status').textContent=e.message; } finally { button.disabled=false; } }
  el('refresh').onclick = () => run(el('refresh'),async()=>render(await request('./api/square/refresh',{})));
  el('next').onclick = () => run(el('next'),async()=>{ const result=await request('./api/square/next',{}); window.location.assign(result.url); });
  el('cancel').onclick = () => { if(window.confirm('Cancel automatic renewal of this subscription?')) run(el('cancel'),async()=>{await request('./api/square/cancel',{});render(await request('./api/square/state'));}); };
  el('webhook').onclick = () => run(el('webhook'),async()=>{const r=await request('./api/square/setup-webhook',{});el('status').textContent=r.passed?'Square payment updates connected and verified.':r.pending ? 'Payment updates configured. Delivery confirmation is available in the Square webhook log.' : `Square callback test returned ${r.statusCode}.`;});
  el('probe').onclick = () => run(el('probe'),async()=>{const r=await request('./api/square/connection');el('status').textContent=`Square ${r.environment} connection verified. USD card payments are available.`;});
  el('productionProbe').onclick = () => run(el('productionProbe'),async()=>{const r=await request('./api/square/production-connection');el('productionStatus').textContent=`Production connection verified for ${r.businessName || 'Harper'}. Real charges remain disabled.`;});
  el('testPlan').onsubmit = event => {event.preventDefault(); const form=event.currentTarget; run(form.querySelector('button'),async()=>{ const plan=form.elements.plan.value;await request('./api/billing/checkout',{plan,truckCount:window.AlphawayDispatch.isDispatchPlan(plan)?Number(form.elements.trucks.value):1,billingMethod:'weekly',termsVersion:window.AlphawayDispatch.termsVersion});render(await request('./api/square/state'));});};
  (async()=>{try {const account=await request('./api/accounts/me');const state=await request('./api/square/state');el('admin').hidden=!(account.account?.role==='admin' && state.environment==='sandbox');render(state);if(state.entry)render(await request('./api/square/refresh',{}));}catch(e){el('status').textContent=e.message;}})();
})();
