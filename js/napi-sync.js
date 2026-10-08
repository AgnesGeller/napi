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
        ...(method === "GET" ? { cache: "no-store" } : {}),
        headers: {
          apikey: PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(method === "GET" ? { "Cache-Control": "no-cache" } : {}),
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

  async function pushConfig(changes) {
    const { ownerId } = await sessionDetails();
    return request("rpc/napi_merge_app_config", {
      method: "POST",
      body: { p_owner_id: ownerId, p_changes: changes }
    });
  }

  async function pushPlan(plan, { workItemsOnly = false } = {}) {
    const { ownerId } = await sessionDetails();
    return request("rpc/napi_save_daily_plan", {
      method: "POST",
      body: { p_owner_id: ownerId, p_plan_date: plan.date, p_payload: plan, p_base_updated_at: plan.cloudUpdatedAt || null, p_work_items_only: workItemsOnly }
    });
  }

  async function deletePlans(dates, localPlans = []) {
    const uniqueDates = [...new Set(dates)].filter(Boolean);
    if (!uniqueDates.length) return;
    const filter = uniqueDates.map(date => encodeURIComponent(date)).join(",");
    const currentRows = await request(`napi_daily_plans?select=plan_date,updated_at,payload&plan_date=in.(${filter})`);
    const currentByDate = new Map((currentRows || []).map(row => [row.plan_date, row]));
    const results = await Promise.all(uniqueDates.map(async date => {
      const current = currentByDate.get(date);
      const currentTimestamp = Date.parse(current?.updated_at || "") || 0;
      const deletedAt = new Date(Math.max(Date.now(), currentTimestamp + 1)).toISOString();
      const local = localPlans.find(plan => plan.date === date);
      const deletedIds = [...new Set([...(current?.payload?.deletedWorkItemIds || []), ...(local?.deletedWorkItemIds || [])])];
      const workItems = window.NapiDomain.mergeWorkItems(local?.workItems, current?.payload?.workItems, deletedIds);
      const payload = workItems.length
        ? { ...window.NapiDomain.clearDailyTasks(current?.payload?.deleted ? local || { date } : current?.payload || local || { date }), date, workItems, deletedWorkItemIds: deletedIds, deleted: false }
        : { date, deleted: true, deletedPlanId: current?.payload?.id || current?.payload?.deletedPlanId || null };
      const result = await pushPlan({ ...payload, updatedAt: deletedAt, cloudUpdatedAt: current?.updated_at || null });
      if (result?.accepted === false) throw new Error("A nap közben megváltozott. A frissebb közös adat megmaradt; a törlést újrapróbáljuk.");
      return { plan_date: date, payload: result?.payload, updated_at: result?.updated_at };
    }));
    if (results.some(row => !row.payload || (!row.payload.deleted && row.payload.tasks?.length))) throw new Error("A napi terv törlésének közös megerősítése nem sikerült.");
    // Az emlékeztetőket a mentési RPC a megőrzött előjegyzésekből kezeli atomikusan.
    return results;
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

  async function getPushSubscriptionState(endpoint) {
    const rows = await request(`napi_push_subscriptions?select=enabled,last_seen_at&endpoint=eq.${encodeURIComponent(endpoint)}&limit=1`);
    return rows?.[0] || null;
  }

  async function disablePushSubscription(endpoint) {
    const { ownerId } = await sessionDetails();
    return request(`napi_push_subscriptions?owner_id=eq.${ownerId}&endpoint=eq.${encodeURIComponent(endpoint)}`, {
      method: "PATCH", body: { enabled: false, updated_at: new Date().toISOString() }, prefer: "return=minimal"
    });
  }

  window.NapiCloudSync = { pull, pushConfig, pushPlan, deletePlans, savePushSubscription, getPushSubscriptionState, disablePushSubscription, vapidPublicKey: VAPID_PUBLIC_KEY };
})();
