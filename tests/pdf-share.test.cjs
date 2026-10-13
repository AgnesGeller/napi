const assert = require("node:assert/strict");
const pdfShare = require("../js/pdf-share.js");

class TestFile extends Blob {
  constructor(parts, name, options) {
    super(parts, options);
    this.name = name;
    this.lastModified = options?.lastModified || 0;
  }
}

(async () => {
  const validPdf = new Blob(["%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF"], { type: "application/pdf" });
  const worker = {
    set(options) { this.options = options; return this; },
    from(element) { this.element = element; return this; },
    toPdf() { return this; },
    async outputPdf(type) { assert.equal(type, "blob"); return validPdf; }
  };
  const generated = await pdfShare.createPdfBlob(() => worker, { id: "print-view" }, { jsPDF: { format: "a4" } });
  assert.equal(generated, validPdf);
  assert.equal(await pdfShare.isReadablePdf(generated), true, "A generált fájlnak valódi PDF-fejléccel kell rendelkeznie.");
  const renderedCanvas = {width:1600,height:2262}; const renderedPdf = {pages:1};
  worker.get = async key => key === 'canvas' ? renderedCanvas : renderedPdf;
  let renderCallbackCount = 0;
  await pdfShare.createPdfBlob(() => worker, {}, {}, (canvas,pdf) => {
    assert.equal(canvas,renderedCanvas); assert.equal(pdf,renderedPdf); renderCallbackCount++;
  });
  assert.equal(renderCallbackCount,1,'Az előnézet ugyanazon renderelés oldalképét és PDF-jét kapja meg.');
  const draws=[];
  const safeCanvas={width:100,height:250,ownerDocument:{createElement:()=>({getContext:()=>({fillRect(){},drawImage(...args){draws.push(args);}})})}};
  const clone={querySelector:()=>({getBoundingClientRect:()=>({top:0,width:100}),querySelectorAll:()=>[]}),
    createTreeWalker:()=>({currentNode:{textContent:'Árvíztűrő'},nextNode(){if(this.done)return false;this.done=true;return true;}}),
    createRange:()=>({selectNodeContents(){},getClientRects:()=>[{top:95,bottom:110,height:15}]})};
  const safeWorker={
    set(options){if(options.canvas)this.canvas=options.canvas;else this.options=options;return this;},
    from(){return this;},
    async toCanvas(){await this.options.html2canvas.onclone(clone);this.canvas=safeCanvas;},
    get:async function(key){return key==='canvas'?this.canvas:key==='pageSize'?{inner:{ratio:1}}:renderedPdf;},
    toPdf(){return this;},outputPdf:async()=>validPdf
  };
  let cloneCalls=0;
  await pdfShare.createPdfBlob(()=>safeWorker,{}, {safeTextPageBreaks:true,html2canvas:{onclone(){cloneCalls++;}}},(canvas,_pdf,layout)=>{
    assert.equal(canvas.height,259,'A szöveg előtti hézag egész oldalszeletbe kerül.');
    assert.deepEqual(layout.cuts,[0,91,191,250]);
  });
  assert.equal(cloneCalls,1,'A korábbi klónozási callback nem veszhet el.');
  assert.equal(draws.reduce((height,args)=>height+args[4],0),250,'Minden forrássor bekerül a PDF-be.');

  const file = await pdfShare.createPdfFile(generated, "napi-feladatok.pdf", TestFile);
  assert.equal(file.name, "napi-feladatok.pdf");
  assert.equal(file.type, "application/pdf");
  assert.equal(await pdfShare.isReadablePdf(file), true, "A megosztott fájlnak megnyitható PDF-nek kell maradnia.");

  let sharedPayload;
  const navigatorWithFileShare = {
    canShare: payload => payload.files?.[0] === file,
    share: async payload => { sharedPayload = payload; }
  };
  assert.equal(await pdfShare.shareFile(navigatorWithFileShare, file, "Napi feladatok"), true);
  assert.deepEqual(sharedPayload.files, [file], "A Web Share API-nak a PDF-fájlt kell megkapnia.");
  assert.equal("text" in sharedPayload, false, "A PDF-megosztás elsődleges útja nem küldheti el a teljes terv szövegét.");
  assert.equal(pdfShare.supportsFileShare({ share: async () => {} }, file), false, "canShare nélkül a biztonságos fájlmegosztási fallback szükséges.");

  await assert.rejects(
    pdfShare.createPdfBlob(() => ({ set() { return this; }, from() { return this; }, toPdf() { return this; }, async outputPdf() { return new Blob(["nem pdf"]); } }), {}, {}),
    /nem olvasható/,
    "Hibás kimenetet nem szabad PDF-ként továbbadni."
  );

  console.log("PDF-fájl és Web Share viselkedési teszt: OK");
})().catch(error => { console.error(error); process.exitCode = 1; });
