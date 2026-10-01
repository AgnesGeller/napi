const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('js/app.js', 'utf8');
const style = fs.readFileSync('css/style.css', 'utf8');

assert.match(html, /id="generalNoteInput"[^>]*maxlength="1200"/, 'Az Egyéb megjegyzés mező hiányzik.');
assert.match(app, /generalNote: String\(plan\.generalNote \|\| ""\)/, 'A mentett napi megjegyzés normalizálása hiányzik.');
assert.match(app, /workingPlan\.generalNote = event\.target\.value; markDirty\(\)/, 'A napi megjegyzés módosítása nem indít mentést és szinkront.');
assert.match(app, /print-general-note/, 'A napi megjegyzés PDF-megjelenítése hiányzik.');
assert.match(style, /\.print-general-note \{[^}]*color: #24578f[^}]*border: \.35mm solid #8c9298[^}]*background: #fff1a8/s, 'A PDF-es napi megjegyzés kért színei hiányoznak.');

console.log('Napi egyéb megjegyzés mentési és PDF-regressziós teszt: OK');
