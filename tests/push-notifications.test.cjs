const assert = require("node:assert/strict");
const fs = require("node:fs");

const app = fs.readFileSync("js/app.js", "utf8");
const sync = fs.readFileSync("js/napi-sync.js", "utf8");
const worker = fs.readFileSync("sw.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260928130000_napi_push_notifications.sql", "utf8");

assert.match(app, /reminderTimes:[\s\S]*?\.sort\(\)/, "Az értesítési időpontok normalizálása hiányzik.");
assert.match(app, /\["survey", "meeting"\]\.includes\(type\)/, "Csak felméréshez és megbeszéléshez készülhet értesítés.");
assert.match(sync, /replacePlanReminders\(plan\)/, "A napi terv mentésének az értesítéseket is szinkronizálnia kell.");
assert.match(sync, /removePlanReminders\(uniqueDates\)/, "A teljes nap törlésekor az értesítéseket is törölni kell.");
assert.match(worker, /addEventListener\("push"/, "A service workerből hiányzik a háttérértesítés.");
assert.match(worker, /addEventListener\("notificationclick"/, "Az értesítés megnyitási kezelése hiányzik.");
assert.match(html, /id="notificationButton"/, "Az eszköz értesítési kapcsolója hiányzik.");
assert.match(migration, /enable row level security/g, "Az értesítési táblák RLS-védelme hiányzik.");
assert.doesNotMatch(sync, /privateKey|private_key/, "A VAPID privát kulcs nem kerülhet a frontendbe.");

console.log("Telefonos értesítések regressziós teszt: OK");
