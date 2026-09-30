const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/app.js','utf8');
const elements = new Map();
function element(selector) {
  if (!elements.has(selector)) elements.set(selector, {events:{},disabled:false,hidden:false,
    addEventListener(type,handler){this.events[type]=handler;},
    removeAttribute(key){delete this[key];},replaceChildren(){},
    showModal(){this.open=true;},close(){this.open=false;this.events.close();}
  });
  return elements.get(selector);
}
let created=0, downloaded=[], copied=0, shared=0;
const file=new Blob(['%PDF-1.4\n%%EOF'],{type:'application/pdf'});file.name='napi-feladatok-2026-09-29.pdf';
const context=vm.createContext({
  $:element, URL:{createObjectURL:()=> 'blob:test-pdf',revokeObjectURL(){}},
  navigator:{userAgent:'Windows NT 10.0',share:async()=>{shared++;},canShare:()=>true},
  window:{location:{href:'https://example.test/napi/'},NapiPdfShare:{supportsFileShare:()=>true,shareFile:async()=>{shared++;return true;}}},
  selectedActionPlan:()=>({date:'2026-09-29'}),formatDate:date=>date,
  createPlansPdfFile:async()=>{created++;return file;},
  downloadPdfFile:value=>downloaded.push(value),toast(){},readableError:error=>error.message,
  document:{createElement:()=>({getContext(){return {};}})}
});
vm.runInContext(source.slice(source.indexOf('  let previewPdfFile ='),source.indexOf('  async function copyText()')),context);
vm.runInContext(source.slice(source.indexOf('  const shareButton ='),source.indexOf('  function settingsType()')),context);
(async()=>{
  await element('#shareButton').events.click();
  assert.equal(created,1,'A PC-s Viber gomb elkészíti a kiválasztott nap PDF-jét.');
  assert.deepEqual(downloaded,[file],'A PDF-et a Viber megnyitása előtt menteni kell.');
  assert.equal(element('#pdfPreviewDialog').open,true);
  assert.equal(element('#openViberButton').hidden,false);
  assert.equal(element('#sharePdfPreviewButton').hidden,true,'PC-n nem a vágólapos Windows-megosztót használjuk.');
  assert.equal(context.window.location.href,'https://example.test/napi/','A Viber csak a felhasználó külön kattintására nyílik.');
  element('#openViberButton').events.click();
  assert.equal(context.window.location.href,'viber://forward?text=');
  assert.equal(downloaded.length,1,'A Viber megnyitása nem készít duplikált PDF-et.');
  assert.equal(shared,0,'A Windows megosztó nem kaphatja meg a PDF-et vágólapos Viber-integráción keresztül.');
  assert.equal(copied,0,'A terv szövegét nem másoljuk.');
  console.log('PC-s Viber: PDF mentés, külön Viber-indítás, kézi csatolás, duplikáció nélkül: OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
