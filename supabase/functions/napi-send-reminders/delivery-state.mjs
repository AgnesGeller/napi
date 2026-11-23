export function pendingSubscriptions(subscriptions, deliveredSubscriptionIds, now = Date.now()) {
  const delivered = new Set(deliveredSubscriptionIds || []);
  return (subscriptions || []).filter(subscription => !delivered.has(subscription.id) && (!subscription.access_until || Date.parse(subscription.access_until) > now));
}

export function pushFailureType(status) {
  return status === 404 || status === 410 ? "permanent" : "retry";
}
