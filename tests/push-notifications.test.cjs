const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const app = fs.readFileSync("js/app.js", "utf8");
const sync = fs.readFileSync("js/napi-sync.js", "utf8");
const worker = fs.readFileSync("sw.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260928094018_napi_push_notifications.sql", "utf8");

assert.match(app, /reminderTimes:[\s\S]*?\.sort\(\)/, "Az értesítési időpontok normalizálása hiányzik.");
assert.match(app, /\["survey", "meeting"\]\.includes\(type\)/, "Csak felméréshez és megbeszéléshez készülhet értesítés.");
assert.match(sync, /rpc\/napi_save_daily_plan/, "A napi tervnek az atomikus mentési RPC-t kell használnia.");
assert.doesNotMatch(sync, /replacePlanReminders|napi_notification_reminders\?[^`]+DELETE/, "A kliens nem törölheti külön lépésben a nap emlékeztetőit.");
assert.doesNotMatch(sync, /removePlanReminders\(uniqueDates\)/, "A napi terv törlése nem törölheti a megőrzött előjegyzések emlékeztetőit.");
assert.match(worker, /addEventListener\("push"/, "A service workerből hiányzik a háttérértesítés.");
assert.match(worker, /addEventListener\("notificationclick"/, "Az értesítés megnyitási kezelése hiányzik.");
assert.match(html, /id="notificationButton"/, "Az eszköz értesítési kapcsolója hiányzik.");
assert.match(sync, /getPushSubscriptionState/, "Az érvénytelenített értesítési kapcsolat szerveroldali ellenőrzése hiányzik.");
assert.match(app, /ensurePushSubscription/, "Az értesítési kapcsolat automatikus helyreállítása hiányzik.");
assert.match(app, /item\.reminderTimes = \[\.\.\.editingReminderTimes\][\s\S]*?await pushCurrentState\(\)/, "A törölt jelzési időpontot azonnal közösen menteni kell.");
assert.match(migration, /enable row level security/g, "Az értesítési táblák RLS-védelme hiányzik.");
assert.doesNotMatch(sync, /privateKey|private_key/, "A VAPID privát kulcs nem kerülhet a frontendbe.");

const calls = [];
const tokenPayload = Buffer.from(JSON.stringify({ sub: "00000000-0000-0000-0000-000000000001" })).toString("base64url");
const context = {
  window: { NapiCustomerDirectory: { session: async () => ({ access_token: `x.${tokenPayload}.x`, user: { id: "00000000-0000-0000-0000-000000000001" } }) } },
  fetch: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, text: async () => JSON.stringify({ accepted: true, payload: {}, updated_at: "2026-09-29T10:00:00Z" }) };
  },
  atob: value => Buffer.from(value, "base64").toString("utf8"),
  setTimeout, Promise, JSON, Date, console
};
vm.runInNewContext(sync, context);

(async () => {
  await context.window.NapiCloudSync.pushPlan({ date: "2026-10-03", cloudUpdatedAt: "2026-09-29T09:00:00Z", workItems: [] }, { workItemsOnly: true });
  assert.equal(calls.length, 1, "Egy tervmentés egyetlen atomikus hálózati művelet lehet.");
  assert.match(calls[0].url, /rpc\/napi_save_daily_plan$/);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.p_work_items_only, true);
  assert.equal(body.p_base_updated_at, "2026-09-29T09:00:00Z");
  console.log("Telefonos értesítések regressziós teszt: OK");
})().catch(error => { console.error(error); process.exitCode = 1; });
