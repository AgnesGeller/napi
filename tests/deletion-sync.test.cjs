const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("js/app.js", "utf8");
const pullStart = source.indexOf("async function pullSharedData");
const pullEnd = source.indexOf("async function pushCurrentState", pullStart);
const pullSource = source.slice(pullStart, pullEnd);

assert.match(pullSource, /if \(row\.payload\?\.deleted\) \{[\s\S]*?if \(pendingCloudPlanDates\.has\(row\.plan_date\)\) return;/, "A törölt napra újonnan felvitt helyi tervet feltöltés előtt nem szabad visszatörölni.");
assert.match(source, /await pullSharedData\(\);\s*await pushCurrentState\(\);/, "Szinkron előtt le kell kérni a másik eszköz törléseit.");
assert.match(source, /deletedWorkItemIds/, "Az előjegyzések törlési jelölése hiányzik.");
assert.match(source, /data-delete-work-id/, "A naptári előjegyzés közvetlen törlése hiányzik.");
assert.match(source, /async function deleteWorkItem\(date, itemId\)/, "Az egységes előjegyzés-törlés hiányzik.");
assert.match(source, /const synced = await pushCurrentState\(\)/, "Az előjegyzés törlésének meg kell várnia a közös mentést.");
assert.match(source, /async function deleteDay\(date\)/, "A teljes nap törlésének meg kell várnia a közös mentést.");
assert.match(source, /const synced = await syncPromise/, "A teljes nap törlésének ellenőriznie kell a közös törlés eredményét.");
assert.match(source, /rejectedAsStale/, "A régi eszköz visszautasított mentését kezelni kell.");
assert.match(source, /if \(await window\.NapiCloudSync\.pushPlan\(plan\) === false\)[\s\S]*continue;/, "A visszautasított előjegyzés-törlést függőben kell tartani.");
assert.match(pullSource, /if \(pendingCloudPlanDates\.has\(row\.plan_date\)\) return;/, "A még fel nem töltött helyi módosítást másik eszköz adata nem írhatja felül.");
assert.doesNotMatch(pullSource, /pendingCloudPlanDates\.has\(row\.plan_date\)[^\n]+timestampValue/, "A függőben lévő helyi törlés védelme nem függhet az eszközök eltérő órájától.");
assert.doesNotMatch(pullSource, /timestampValue\(row\.updated_at\)\s*>\s*timestampValue\(local\.updatedAt\)/, "A közös terv átvételét nem akadályozhatja az eszközök eltérő órája.");
assert.match(source, /sessionStorage\.setItem\(UPDATE_RELOAD_DATE_KEY, workingPlan\.date\)/, "Az automatikus appfrissítésnek meg kell őriznie a szerkesztett napot.");
assert.match(source, /sessionStorage\.removeItem\(UPDATE_RELOAD_DATE_KEY\)/, "A megőrzött dátumot csak az automatikus újratöltéshez szabad felhasználni.");
assert.match(source, /if \(dirty\) localStorage\.setItem\(RECOVERY_KEY[\s\S]*?else localStorage\.removeItem\(RECOVERY_KEY\)/, "A helyi helyreállítás nem hozhatja vissza a már törölt előjegyzést.");

const syncSource = fs.readFileSync("js/napi-sync.js", "utf8");
const mergeMigration = fs.readFileSync("supabase/migrations/20260928183046_napi_merge_shared_work_items.sql", "utf8");
assert.match(syncSource, /deletedPlanId/, "A teljes napi törlésből hiányzik a régi terv azonosítója.");
assert.match(syncSource, /response\.status === 401[\s\S]*clearSession/, "A lejárt közös munkamenetet törölni kell, hogy újra be lehessen lépni.");
assert.match(mergeMigration, /jsonb_array_elements\(coalesce\(v_existing_payload->'workItems'/, "A másik eszköz előjegyzéseit a közös mentésnek meg kell őriznie.");
assert.match(mergeMigration, /updated_at = now\(\)/, "A közös mentés sorrendjét a szerver órájának kell meghatároznia.");

console.log("Naptári törlés szinkronteszt: OK");
