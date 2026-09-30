const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const pdfShare = require('../js/pdf-share.js');
const app = fs.readFileSync('js/app.js','utf8');
const elements = new Map();
function element(selector) {
  if (!elements.has(selector)) elements.set(selector, {events:{}, disabled:false,
    addEventListener(name,handler) {this.events[name]=handler;},
    removeAttribute(name) {delete this[name];},
    replaceChildren() {this.cleared=true;},
    showModal() {this.open=true;}, close() {this.open=false;this.events.close();}
  });
  return elements.get(selector);
}
const file = new Blob(['%PDF-1.4\n%%EOF'],{type:'application/pdf'}); file.name = 'napi-feladatok-2026-09-30.pdf';
let generated=0, download, payload, revoked=[], errors=[], fail=false;
const navigator = {canShare: () => true, share: async value => {payload=value;}};
const context = vm.createContext({
  $:element, URL:{createObjectURL: () => 'blob:preview',revokeObjectURL: url => revoked.push(url)}, navigator,
  selectedActionPlan: () => ({date:'2026-09-30'}),formatDate: date => date,
  createPlansPdfFile: async () => {generated++;if(fail) throw new Error('render failed');return file;},
  downloadPdfFile: value => {download=value;}, toast: message => errors.push(message),readableError: error => error.message,
  window: {NapiPdfShare:pdfShare}
});
vm.runInContext(app.slice(app.indexOf('  let previewPdfFile ='),app.indexOf('  async function copyText()')),context);
async function click(selector) {const target=element(selector);await target.events.click({currentTarget:target});}
(async () => {
  await click('#pdfPreviewButton');
  assert.equal(element('#pdfPreviewDialog').open,true);
  assert.equal(element('#openPdfPreviewLink').href,'blob:preview');
  await click('#savePdfPreviewButton');
  assert.equal(download,file);
  await click('#sharePdfPreviewButton');
  assert.equal(payload.files[0],file);
  assert.equal(generated,1,'Mentés és megosztás az előnézet már elkészült fájlját használja.');
  navigator.share = async () => {throw Object.assign(new Error('cancelled'),{name:'AbortError'});};
  await click('#sharePdfPreviewButton');
  assert.equal(errors.length,0,'A megosztás megszakítása nem hiba.');
  assert.equal(element('#pdfPreviewDialog').open,true);
  await click('#discardPdfPreviewButton');
  assert.deepEqual(revoked,['blob:preview']);
  assert.equal(element('#pdfPreviewPages').cleared,true);
  assert.equal(element('#openPdfPreviewLink').href,undefined);
  payload=null;
  await click('#sharePdfPreviewButton');
  assert.equal(payload,null,'Bezárás után nem szabad régi fájlt megosztani.');
  fail=true;
  await click('#pdfPreviewButton');
  assert.equal(element('#pdfPreviewButton').disabled,false);
  assert.equal(errors.length,1);
  console.log('PDF előnézet: mentés, fájlmegosztás, megszakítás, bezárás és generálási hiba: OK');
})().catch(error => {console.error(error);process.exitCode=1;});
