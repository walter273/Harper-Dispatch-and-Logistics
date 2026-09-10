(function (root, factory) {
  const catalog = factory();
  if (typeof module === 'object' && module.exports) module.exports = catalog;
  else root.AlphawayDispatch = catalog;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const plans = Object.freeze({
    'dispatch-basic': Object.freeze({ name: 'Basic Dispatch', weeklyCents: 30000, percent: 5 }),
    'dispatch-standard': Object.freeze({ name: 'Standard Dispatch', weeklyCents: 50000, percent: 7 }),
    'dispatch-premium': Object.freeze({ name: 'Premium Dispatch', weeklyCents: 70000, percent: 10 })
  });
  const termsVersion = 'dispatch-2026-09-10-v1';
  const revenueBasis = 'Collected line-haul revenue from loads dispatched by Alphaway. Fuel surcharges, detention, TONU, lumper fees and other reimbursements are excluded.';
  const isDispatchPlan = id => Object.hasOwn(plans, id);
  return Object.freeze({ plans, termsVersion, revenueBasis, isDispatchPlan });
});
