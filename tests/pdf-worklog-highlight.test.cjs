const assert = require("node:assert/strict");
const fs = require("node:fs");

const appSource = fs.readFileSync("js/app.js", "utf8");
const styleSource = fs.readFileSync("css/style.css", "utf8");

assert.match(appSource, /print-worklog-required/, "A PDF munkanapló-figyelmeztető eleme hiányzik.");
assert.match(appSource, /print-worklog-check[^>]*[^<]*>✓</, "A zöld pipa hiányzik a PDF munkanapló-jelzéséből.");
assert.match(appSource, /Munkanaplót nem kell megírni\.<\/span><span class="print-worklog-cross"[^>]*>×</, "A nem szükséges munkanapló piros X jelzése hiányzik.");
assert.match(appSource, /<strong>\$\{intensityRating\}<\/strong> - /, "A munkaintenzitás száma hiányzik a PDF-ről.");
assert.match(appSource, /<strong>\$\{qualityRating\}<\/strong> - /, "A munka minőségének száma hiányzik a PDF-ről.");
assert.match(styleSource, /\.print-worklog-required \{[^}]*color: #6f2da8[^}]*border: \.35mm solid #e7c600[^}]*background: #fff1f1/s, "A lila felirat, sárga keret vagy halványpiros háttér hiányzik.");
assert.match(styleSource, /\.print-worklog-check \{[^}]*background: #16853f/s, "A pipa zöld háttere hiányzik.");
assert.match(styleSource, /\.print-worklog-cross \{[^}]*color: #c62828/s, "A nem szükséges munkanapló X jele nem piros.");

console.log("PDF munkanapló-kiemelés teszt: OK");
