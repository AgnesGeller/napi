export function pendingSubscriptions(subscriptions, deliveredSubscriptionIds) {
  const delivered = new Set(deliveredSubscriptionIds || []);
  return (subscriptions || []).filter(subscription => !delivered.has(subscription.id));
}

export function pushFailureType(status) {
  return status === 404 || status === 410 ? "permanent" : "retry";
}
