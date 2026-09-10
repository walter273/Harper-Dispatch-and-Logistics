const statuses = new Set(['incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused']);
const rank = { active: 0, trialing: 0, pending: 1, incomplete: 2, past_due: 3, paused: 4, unpaid: 5, incomplete_expired: 6, canceled: 7 };
const stripeId = value => typeof value === 'string' ? value : value?.id || '';
function reduceSubscription(previous, event) {
  const object = event.data.object;
  const checkout = event.type.startsWith('checkout.session.');
  const id = stripeId(checkout ? object.subscription : object.id);
  if (!/^sub_[A-Za-z0-9]+$/.test(id)) return previous;
  if (checkout && previous) return previous;
  const metadata = object.metadata || {};
  const status = checkout ? 'pending' : event.type === 'customer.subscription.deleted' ? 'canceled' : statuses.has(object.status) ? object.status : 'pending';
  if (!checkout && previous) {
    if (event.created < (previous.eventCreated || 0)) return previous;
    if (previous.status === 'canceled') return previous;
    if (event.created === previous.eventCreated && (rank[status] ?? 1) <= (rank[previous.status] ?? 1)) return previous;
  }
  // Checkout confirms linkage only. Subscription lifecycle events decide entitlement.
  const periods = object.items?.data?.map(item => item.current_period_end).filter(Number.isSafeInteger) || [];
  return {
    id, customerId: stripeId(object.customer) || previous?.customerId || '',
    userId: previous?.userId || String(metadata.userId || ''),
    companyId: previous?.companyId || String(metadata.companyId || ''),
    plan: ['carrier','shipper','broker'].includes(metadata.plan) ? metadata.plan : previous?.plan || '',
    status, currentPeriodEnd: checkout ? 0 : object.current_period_end || (periods.length ? Math.min(...periods) : previous?.currentPeriodEnd || 0),
    cancelAtPeriodEnd: checkout ? false : Boolean(object.cancel_at_period_end),
    eventCreated: checkout ? 0 : event.created,
    eventId: event.id, updatedAt: Date.now()
  };
}
module.exports = { reduceSubscription };
