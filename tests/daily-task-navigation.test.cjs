const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("js/app.js", "utf8");
const addTask = source.match(/function addTask\(event\) \{[\s\S]*?\n  \}/)?.[0] || "";

assert.match(addTask, /event\?\.preventDefault\(\)/, "Az új napi feladat gomb alapértelmezett navigációját le kell tiltani.");
assert.match(addTask, /#dayViewButton[\s\S]*aria-pressed", "true"/, "Új feladatnál a napi nézetnek kell aktívnak maradnia.");
assert.match(addTask, /#weekViewButton[\s\S]*aria-pressed", "false"/, "Új feladatnál a heti nézet nem maradhat aktív.");
assert.match(addTask, /data-task-id=[\s\S]*scrollIntoView\(\{ behavior: "auto"/, "A görgetést az új napi feladathoz kell rögzíteni.");

console.log("Napi feladat nézetmegtartási teszt: OK");
