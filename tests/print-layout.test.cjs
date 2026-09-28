const assert = require("node:assert/strict");
const fs = require("node:fs");

const appSource = fs.readFileSync("js/app.js", "utf8");
const styleSource = fs.readFileSync("css/style.css", "utf8");

assert.match(appSource, /print-client-block\$\{clientIndex \? " has-divider" : ""\}/, "A további ügyfelek PDF-elválasztó osztálya hiányzik.");
assert.match(appSource, /print-client-divider">Következő ügyfél/, "A PDF ügyfélváltásának felirata hiányzik.");
assert.match(styleSource, /\.print-client-block\.has-divider[^}]+border-top:[^}]+/, "A PDF ügyfelek közötti erős elválasztó vonal hiányzik.");
assert.match(styleSource, /\.print-client-divider[^}]+background:[^}]+/, "A PDF ügyfélváltásának kiemelése hiányzik.");

console.log("PDF ügyfél-elválasztás teszt: OK");
