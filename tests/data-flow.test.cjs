const assert = require("node:assert/strict");
const domain = require("../js/napi-domain.js");

const types = {
  work: { label: "Munka", color: "#246" },
  survey: { label: "Felmérés", color: "#842" },
  meeting: { label: "Megbeszélés", color: "#538" }
};
const appointment = { id: "appointment-a", type: "survey", customerName: "Kiss Kert", address: "Fő utca 1.", note: "Kapucsengő", reminderTimes: ["08:30"] };
const baseData = { updatedAt: "2026-09-28T08:00:00Z", workers: [], plans: [{ date: "2026-10-02", tasks: [{ id: "task-a" }], workItems: [] }] };

// 1. Mentés, frissítés és újranyitás után ugyanaz az előjegyzés jelenik meg.
const storageValues = new Map();
const storage = { setItem: (key, value) => storageValues.set(key, value), getItem: key => storageValues.get(key) ?? null };
const imported = { ...baseData, plans: [{ date: "2026-10-03", tasks: [], workItems: [appointment] }] };
domain.persistImportedData(storage, "napi", baseData, imported, false);
const reopened = JSON.parse(storage.getItem("napi"));
const dailyHtml = domain.renderWorkItemsHTML(reopened.plans[0].workItems, types);
assert.match(dailyHtml, /Felmérés:|Felmérés/);
assert.match(dailyHtml, /Kiss Kert/);
const updated = { ...appointment, note: "Hátsó kapu" };
assert.match(domain.renderWorkItemsHTML([updated], types), /Hátsó kapu/);

// 2. Törzsadat-változás kizárólag a konfigurációt jelöli függőnek.
const beforePlans = JSON.stringify(baseData.plans);
const configEffect = domain.configChangeEffects(baseData, "2026-09-29T10:00:00Z");
assert.equal(configEffect.configPending, true);
assert.deepEqual(configEffect.planDates, []);
assert.equal(JSON.stringify(configEffect.data.plans), beforePlans);

// 3. Két eszköz eltérő azonosítójú előjegyzései és emlékeztetői megmaradnak.
const deviceA = { date: "2026-10-03", tasks: [{ id: "server-task" }], workItems: [appointment], deletedWorkItemIds: [] };
const deviceBItem = { id: "appointment-b", type: "meeting", customerName: "Nagy Kert", address: "Tó utca 2.", reminderTimes: ["09:15"] };
const merged = domain.mergePendingWorkItems(deviceA, { date: deviceA.date, tasks: [], workItems: [deviceBItem], deletedWorkItemIds: [] });
assert.deepEqual(merged.workItems.map(item => item.id).sort(), ["appointment-a", "appointment-b"]);
assert.deepEqual(merged.tasks, [{ id: "server-task" }], "A régi helyi napi terv nem írhatja felül a frissebb szerverfeladatot.");
assert.deepEqual(merged.workItems.flatMap(item => item.reminderTimes).sort(), ["08:30", "09:15"]);

// 4. A teljes és a részleges ZIP-import is azonnal visszaolvasható helyi mentést készít.
const partial = { ...baseData, plans: [{ date: "2026-10-04", tasks: [], workItems: [deviceBItem] }] };
domain.persistImportedData(storage, "napi", reopened, partial, true);
const afterPartialReload = JSON.parse(storage.getItem("napi"));
assert.deepEqual(afterPartialReload.plans.map(plan => plan.date).sort(), ["2026-10-03", "2026-10-04"]);

// 5. Az előjegyzés bekerül a napi PDF-be, és az előjegyzés-only nap időszakosan is nyomtatható.
const printHtml = domain.printWorkItemsHTML([appointment], types);
assert.match(printHtml, /Előjegyzések/);
assert.match(printHtml, /Kiss Kert/);
assert.equal(domain.planHasPrintableContent({ tasks: [], workItems: [appointment] }), true);

