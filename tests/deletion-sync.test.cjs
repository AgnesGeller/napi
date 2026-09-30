const assert = require("node:assert/strict");
const fs = require("node:fs");
const domain = require("../js/napi-domain.js");

const source = fs.readFileSync("js/app.js", "utf8");
const pullStart = source.indexOf("async function pullSharedData");
const pullEnd = source.indexOf("async function pushCurrentState", pullStart);
const pullSource = source.slice(pullStart, pullEnd);

const deletedRow = { updated_at: "2026-09-30T08:00:00Z", payload: { deleted: true, deletedPlanId: "deleted-plan" } };
assert.equal(domain.resolvePlanConflict(deletedRow, { id: "new-plan", tasks: [{ id: "task" }] }, true).action, "retry-from-remote-version", "A törölt napra létrehozott új tervnek a törlési szerververzióból kell folytatódnia.");
assert.equal(domain.resolvePlanConflict(deletedRow, { id: "deleted-plan", tasks: [{ id: "old-task" }] }, true).action, "accept-remote", "A törölt terv régi példánya nem támadhat fel egy másik eszközről.");
assert.match(source, /await pullSharedData\(\);\s*await pushCurrentState\(\);/, "Szinkron előtt le kell kérni a másik eszköz törléseit.");
assert.match(source, /deletedWorkItemIds/, "Az előjegyzések törlési jelölése hiányzik.");
assert.match(source, /data-delete-work-id/, "A naptári előjegyzés közvetlen törlése hiányzik.");
assert.match(source, /async function deleteWorkItem\(date, itemId\)/, "Az egységes előjegyzés-törlés hiányzik.");
assert.match(source, /const synced = await pushCurrentState\(\)/, "Az előjegyzés törlésének meg kell várnia a közös mentést.");
assert.match(source, /async function deleteDay\(date\)/, "A teljes nap törlésének meg kell várnia a közös mentést.");
assert.match(source, /const synced = await syncPromise/, "A teljes nap törlésének ellenőriznie kell a közös törlés eredményét.");
assert.match(source, /rejectedAsStale/, "A régi eszköz visszautasított mentését kezelni kell.");
assert.match(source, /resolvePlanConflict\(result, plan, planHasContent\(plan\)\)/, "A visszautasított tervmentést a szerverváltozat alapján kell feloldani.");
assert.match(pullSource, /resolvePlanConflict\(row, local, planHasContent\(local\)\)/, "A törölt szerververziót a helyi terv azonosítója és tartalma alapján kell feloldani.");
assert.doesNotMatch(pullSource, /pendingCloudPlanDates\.has\(row\.plan_date\)[^\n]+timestampValue/, "A függőben lévő helyi törlés védelme nem függhet az eszközök eltérő órájától.");
assert.doesNotMatch(pullSource, /timestampValue\(row\.updated_at\)\s*>\s*timestampValue\(local\.updatedAt\)/, "A közös terv átvételét nem akadályozhatja az eszközök eltérő órája.");
assert.match(source, /sessionStorage\.setItem\(UPDATE_RELOAD_DATE_KEY, workingPlan\.date\)/, "Az automatikus appfrissítésnek meg kell őriznie a szerkesztett napot.");
assert.match(source, /sessionStorage\.removeItem\(UPDATE_RELOAD_DATE_KEY\)/, "A megőrzött dátumot csak az automatikus újratöltéshez szabad felhasználni.");
assert.match(source, /if \(dirty\) localStorage\.setItem\(RECOVERY_KEY[\s\S]*?else localStorage\.removeItem\(RECOVERY_KEY\)/, "A helyi helyreállítás nem hozhatja vissza a már törölt előjegyzést.");

const syncSource = fs.readFileSync("js/napi-sync.js", "utf8");
const mergeMigration = fs.readFileSync("supabase/migrations/20260928163159_napi_merge_shared_work_items.sql", "utf8");
const atomicMigration = fs.readFileSync("supabase/migrations/20260929021956_reconcile_napi_reminders_atomically.sql", "utf8");
assert.match(syncSource, /deletedPlanId/, "A teljes napi törlésből hiányzik a régi terv azonosítója.");
assert.match(syncSource, /response\.status === 401[\s\S]*clearSession/, "A lejárt közös munkamenetet törölni kell, hogy újra be lehessen lépni.");
assert.match(mergeMigration, /jsonb_array_elements\(coalesce\(v_existing_payload->'workItems'/, "A másik eszköz előjegyzéseit a közös mentésnek meg kell őriznie.");
assert.match(mergeMigration, /updated_at = now\(\)/, "A közös mentés sorrendjét a szerver órájának kell meghatároznia.");
assert.match(atomicMigration, /p_base_updated_at is distinct from v_existing_updated_at/, "A régi helyi terv nem írhatja felül a frissebb szerververziót.");

console.log("Naptári törlés szinkronteszt: OK");
