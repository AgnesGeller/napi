(() => {
  "use strict";

  const SUPABASE_URL = "https://wojgdfojupnfldrmqaht.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_sN7FyjIcTYuhQIMomkzkjA_v4xp3N78";
  const VAPID_PUBLIC_KEY = "BGBc5hwEZ6yzTzS1QXsFPZf3u1zFHC3Cn8Fy3bC4f2s1VKgdJUuhSiLZT61eCYOGo8lT0m-NRtqoSjRNZBshpro";
  const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const isClockSkewError = result => /jwt issued at future/i.test(String(result?.msg || result?.message || ""));

  async function sessionDetails() {
    const session = await window.NapiCustomerDirectory?.session?.();
    if (!session?.access_token) throw new Error("A közös adatokhoz csatlakozás szükséges.");
    const tokenPart = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const ownerId = session.user?.id || JSON.parse(atob(tokenPart.padEnd(Math.ceil(tokenPart.length / 4) * 4, "="))).sub;
    return { accessToken: session.access_token, ownerId };
  }

  async function request(resource, { method = "GET", body, prefer = "" } = {}) {
    const { accessToken } = await sessionDetails();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${resource}`, {
        method,
        headers: {
          apikey: PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(prefer ? { Prefer: prefer } : {})
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const text = await response.text();
      const result = text ? JSON.parse(text) : null;
      if (response.ok) return result;
      if (isClockSkewError(result) && attempt < 2) { await wait(attempt ? 2500 : 1200); continue; }
      if (response.status === 401 && !isClockSkewError(result)) {
        window.NapiCustomerDirectory?.clearSession?.();
        throw new Error("A kapcsolat lejárt. Lépj be újra Tamás új PIN-kódjával.");
      }
      throw new Error(isClockSkewError(result) ? "Az időellenőrzés miatt a kapcsolat késett. Próbáld meg újra a frissítést." : (result?.message || "A közös mentés most nem érhető el."));
    }
  }

  async function pull() {
    const [configRows, planRows] = await Promise.all([
      request("napi_app_config?select=payload,updated_at&limit=1"),
      request("napi_daily_plans?select=plan_date,payload,updated_at&order=plan_date.desc")
    ]);
    return { config: configRows?.[0] || null, plans: Array.isArray(planRows) ? planRows : [] };
  }

  async function pushConfig(payload) {
    const { ownerId } = await sessionDetails();
    return request("napi_app_config?on_conflict=owner_id", {
      method: "POST",
      body: { owner_id: ownerId, payload, updated_at: new Date().toISOString() },
      prefer: "resolution=merge-duplicates,return=minimal"
    });
  }

  async function pushPlan(plan) {
    const { ownerId } = await sessionDetails();
    const result = await request("rpc/napi_upsert_daily_plan", {
      method: "POST",
      body: { p_owner_id: ownerId, p_plan_date: plan.date, p_payload: plan, p_updated_at: plan.updatedAt || new Date().toISOString() }
    });
    if (result !== false) await replacePlanReminders(plan);
    return result;
  }

  function reminderRows(plan, ownerId) {
    return (plan.workItems || []).flatMap(item => {
      if (!["survey", "meeting"].includes(item.type)) return [];
      return [...new Set(item.reminderTimes || [])].filter(time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)).map(time => {
        const scheduled = new Date(`${plan.date}T${time}:00`);
        const type = item.type === "survey" ? "Felmérés" : "Megbeszélés";
        const details = [item.address, item.note].filter(Boolean).join(" – ");
        return {
          owner_id: ownerId,
          plan_date: plan.date,
          work_item_id: item.id,
          notification_type: item.type,
          title: `${type}: ${item.customerName || "Nincs megadva"}`,
          body: details || "Nyisd meg a Napi feladatok alkalmazást a részletekért.",
          scheduled_for: scheduled.toISOString(),
          updated_at: new Date().toISOString()
        };
      });
    });
  }

  async function replacePlanReminders(plan) {
    const { ownerId } = await sessionDetails();
    await request(`napi_notification_reminders?owner_id=eq.${ownerId}&plan_date=eq.${encodeURIComponent(plan.date)}&sent_at=is.null`, { method: "DELETE", prefer: "return=minimal" });
    const rows = reminderRows(plan, ownerId);
    if (rows.length) await request("napi_notification_reminders?on_conflict=owner_id,work_item_id,scheduled_for", {
      method: "POST", body: rows, prefer: "resolution=merge-duplicates,return=minimal"
    });
  }

  async function removePlanReminders(dates) {
    const { ownerId } = await sessionDetails();
    const filter = [...new Set(dates)].filter(Boolean).map(date => encodeURIComponent(date)).join(",");
    if (filter) await request(`napi_notification_reminders?owner_id=eq.${ownerId}&plan_date=in.(${filter})`, { method: "DELETE", prefer: "return=minimal" });
  }

  async function deletePlans(dates) {
    const uniqueDates = [...new Set(dates)].filter(Boolean);
    if (!uniqueDates.length) return;
    const filter = uniqueDates.map(date => encodeURIComponent(date)).join(",");
    const currentRows = await request(`napi_daily_plans?select=plan_date,updated_at,payload&plan_date=in.(${filter})`);
    const currentByDate = new Map((currentRows || []).map(row => [row.plan_date, row]));
    await Promise.all(uniqueDates.map(date => {
      const current = currentByDate.get(date);
      const currentTimestamp = Date.parse(current?.updated_at || "") || 0;
      const deletedAt = new Date(Math.max(Date.now(), currentTimestamp + 1)).toISOString();
      return pushPlan({ date, deleted: true, deletedPlanId: current?.payload?.id || current?.payload?.deletedPlanId || null, updatedAt: deletedAt });
    }));
    const rows = await request(`napi_daily_plans?select=plan_date,payload&plan_date=in.(${filter})`);
    const confirmed = new Set((rows || []).filter(row => row.payload?.deleted).map(row => row.plan_date));
    if (uniqueDates.some(date => !confirmed.has(date))) throw new Error("A teljes nap törlésének közös megerősítése nem sikerült.");
    await removePlanReminders(uniqueDates);
    return rows;
  }

  async function savePushSubscription(subscription, deviceName) {
    const { ownerId } = await sessionDetails();
    const json = subscription.toJSON();
    return request("napi_push_subscriptions?on_conflict=owner_id,endpoint", {
      method: "POST",
      body: { owner_id: ownerId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, device_name: deviceName || "Android telefon", enabled: true, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      prefer: "resolution=merge-duplicates,return=minimal"
    });
  }

  async function disablePushSubscription(endpoint) {
    const { ownerId } = await sessionDetails();
    return request(`napi_push_subscriptions?owner_id=eq.${ownerId}&endpoint=eq.${encodeURIComponent(endpoint)}`, {
      method: "PATCH", body: { enabled: false, updated_at: new Date().toISOString() }, prefer: "return=minimal"
    });
  }

  window.NapiCloudSync = { pull, pushConfig, pushPlan, deletePlans, savePushSubscription, disablePushSubscription, vapidPublicKey: VAPID_PUBLIC_KEY };
})();
