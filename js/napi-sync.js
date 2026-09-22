(() => {
  "use strict";

  const SUPABASE_URL = "https://wojgdfojupnfldrmqaht.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_sN7FyjIcTYuhQIMomkzkjA_v4xp3N78";

  async function sessionDetails() {
    const session = await window.NapiCustomerDirectory?.session?.();
    if (!session?.access_token) throw new Error("A közös adatokhoz csatlakozás szükséges.");
    const tokenPart = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const ownerId = session.user?.id || JSON.parse(atob(tokenPart.padEnd(Math.ceil(tokenPart.length / 4) * 4, "="))).sub;
    return { accessToken: session.access_token, ownerId };
  }

  async function request(resource, { method = "GET", body, prefer = "" } = {}) {
    const { accessToken } = await sessionDetails();
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
    if (!response.ok) throw new Error(result?.message || "A közös mentés most nem érhető el.");
    return result;
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
    return request("napi_daily_plans?on_conflict=owner_id,plan_date", {
      method: "POST",
      body: { owner_id: ownerId, plan_date: plan.date, payload: plan, updated_at: plan.updatedAt || new Date().toISOString() },
      prefer: "resolution=merge-duplicates,return=minimal"
    });
  }

  async function deletePlans(dates) {
    const uniqueDates = [...new Set(dates)].filter(Boolean);
    if (!uniqueDates.length) return;
    return request(`napi_daily_plans?plan_date=in.(${uniqueDates.join(",")})`, { method: "DELETE", prefer: "return=minimal" });
  }

  window.NapiCloudSync = { pull, pushConfig, pushPlan, deletePlans };
})();
