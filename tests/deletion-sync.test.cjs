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
assert.match(source, /async function deleteWorkItem\(date, itemId\)/, "Az egységes előjegyzés-törlés hiányzik.");
assert.match(source, /const synced = await pushCurrentState\(\)/, "Az előjegyzés törlésének meg kell várnia a közös mentést.");
assert.match(source, /async function deleteDay\(date\)/, "A teljes nap törlésének meg kell várnia a közös mentést.");
assert.match(source, /const synced = await syncPromise/, "A teljes nap törlésének ellenőriznie kell a közös törlés eredményét.");
assert.match(source, /rejectedAsStale/, "A régi eszköz visszautasított mentését kezelni kell.");
assert.match(source, /if \(await window\.NapiCloudSync\.pushPlan\(plan\) === false\)[\s\S]*continue;/, "A visszautasított előjegyzés-törlést függőben kell tartani.");

const syncSource = fs.readFileSync("js/napi-sync.js", "utf8");
assert.match(syncSource, /deletedPlanId/, "A teljes napi törlésből hiányzik a régi terv azonosítója.");

console.log("Naptári törlés szinkronteszt: OK");
