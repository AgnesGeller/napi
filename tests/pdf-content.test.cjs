const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/app.js', 'utf8');
const context = vm.createContext({
  document: {baseURI: 'https://example.test/'}, URL,
  escapeHTML: value => String(value).replaceAll('<', '&lt;'),
  formatDate: value => value,
  tasksByTeam: plan => plan.tasks.map(task => ({tasks:[task]})),
  data: {workers:[], vehicles:[], tools:[]}, byId: () => undefined,
  jobDescriptions: () => [{name:'Tesztfeladat',note:'',steps:[]}], clientNumberForVehicle: () => 1,
  validRating: () => 'normal', INTENSITY_DESCRIPTIONS: {normal:'Normál tempó'},
  QUALITY_DESCRIPTIONS: {normal:'Normál minőség'}, FINAL_NOTE:'Nap vége',
});
vm.runInContext(source.slice(source.indexOf('  function printPlanHTML('), source.indexOf('  function renderPrintView(')), context);
const task = {customerName:'Ügyfél', address:'Cím', vehicleIds:[], workerIds:[], toolIds:[], materials:[]};
const plan = {date:'2026-09-30', generalNote:'A kaput induláskor zárjátok be.', tasks:[task, {...task, customerName:'Másik ügyfél'}], workItems:[{customerName:'Vezetői titkos előjegyzés'}]};
const html = context.printPlanHTML(plan);
assert.ok(html.includes('Ügyfél') && html.includes('Másik ügyfél'));
assert.ok(html.includes('Következő csapat'));
assert.ok(html.includes('print-section print-jobs wide'), 'A hosszú feladatlista tördelhető PDF-blokkja hiányzik.');
assert.ok(html.includes('print-general-note') && html.includes('A kaput induláskor zárjátok be.'));
assert.ok(!html.includes('Egyéb megjegyzés'), 'A PDF-en csak a beírt szöveg jelenjen meg, mezőcím ne.');
assert.ok(!html.includes('Vezetői titkos előjegyzés') && !html.includes('Előjegyzések'));
assert.equal(plan.workItems.length,1,'A PDF elkészítése nem törölheti az előjegyzést.');
assert.ok(context.printPlanHTML({...plan,tasks:[]}).includes('Nincs feladat erre a napra.'));
console.log('PDF tartalom, vezetői előjegyzések kizárása, több csapat: OK');
