const assert = require("node:assert/strict");
const fs = require("node:fs");

const appSource = fs.readFileSync("js/app.js", "utf8");
const styleSource = fs.readFileSync("css/style.css", "utf8");

assert.match(appSource, /print-client-block\$\{clientIndex \? " has-divider" : ""\}/, "A további ügyfelek PDF-elválasztó osztálya hiányzik.");
assert.match(appSource, /print-client-divider">Következő \$\{taskEntryLabel\(task\)/, "A PDF napi tételeinek dinamikus elválasztó felirata hiányzik.");
assert.match(appSource, /print-client-heading/, "Az elválasztónak az ügyfél fejlécével együtt kell maradnia.");
assert.match(styleSource, /\.print-client-block \{[^}]+break-inside: auto/, "A hosszú ügyfélblokkot szükség esetén oldaltöréssel kell folytatni.");
assert.match(styleSource, /\.print-client-heading \{[^}]+break-inside: avoid-page[^}]+break-after: avoid-page/, "Az ügyfél fejléce nem szakadhat le a tartalmáról.");
assert.match(styleSource, /\.print-client-divider::before, \.print-client-divider::after[^}]+border-top:[^}]+/, "A PDF ügyfelek közötti elválasztó vonal hiányzik.");

console.log("PDF ügyfél-elválasztás teszt: OK");
