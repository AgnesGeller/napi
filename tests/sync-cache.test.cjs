const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// A service worker nem foghatja meg a Supabase-adatkéréseket: különben minden
// eszköz a saját első válaszát látná az aktuális közös állapot helyett.
const workerListeners = {};
const workerContext = {
  self: {
    location: { origin: "https://agnesgeller.github.io" },
    addEventListener: (type, listener) => { workerListeners[type] = listener; },
    skipWaiting() {},
    clients: { claim() {} },
    registration: { showNotification() {} }
  },
  caches: {},
  clients: {},
  URL,
  Promise,
  console
};
vm.runInNewContext(fs.readFileSync("sw.js", "utf8"), workerContext);

let crossOriginIntercepted = false;
workerListeners.fetch({
  request: { method: "GET", url: "https://wojgdfojupnfldrmqaht.supabase.co/rest/v1/napi_daily_plans", mode: "cors", destination: "" },
  respondWith() { crossOriginIntercepted = true; }
});
assert.equal(crossOriginIntercepted, false, "A service worker nem cache-elheti a Supabase napi terveket.");

// A közvetlen klienslekérés is tiltja a HTTP-gyorsítótárat. Három külön kliens
// ugyanazon az optimista zárolású szerverállapoton hoz létre, módosít és tölt le.
const syncSource = fs.readFileSync("js/napi-sync.js", "utf8");
let serverRow = null;
let revision = 0;
const fetchCalls = [];
function createDevice(name) {
  const context = {
    window: { NapiCustomerDirectory: { session: async () => ({ access_token: "a.eyJzdWIiOiJvd25lci0xIn0.z", user: { id: "owner-1" } }) } },
    fetch: async (url, options) => {
      fetchCalls.push({ device: name, url, options });
      if (url.includes("napi_app_config")) return { ok: true, text: async () => "[]" };
      if (url.includes("napi_daily_plans")) return { ok: true, text: async () => JSON.stringify(serverRow ? [serverRow] : []) };
      if (url.includes("rpc/napi_save_daily_plan")) {
        const body = JSON.parse(options.body);
        if (serverRow && body.p_base_updated_at !== serverRow.updated_at) {
          return { ok: true, text: async () => JSON.stringify({ accepted: false, updated_at: serverRow.updated_at, payload: serverRow.payload }) };
        }
        revision += 1;
        serverRow = { plan_date: body.p_plan_date, updated_at: `2026-09-30T07:00:0${revision}Z`, payload: body.p_payload };
        return { ok: true, text: async () => JSON.stringify({ accepted: true, updated_at: serverRow.updated_at, payload: serverRow.payload }) };
      }
      throw new Error(`Váratlan kérés: ${url}`);
    },
    atob: value => Buffer.from(value, "base64").toString("utf8"),
    setTimeout,
    Promise,
    JSON,
    console
  };
  vm.runInNewContext(syncSource, context);
  return context.window.NapiCloudSync;
}

(async () => {
  const deviceA = createDevice("A");
  const deviceB = createDevice("B");
  const deviceC = createDevice("C");
  const created = { id: "plan-a", date: "2026-09-30", tasks: [{ id: "task-a", notes: "Első eszköz" }], workItems: [] };
  const createResult = await deviceA.pushPlan(created);
  assert.equal(createResult.accepted, true);

  const onDeviceB = (await deviceB.pull()).plans[0];
  const modified = { ...onDeviceB.payload, cloudUpdatedAt: onDeviceB.updated_at, tasks: [{ id: "task-a", notes: "Második eszköz módosítása" }] };
  const modifyResult = await deviceB.pushPlan(modified);
  assert.equal(modifyResult.accepted, true);

  const onDeviceC = (await deviceC.pull()).plans[0];
  assert.equal(onDeviceC.payload.tasks[0].notes, "Második eszköz módosítása");

  const staleResult = await deviceA.pushPlan({ ...created, tasks: [{ id: "task-a", notes: "Régi első eszköz" }], cloudUpdatedAt: createResult.updated_at });
  assert.equal(staleResult.accepted, false, "A régi első eszköz nem írhatja felül a második frissebb változatát.");
  assert.equal((await deviceC.pull()).plans[0].payload.tasks[0].notes, "Második eszköz módosítása");
  const getCalls = fetchCalls.filter(call => call.options.method === "GET");
  assert.equal(getCalls.length, 6, "Két teljes letöltés konfiguráció- és tervkérése futott le.");
  assert.ok(getCalls.every(call => call.options.cache === "no-store"), "Minden Supabase GET-nek ki kell kerülnie a böngészőcache-t.");
  assert.ok(getCalls.every(call => call.options.headers["Cache-Control"] === "no-cache"));
  console.log("Háromeszközös, cache-mentes szinkron regressziós teszt: OK");
})().catch(error => { console.error(error); process.exitCode = 1; });
