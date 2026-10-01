const assert = require("node:assert/strict");
const fs = require("node:fs");

const appSource = fs.readFileSync("js/app.js", "utf8");
const styleSource = fs.readFileSync("css/style.css", "utf8");

assert.match(appSource, /print-worklog-required/, "A PDF munkanapló-figyelmeztető eleme hiányzik.");
assert.match(appSource, /print-worklog-check[^>]*[^<]*>✓</, "A zöld pipa hiányzik a PDF munkanapló-jelzéséből.");
assert.match(styleSource, /\.print-worklog-required \{[^}]*color: #6f2da8[^}]*border: 1\.2mm solid #ffd400[^}]*background: #ffe5e5/s, "A lila felirat, sárga keret vagy halványpiros háttér hiányzik.");
assert.match(styleSource, /\.print-worklog-check \{[^}]*background: #16853f/s, "A pipa zöld háttere hiányzik.");

console.log("PDF munkanapló-kiemelés teszt: OK");
