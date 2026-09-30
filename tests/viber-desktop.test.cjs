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
let created=0, downloaded=[], copied=0, shared=0, fail=false, errors=[];
const file=new Blob(['%PDF-1.4\n%%EOF'],{type:'application/pdf'});file.name='napi-feladatok-2026-09-29.pdf';
const context=vm.createContext({
  $:element, URL:{createObjectURL:()=> 'blob:test-pdf',revokeObjectURL(){}},
  navigator:{userAgent:'Windows NT 10.0',share:async()=>{shared++;},canShare:()=>true},
  window:{location:{href:'https://example.test/napi/'},NapiPdfShare:{supportsFileShare:()=>true,shareFile:async()=>{shared++;return true;}}},
  selectedActionPlan:()=>({date:'2026-09-29'}),formatDate:date=>date,
  createPlansPdfFile:async()=>{created++;if(fail)throw new Error('render failed');return file;},
  downloadPdfFile:value=>downloaded.push(value),toast:message=>errors.push(message),readableError:error=>error.message,
  document:{createElement:()=>({getContext(){return {};}})}
});
vm.runInContext(source.slice(source.indexOf('  let previewPdfFile ='),source.indexOf('  async function copyText()')),context);
vm.runInContext(source.slice(source.indexOf('  const shareButton ='),source.indexOf('  function settingsType()')),context);
(async()=>{
  await element('#shareButton').events.click();
  assert.equal(created,1,'A PC-s Viber gomb elkészíti a kiválasztott nap PDF-jét.');
  assert.deepEqual(downloaded,[],'Az előkészítés nem indíthat automatikus letöltést vagy PDF-megnyitást.');
  assert.equal(element('#pdfPreviewDialog').open,undefined,'A Viberhez nem nyitunk PDF-előnézetet.');
  assert.equal(element('#viberFileDialog').open,true);
  assert.equal(element('#viberFileName').textContent,file.name);
  assert.equal(element('#launchViberButton').disabled,true);
  assert.equal(context.window.location.href,'https://example.test/napi/','A Viber csak a felhasználó külön kattintására nyílik.');
  element('#launchViberButton').events.click();
  assert.equal(context.window.location.href,'https://example.test/napi/','Mentés előtt a Viber nem indul.');
  element('#saveViberFileButton').events.click();
  assert.deepEqual(downloaded,[file]);
  assert.equal(element('#launchViberButton').disabled,false);
  element('#launchViberButton').events.click();
  assert.equal(context.window.location.href,'viber://forward?text=');
  assert.equal(downloaded.length,1,'A Viber megnyitása nem készít duplikált PDF-et.');
  element('#dismissViberFileButton').events.click();
  context.window.location.href='https://example.test/napi/';
  element('#saveViberFileButton').events.click();
  element('#launchViberButton').events.click();
  assert.equal(downloaded.length,1,'Bezárás után nem menthetünk régi fájlt.');
  assert.equal(context.window.location.href,'https://example.test/napi/');
  await element('#shareButton').events.click();
  assert.equal(element('#launchViberButton').disabled,true,'Új előkészítésnél újra menteni kell.');
  element('#closeViberFileButton').events.click();
  await element('#pdfPreviewButton').events.click();
  assert.equal(element('#pdfPreviewDialog').open,true,'A külön előnézet változatlanul elérhető.');
  assert.equal(element('#sharePdfPreviewButton').hidden,true);
  element('#openViberButton').events.click();
  assert.equal(downloaded.length,1,'Az előnézet Viber gombja sem indíthat letöltést.');
  assert.equal(context.window.location.href,'https://example.test/napi/');
  element('#savePdfPreviewButton').events.click();
  element('#openViberButton').events.click();
  assert.equal(context.window.location.href,'viber://forward?text=');
  assert.equal(downloaded.length,2);
  element('#discardPdfPreviewButton').events.click();
  fail=true;
  await element('#shareButton').events.click();
  assert.equal(element('#shareButton').disabled,false);
  assert.equal(element('#viberFileDialog').open,false);
  assert.equal(errors.length,1,'Sikertelen generálásról visszajelzés kell.');
  assert.equal(shared,0,'A Windows megosztó nem kaphatja meg a PDF-et vágólapos Viber-integráción keresztül.');
  assert.equal(copied,0,'A terv szövegét nem másoljuk.');
  console.log('PC-s Viber: PDF mentés, külön Viber-indítás, kézi csatolás, duplikáció nélkül: OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
