((root, factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NapiPdfShare = api;
})(typeof window === "undefined" ? globalThis : window, () => {
  "use strict";

  async function isReadablePdf(blob) {
    if (!blob || typeof blob.slice !== "function" || blob.size < 5) return false;
    const signature = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    return String.fromCharCode(...signature) === "%PDF-";
  }
  function safePageCuts(height, pageHeight, ranges) {
    if (!(height > 0 && pageHeight > 0)) throw new Error('A PDF oldalmérete hibás.');
    const protectedRanges = ranges.filter(range => range.bottom > range.top && range.bottom - range.top < pageHeight);
    const cuts = [0];
    while (cuts.at(-1) + pageHeight < height) {
      const start = cuts.at(-1);
      let end = start + pageHeight;
      let previous;
      do {
        previous = end;
        for (const range of protectedRanges) {
          if (range.top > start && range.top < end && range.bottom > end) end = Math.min(end, Math.floor(range.top));
        }
      } while (end !== previous);
      cuts.push(end);
    }
    cuts.push(height);
    return cuts;
  }

  function captureTextRanges(document) {
    const container = document.querySelector('.html2pdf__container');
    if (!container) throw new Error('A PDF szövegének oldaltörése nem ellenőrizhető.');
    const origin = container.getBoundingClientRect();
    const ranges = [];
    const protect = rect => { if (rect.height > 0) ranges.push({top:rect.top-origin.top, bottom:rect.bottom-origin.top}); };
    container.querySelectorAll('.print-job-description, .print-client-heading, .print-task-heading, .print-section:not(.print-jobs)').forEach(element => protect(element.getBoundingClientRect()));
    container.querySelectorAll('.print-task-start').forEach(element => {
      const heading = element.querySelector('.print-task-heading');
      const client = element.querySelector('.print-client-heading');
      const firstJob = element.querySelector('.print-job-description');
      if (heading && client) {
        const top = heading.getBoundingClientRect().top;
        const bottom = (firstJob || client).getBoundingClientRect().bottom;
        protect({top,bottom,height:bottom-top});
      }
    });
    container.querySelectorAll('.print-client-block').forEach(element => {
      const heading = element.querySelector('.print-client-heading');
      const firstJob = element.querySelector('.print-job-description');
      if (heading && firstJob) {
        const top = heading.getBoundingClientRect().top, bottom = firstJob.getBoundingClientRect().bottom;
        protect({top,bottom,height:bottom-top});
      }
    });
    const walker = document.createTreeWalker(container, 4);
    while (walker.nextNode()) {
      if (!walker.currentNode.textContent.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(walker.currentNode);
      for (const rect of range.getClientRects()) protect(rect);
    }
    return {width:origin.width, ranges};
  }

  function paginateCanvas(canvas, pageRatio, geometry) {
    if (!(canvas.width > 0 && geometry.width > 0)) throw new Error('A PDF szövegének méretezése hibás.');
    const pageHeight = Math.floor(canvas.width * pageRatio);
    const scale = canvas.width / geometry.width;
    // A rasterizálás kerekítése és az ékezetek miatt kis biztonsági sávot hagyunk.
    const ranges = geometry.ranges.map(range => ({top:Math.max(0,Math.floor(range.top*scale)-4), bottom:Math.ceil(range.bottom*scale)+4}));
    const cuts = safePageCuts(canvas.height, pageHeight, ranges);
    if (cuts.length === 2) return {canvas,cuts,ranges};
    const paged = canvas.ownerDocument.createElement('canvas');
    paged.width = canvas.width;
    paged.height = (cuts.length-2)*pageHeight + cuts.at(-1)-cuts.at(-2);
    const context = paged.getContext('2d');
    context.fillStyle = '#ffffff'; context.fillRect(0,0,paged.width,paged.height);
    cuts.slice(0,-1).forEach((start,index) => {
      const height = cuts[index+1]-start;
      context.drawImage(canvas,0,start,canvas.width,height,0,index*pageHeight,canvas.width,height);
    });
    return {canvas:paged,cuts,ranges};
  }

  async function createPdfBlob(html2pdfFactory, element, options, onRendered) {
    if (typeof html2pdfFactory !== "function") throw new Error("A PDF-készítő nem töltődött be.");
    const {safeTextPageBreaks = false, ...renderOptions} = options;
    let geometry, layout;
    if (safeTextPageBreaks) {
      const previousOnClone = renderOptions.html2canvas?.onclone;
      renderOptions.html2canvas = {...renderOptions.html2canvas, onclone:async document => {
        if (previousOnClone) await previousOnClone(document);
        geometry = captureTextRanges(document);
      }};
    }
    let worker = html2pdfFactory().set(renderOptions).from(element);
    if (safeTextPageBreaks) {
      await worker.toCanvas();
      const canvas = await worker.get('canvas');
      const pageSize = await worker.get('pageSize');
      if (!geometry) throw new Error('A PDF biztonságos oldaltörése nem készíthető el.');
      layout = paginateCanvas(canvas,pageSize.inner.ratio,geometry);
      worker = worker.set({canvas:layout.canvas});
    }
    worker = worker.toPdf();
    const blob = await worker.outputPdf("blob");
    if (!(await isReadablePdf(blob))) throw new Error("A létrehozott PDF-fájl nem olvasható.");
    if (onRendered) await onRendered(await worker.get("canvas"), await worker.get("pdf"), layout);
    return blob;
  }

  async function createPdfFile(blob, filename, FileConstructor = globalThis.File) {
    if (!(await isReadablePdf(blob))) throw new Error("A megosztandó PDF-fájl nem olvasható.");
    if (typeof FileConstructor !== "function") throw new Error("Ez a böngésző nem tud fájlt megosztani.");
    return new FileConstructor([blob], filename, { type: "application/pdf", lastModified: Date.now() });
  }

  function supportsFileShare(navigatorObject, file) {
    if (typeof navigatorObject?.share !== "function" || typeof navigatorObject?.canShare !== "function") return false;
    try { return navigatorObject.canShare({ files: [file] }); }
    catch (_) { return false; }
  }

  async function shareFile(navigatorObject, file, title) {
    if (!supportsFileShare(navigatorObject, file)) return false;
    await navigatorObject.share({ title, files: [file] });
    return true;
  }

  return { createPdfBlob, createPdfFile, isReadablePdf, safePageCuts, shareFile, supportsFileShare };
});
