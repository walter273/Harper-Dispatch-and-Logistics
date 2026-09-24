(function (root, factory) {
  const catalog = factory();
  if (typeof module === 'object' && module.exports) module.exports = catalog;
  else root.HarperDispatch = catalog;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const plans = Object.freeze({
    'dispatch-basic': Object.freeze({ name: 'Carrier Dispatch', weeklyCents: 0, percent: 5 })
  });
  const termsVersion = 'dispatch-2026-09-18-v2';
  const revenueBasis = 'Collected line-haul revenue from loads dispatched by Harper Dispatch and Logistics. Fuel surcharges, detention, TONU, lumper fees and other reimbursements are excluded.';
  const isDispatchPlan = id => Object.hasOwn(plans, id);
  return Object.freeze({ plans, termsVersion, revenueBasis, isDispatchPlan });
});
