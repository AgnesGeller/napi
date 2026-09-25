const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("js/app.js", "utf8");
const pullStart = source.indexOf("async function pullSharedData");
const pullEnd = source.indexOf("async function pushCurrentState", pullStart);
const pullSource = source.slice(pullStart, pullEnd);

assert.ok(pullSource.indexOf("row.payload?.deleted") < pullSource.indexOf("pendingCloudPlanDates.has(row.plan_date)"), "A teljes napi törlésnek meg kell előznie a várakozó helyi mentést.");
assert.match(source, /await pullSharedData\(\);\s*await pushCurrentState\(\);/, "Szinkron előtt le kell kérni a másik eszköz törléseit.");
assert.match(source, /deletedWorkItemIds/, "Az előjegyzések törlési jelölése hiányzik.");
assert.match(source, /data-delete-work-id/, "A naptári előjegyzés közvetlen törlése hiányzik.");
assert.match(source, /function deleteWorkItem\(date, itemId\)/, "Az egységes előjegyzés-törlés hiányzik.");

console.log("Naptári törlés szinkronteszt: OK");
