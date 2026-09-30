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

  async function createPdfBlob(html2pdfFactory, element, options) {
    if (typeof html2pdfFactory !== "function") throw new Error("A PDF-készítő nem töltődött be.");
    const blob = await html2pdfFactory().set(options).from(element).toPdf().outputPdf("blob");
    if (!(await isReadablePdf(blob))) throw new Error("A létrehozott PDF-fájl nem olvasható.");
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

  return { createPdfBlob, createPdfFile, isReadablePdf, shareFile, supportsFileShare };
});
