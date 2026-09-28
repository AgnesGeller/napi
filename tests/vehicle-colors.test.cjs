const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("js/app.js", "utf8");

assert.match(source, /const vehiclePalette = \[/, "Az autók színpalettája hiányzik.");
assert.match(source, /vehicles\.map\(\(vehicle, index\) => \(\{ \.\.\.vehicle, color: validVehicleColor/, "A régi autók színének normalizálása hiányzik.");
assert.match(source, /<legend>Autó színe<\/legend>/, "Az autó színválasztója hiányzik.");
assert.match(source, /aria-label="Egyedi autószín"/, "Az autó egyedi színválasztója nem azonosítható.");
assert.match(source, /settingsListHTML\(list, \(\) => "Autó", true, false\)/, "Az autóknál nem jelenhet meg felesleges HEX-kód.");
assert.match(source, /activeSettingsTab === "vehicles"\) item\.color = validVehicleColor/, "Az autó színének mentése hiányzik.");
assert.match(source, /function vehicleTheme\(vehicle\)[\s\S]*vehicle\?\.color/, "A napi terv és a PDF nem a beállított autószínt használja.");

console.log("Autószín szerkesztési teszt: OK");
