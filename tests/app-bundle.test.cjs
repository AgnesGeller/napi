const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const archive = fs.readFileSync("downloads/diszkertek-napi-app.zip");

function entriesFromZip(buffer) {
  const endSignature = 0x06054b50;
  let end = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === endSignature) { end = offset; break; }
  }
  assert.notEqual(end, -1, "A letölthető alkalmazásfájl nem érvényes ZIP.");
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, "Hibás ZIP központi könyvtár.");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8").replaceAll("\\", "/");
    if (!name.endsWith("/")) entries.set(name, { method, compressedSize, size, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function extract(buffer, entry) {
  assert.equal(buffer.readUInt32LE(entry.localOffset), 0x04034b50, "Hibás ZIP fájlfejléc.");
  const nameLength = buffer.readUInt16LE(entry.localOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(start, start + entry.compressedSize);
  const result = entry.method === 0 ? compressed : entry.method === 8 ? zlib.inflateRawSync(compressed) : null;
  assert.ok(result, `Nem támogatott ZIP tömörítés: ${entry.method}`);
  assert.equal(result.length, entry.size);
  return result;
}

const expectedFiles = [
  "assets/app-icon-180.png", "assets/app-icon-192.png", "assets/app-icon-512.png", "assets/app-icon-maskable-512.png",
  "assets/botanical.svg", "assets/diszkertek-logo.png", "assets/favicon.svg",
  "assets/vendor/bootstrap.bundle.min.js", "assets/vendor/bootstrap.min.css", "css/style.css",
  "js/app.js", "js/customer-directory.js", "js/napi-domain.js", "js/napi-sync.js",
  "index.html", "manifest.webmanifest", "sw.js", "README.md", "LICENSE"
].sort();
const entries = entriesFromZip(archive);
assert.deepEqual([...entries.keys()].sort(), expectedFiles, "A letölthető ZIP fájllistája eltér a jelenlegi alkalmazástól.");
for (const file of expectedFiles) {
  const archived = extract(archive, entries.get(file));
  const current = fs.readFileSync(path.resolve(file));
  assert.deepEqual(archived, current, `${file} ZIP-beli változata nem egyezik a repository aktuális fájljával.`);
}

console.log("Letölthető alkalmazás-ZIP tartalmi regressziós teszt: OK");
