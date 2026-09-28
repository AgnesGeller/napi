const assert = require("node:assert/strict");
const fs = require("node:fs");

const app = fs.readFileSync("js/app.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");

const customJobStart = app.indexOf("function addCustomJob");
const customJobEnd = app.indexOf("function updateCustomerDirectoryButtons", customJobStart);
const customJobSource = app.slice(customJobStart, customJobEnd);

assert.match(html, /data-settings-tab="templates">Sablonok</, "A külön Sablonok fül hiányzik.");
assert.match(html, /class="form-control job-template-search"/, "A napi sablonkereső hiányzik.");
assert.match(html, /class="form-control new-job-note"/, "Az egyszeri feladat megjegyzésmezője hiányzik.");
assert.doesNotMatch(customJobSource, /data\.templates\.push|template\s*=\s*\{/, "Az egyszeri feladat nem menthető automatikusan sablonként.");
assert.match(customJobSource, /templateId:\s*null/, "Az egyszeri feladatot sablonkapcsolat nélkül kell tárolni.");
assert.doesNotMatch(app, /template\.steps\s*=\s*deepCopy\(job\.steps\)/, "A napi leírás nem írhatja át a sablont.");
assert.match(app, /item\.note = \$\("#settingNote"\)\.value\.trim\(\)/, "A sablon megjegyzésének mentése hiányzik.");

console.log("Feladatsablon-kezelési regressziós teszt: OK");
