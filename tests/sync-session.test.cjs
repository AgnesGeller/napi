const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("js/customer-directory.js", "utf8");
const expiredSession = {
  access_token: "old-access",
  refresh_token: "old-refresh",
  expires_at: Math.floor(Date.now() / 1000) - 10
};
const refreshedSession = {
  access_token: "new-access",
  refresh_token: "new-refresh",
  expires_at: Math.floor(Date.now() / 1000) + 3600
};
const values = new Map([["diszkertek-napi-customer-session-v1", JSON.stringify(expiredSession)]]);
let refreshCalls = 0;
const context = {
  window: {},
  localStorage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  },
  fetch: async url => {
    if (!url.includes("grant_type=refresh_token")) throw new Error(`Váratlan kérés: ${url}`);
    refreshCalls += 1;
    await new Promise(resolve => setTimeout(resolve, 10));
    return { ok: true, json: async () => refreshedSession };
  },
  setTimeout,
  Promise,
  Date,
  JSON,
  console
};

vm.runInNewContext(source, context);

(async () => {
  const sessions = await Promise.all(Array.from({ length: 6 }, () => context.window.NapiCustomerDirectory.session()));
  assert.equal(refreshCalls, 1, "A párhuzamos hívások csak egyszer frissíthetik a munkamenetet.");
  assert.ok(sessions.every(session => session.access_token === "new-access"));
  assert.equal(JSON.parse(values.get("diszkertek-napi-customer-session-v1")).refresh_token, "new-refresh");

  await context.window.NapiCustomerDirectory.session();
  assert.equal(refreshCalls, 1, "Az érvényes munkamenetet nem szabad újra frissíteni.");
  console.log("Szinkron-munkamenet teszt: OK");
})().catch(error => { console.error(error); process.exitCode = 1; });
