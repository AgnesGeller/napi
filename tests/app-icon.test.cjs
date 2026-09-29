const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const manifest = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));
const serviceWorker = fs.readFileSync("sw.js", "utf8");

const icon192 = manifest.icons.find(icon => icon.sizes === "192x192" && icon.purpose === "any");
const icon512 = manifest.icons.find(icon => icon.sizes === "512x512" && icon.purpose === "any");
const maskable = manifest.icons.find(icon => icon.sizes === "512x512" && icon.purpose === "maskable");

assert.ok(icon192?.src.includes("app-icon-192.png?v=20260929"), "A 192 pixeles telepítési ikon hiányzik vagy nem friss verziójú.");
assert.ok(icon512?.src.includes("app-icon-512.png?v=20260929"), "Az 512 pixeles telepítési ikon hiányzik vagy nem friss verziójú.");
assert.ok(maskable?.src.includes("app-icon-maskable-512.png?v=20260929"), "A maszkolható Android-ikon hiányzik vagy nem friss verziójú.");
assert.match(html, /rel="shortcut icon"[^>]+app-icon-192\.png\?v=20260929/, "A Windows/Chrome PNG parancsikon hiányzik.");
assert.match(html, /manifest\.webmanifest\?v=20260929/, "A manifest gyorsítótár-frissítése hiányzik.");
assert.match(serviceWorker, /diszkertek-napi-v97/, "A service worker gyorsítótára nem frissült.");

console.log("Appikon regressziós teszt: OK");
