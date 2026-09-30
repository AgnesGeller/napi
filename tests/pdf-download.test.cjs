const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync('js/app.js','utf8');
let scheduled, clicked = false, revoked = false;
const file = new Blob(['%PDF-1.4\n%%EOF'],{type:'application/pdf'}); file.name = 'napi.pdf';
const link = {click() {assert.equal(revoked,false); assert.equal(this.download,file.name); clicked=true;},remove() {}};
const context = vm.createContext({
  URL:{createObjectURL: input => {assert.equal(input,file);return 'blob:pdf';},revokeObjectURL: url => {assert.equal(url,'blob:pdf');revoked=true;}},
  document:{createElement:() => link,body:{append() {}}},
  setTimeout:(callback,delay) => {scheduled={callback,delay};}
});
vm.runInContext(app.slice(app.indexOf('  function downloadPdfFile('),app.indexOf('  async function downloadPlansPdf(')),context);
context.downloadPdfFile(file);
assert.ok(clicked);
assert.ok(scheduled.delay >= 60000,'A mobil fájlkezelőnek maradjon ideje megnyitni a PDF URL-jét.');
assert.equal(revoked,false);
scheduled.callback();
assert.equal(revoked,true,'A letöltési URL-t később fel kell szabadítani.');
console.log('PDF mentés: valódi fájl átadása, késleltetett URL-felszabadítás: OK');