// A törlés után létrehozott, új azonosítójú terv a törlési szerververzióból
// indulhat újra; a régi vagy üres helyi példány viszont nem támadhat fel.
const tombstone = {
  updated_at: "2026-09-30T08:00:00Z",
  payload: { deleted: true, deletedPlanId: "old-plan" }
};
const recreatedPlan = { id: "new-plan", date: "2026-09-30", tasks: [{ id: "new-task" }], workItems: [] };
const recreation = domain.resolvePlanConflict(tombstone, recreatedPlan, true);
assert.equal(recreation.action, "retry-from-remote-version");
assert.equal(recreation.plan.cloudUpdatedAt, tombstone.updated_at);
assert.deepEqual(recreation.plan.tasks, recreatedPlan.tasks);

assert.deepEqual(
  domain.resolvePlanConflict(tombstone, { ...recreatedPlan, id: "old-plan" }, true),
  { action: "accept-remote", plan: null },
  "A törölt terv régi eszközön maradt példánya nem írhatja felül a törlést."
);
assert.deepEqual(
  domain.resolvePlanConflict(tombstone, { id: "empty-plan", date: "2026-09-30", tasks: [], workItems: [] }, false),
  { action: "accept-remote", plan: null },
  "Üres helyi terv nem írhatja felül a szerver törlését."
);

const newerServerPlan = { updated_at: "2026-09-30T09:00:00Z", payload: { id: "server-plan", date: "2026-09-30", tasks: [{ id: "server-task" }], workItems: [] } };
assert.deepEqual(
  domain.resolvePlanConflict(newerServerPlan, recreatedPlan, true),
  { action: "accept-remote", plan: newerServerPlan.payload },
  "Párhuzamos teljes tervmódosításnál a frissebb szerverváltozat maradjon meg."
);

// 6. Az eltérő törzsadat-elemek párhuzamos módosítása nem írja felül egymást.
const sharedConfig = {
  workers: [{ id: "worker-a", name: "Anna" }], vehicles: [{ id: "vehicle-a", name: "Autó" }],
  tools: [], materials: [], templates: [], customers: [], recurrences: []
};
const deviceAConfig = domain.applyConfigChanges(sharedConfig, [{ collection: "workers", id: "worker-a", value: { id: "worker-a", name: "Anna új" } }]);
const mergedConfig = domain.applyConfigChanges(deviceAConfig, [{ collection: "vehicles", id: "vehicle-a", value: { id: "vehicle-a", name: "Új autó" } }]);
assert.equal(mergedConfig.workers[0].name, "Anna új");
assert.equal(mergedConfig.vehicles[0].name, "Új autó");

const queuedTwice = domain.mergeConfigChangeQueue(
  [{ collection: "workers", id: "worker-a", value: { id: "worker-a", name: "Első" }, base_revision: "rev-1" }],
  [{ collection: "workers", id: "worker-a", value: { id: "worker-a", name: "Második" }, base_revision: "rev-2" }]
);
assert.equal(queuedTwice[0].base_revision, "rev-1", "Az elsőként látott szerverrevízió maradjon az összehasonlítás alapja.");
assert.equal(queuedTwice[0].value.name, "Második");

const sent = [{ collection: "workers", id: "worker-a", value: { id: "worker-a", name: "Első" }, base_revision: "rev-1" }];
const changedDuringRequest = [{ collection: "workers", id: "worker-a", value: { id: "worker-a", name: "Második" }, base_revision: "rev-1" }];
const rebased = domain.reconcileConfigChangeQueue(changedDuringRequest, sent, [], { workers: { "worker-a": "rev-2" } });
assert.equal(rebased[0].base_revision, "rev-2", "A kérés alatt született újabb helyi módosítás az elfogadott szerverrevízióról folytatódjon.");
assert.deepEqual(domain.reconcileConfigChangeQueue(changedDuringRequest, sent, [{ collection: "workers", id: "worker-a" }], {}), [], "Ütközéskor a szerverváltozat maradjon, ne történjen késleltetett felülírás.");

const deletions = domain.configChangesBetween(sharedConfig, { ...sharedConfig, workers: [] }, { deleteMissing: true });
assert.deepEqual(deletions, [{ collection: "workers", id: "worker-a", deleted: true }]);

console.log("Napi adatfolyam viselkedési regressziós teszt: OK");
