import webpush from "npm:web-push@3.6.7";
import { pendingSubscriptions, pushFailureType } from "./delivery-state.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json"
};

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || `HTTP ${response.status}`);
  return text ? JSON.parse(text) : null;
}

Deno.serve(async request => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const [secrets] = await rest("rpc/napi_get_web_push_secrets", { method: "POST", body: "{}" });
    if (!secrets?.public_key || !secrets?.private_key) throw new Error("A Web Push kulcsok hiányoznak.");
    webpush.setVapidDetails("https://agnesgeller.github.io/napi/", secrets.public_key, secrets.private_key);

    const reminders = await rest("rpc/napi_claim_due_reminders", {
      method: "POST",
      body: JSON.stringify({ p_limit: 50 })
    });
    let delivered = 0;
    for (const reminder of reminders || []) {
      const subscriptions = pendingSubscriptions(
        await rest(`napi_push_subscriptions?owner_id=eq.${encodeURIComponent(reminder.owner_id)}&enabled=eq.true&select=id,endpoint,p256dh,auth`),
        reminder.delivered_subscription_ids
      );
      const deliveredSubscriptionIds: string[] = [];
      const errors: string[] = [];
      let retry = false;
      for (const subscription of subscriptions || []) {
        try {
          await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth }
          }, JSON.stringify({
            title: reminder.title,
            body: reminder.body,
            url: `./?date=${reminder.plan_date}`,
            tag: `napi-${reminder.id}`
          }), { TTL: 3600, urgency: "high" });
          deliveredSubscriptionIds.push(subscription.id);
        } catch (error: any) {
          const status = Number(error?.statusCode || 0);
          errors.push(status ? `HTTP ${status}` : String(error?.message || error));
          if (pushFailureType(status) === "permanent") {
            await rest(`napi_push_subscriptions?id=eq.${subscription.id}`, {
              method: "PATCH",
              headers: { Prefer: "return=minimal" },
              body: JSON.stringify({ enabled: false, updated_at: new Date().toISOString() })
            });
          } else retry = true;
        }
      }
      const completion = await rest("rpc/napi_complete_reminder_attempt", {
        method: "POST",
        body: JSON.stringify({
          p_reminder_id: reminder.id,
          p_delivered_subscription_ids: deliveredSubscriptionIds,
          p_errors: errors,
          p_retry: retry
        })
      });
      if (completion?.sent_at) delivered += 1;
    }
    const retentionLimit = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await rest(`napi_notification_reminders?sent_at=lt.${encodeURIComponent(retentionLimit)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await rest(`napi_notification_reminders?failed_at=lt.${encodeURIComponent(retentionLimit)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    return Response.json({ processed: reminders?.length || 0, delivered });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Az értesítések feldolgozása sikertelen." }, { status: 500 });
  }
});
