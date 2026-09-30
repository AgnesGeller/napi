const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync('js/app.js', 'utf8');
const fn = app.slice(app.indexOf('  async function createPlansPdfFile('), app.indexOf('  function downloadPdfFile('));

async function run(fail) {
  let removed = false;
  const scrollCalls = [];
  const source = {classList:{add() {}}};
  const win = {scrollX:12,scrollY:1500,scrollTo({left:x,top:y,behavior}) {assert.equal(behavior,'instant');this.scrollX=x;this.scrollY=y;scrollCalls.push([x,y]);},html2pdf() {},NapiPdfShare:{
    async createPdfBlob(_factory,_source,options) {
      assert.equal(win.scrollX,0);
      assert.equal(win.scrollY,0);
      assert.equal(doc.documentElement.style.scrollBehavior,'auto');
      assert.equal(options.html2canvas.scrollX,0);
      assert.equal(options.html2canvas.scrollY,0);
      assert.equal(options.margin,0);
      assert.equal(options.jsPDF.format,'a4');
      if (fail) throw new Error('Test rendering failure');
      return 'rendered';
    },createPdfFile:(blob,name)=>({blob,name})
  }};
  const doc = {documentElement:{style:{scrollBehavior:'smooth'}},body:{append() {}},createElement:()=>({append() {},remove(){removed=true;}})};
  const context = vm.createContext({window:win,document:doc,$:()=>({cloneNode:()=>source}),renderPrintView() {},waitForPrintLogos:async()=>{},printableCssText:()=>'',Date});
  vm.runInContext(fn,context);
  if (fail) await assert.rejects(context.createPlansPdfFile([], 'test.pdf'),/Test rendering failure/);
  else assert.equal((await context.createPlansPdfFile([], 'test.pdf')).name,'test.pdf');
  assert.deepEqual(scrollCalls,[[0,0],[12,1500]],'Az export kezdőpontja és a felület görgetésének visszaállítása hibás.');
  assert.equal(doc.documentElement.style.scrollBehavior,'smooth');
  assert.equal(removed,true,'Az ideiglenes exportelemnek hiba után is el kell tűnnie.');
}

(async()=>{await run(false);await run(true);console.log('PDF exportorigó és hiba utáni visszaállítás: OK');})().catch(error=>{console.error(error);process.exitCode=1;});
