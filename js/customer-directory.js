(() => {
  "use strict";

  const CONFIG = {
    url: "https://wojgdfojupnfldrmqaht.supabase.co",
    publishableKey: "sb_publishable_sN7FyjIcTYuhQIMomkzkjA_v4xp3N78"
  };
  const SESSION_KEY = "diszkertek-napi-customer-session-v1";
  const CACHE_KEY = "diszkertek-napi-customer-directory-v1";
  const NAPI_ACCOUNT_EMAIL = "tamas@napi.diszkertek.hu";

  function readJSON(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value && typeof value === "object" ? value : null;
    } catch (_) { return null; }
  }

  function storedSession() {
    const value = readJSON(SESSION_KEY);
    return value?.access_token && value?.refresh_token ? value : null;
  }

  function rememberSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function authError(result, fallback) {
    const message = String(result?.msg || result?.message || "").toLocaleLowerCase("hu-HU");
    if (message.includes("invalid login credentials")) return new Error("Hibás PIN-kód, vagy Tamás Napi-fiókja még nincs aktiválva.");
    if (message.includes("rate limit")) return new Error("Túl sok belépési próbálkozás történt. Próbáld újra később.");
    return new Error(result?.msg || result?.message || fallback);
  }

  async function authRequest(path, body) {
    let response;
    try {
      response = await fetch(`${CONFIG.url}/auth/v1/${path}`, {
        method: "POST",
        headers: { "apikey": CONFIG.publishableKey, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch (_) { throw new Error("A belépéshez internetkapcsolat szükséges."); }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw authError(result, "A belépés nem sikerült.");
    return result;
  }

  async function activeSession() {
    let session = storedSession();
    if (!session) throw new Error("Az ügyféllista csatlakoztatása szükséges.");
    const expiresAt = Number(session.expires_at || 0);
    if (!expiresAt || expiresAt > Math.floor(Date.now() / 1000) + 60) return session;
    try {
      session = await authRequest("token?grant_type=refresh_token", { refresh_token: session.refresh_token });
      rememberSession(session);
      return session;
    } catch (error) {
      localStorage.removeItem(SESSION_KEY);
      throw error;
    }
  }

  async function restPage(resource, query, accessToken, from, pageSize) {
    let response;
    try {
      response = await fetch(`${CONFIG.url}/rest/v1/${resource}?${query}`, {
        headers: {
          "apikey": CONFIG.publishableKey,
          "Authorization": `Bearer ${accessToken}`,
          "Accept-Profile": "munkalap",
          "Accept": "application/json",
          "Range": `${from}-${from + pageSize - 1}`
        }
      });
    } catch (_) { throw new Error("Az ügyféllista frissítéséhez internetkapcsolat szükséges."); }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) localStorage.removeItem(SESSION_KEY);
      throw new Error(result?.message || "Az ügyféllista nem tölthető be.");
    }
    return Array.isArray(result) ? result : [];
  }

  async function restRows(resource, query, accessToken) {
    const pageSize = 1000;
    const rows = [];
    for (let from = 0; ; from += pageSize) {
      const page = await restPage(resource, query, accessToken, from, pageSize);
      rows.push(...page);
      if (page.length < pageSize) return rows;
    }
  }

  async function signIn(pin) {
    if (!pin) throw new Error("Add meg Tamás PIN-kódját.");
    const session = await authRequest("token?grant_type=password", { email: NAPI_ACCOUNT_EMAIL, password: pin });
    rememberSession(session);
    return session;
  }

  async function list() {
    const session = await activeSession();
    const [customers, locations] = await Promise.all([
      restRows("customers", "select=id,full_name,updated_at&active=eq.true&review_status=eq.approved&archived_at=is.null&order=full_name.asc", session.access_token),
      restRows("customer_locations", "select=id,customer_id,label,address,updated_at&active=eq.true&review_status=eq.approved&order=address.asc", session.access_token)
    ]);
    const customerById = new Map(customers.map(customer => [customer.id, customer]));
    const directory = locations.flatMap(location => {
      const customer = customerById.get(location.customer_id);
      if (!customer) return [];
      return [{
        id: location.id,
        customerId: customer.id,
        locationId: location.id,
        name: customer.full_name,
        address: location.address,
        locationLabel: location.label || "",
        active: true,
        updatedAt: [customer.updated_at, location.updated_at].filter(Boolean).sort().at(-1) || ""
      }];
    });
    customers.filter(customer => !directory.some(item => item.customerId === customer.id)).forEach(customer => directory.push({
      id: `customer-${customer.id}`,
      customerId: customer.id,
      locationId: null,
      name: customer.full_name,
      address: "",
      locationLabel: "",
      active: true,
      updatedAt: customer.updated_at || ""
    }));
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), directory }));
    return directory;
  }

  function cached() {
    const value = readJSON(CACHE_KEY);
    return { directory: Array.isArray(value?.directory) ? value.directory : [], savedAt: value?.savedAt || null };
  }

  async function signOut() {
    const session = storedSession();
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(CACHE_KEY);
    if (!session?.access_token) return;
    try {
      await fetch(`${CONFIG.url}/auth/v1/logout`, {
        method: "POST",
        headers: { "apikey": CONFIG.publishableKey, "Authorization": `Bearer ${session.access_token}` }
      });
    } catch (_) { /* A helyi kijelentkezés hálózati hiba esetén is megtörténik. */ }
  }

  window.NapiCustomerDirectory = {
    signIn,
    signOut,
    list,
    cached,
    session: activeSession,
    hasSession: () => Boolean(storedSession())
  };
})();
