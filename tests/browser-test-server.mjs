import http from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "tmp", "pdfs", "browser-regression.pdf");
const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };

http.createServer(async (request, response) => {
  if (request.method === "POST" && request.url === "/__test_pdf_capture") {
    const chunks = []; let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 10 * 1024 * 1024) { response.writeHead(413).end(); return; }
      chunks.push(chunk);
    }
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, Buffer.concat(chunks));
    response.writeHead(204).end();
    return;
  }
  const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filename = path.resolve(root, relative);
  if (!filename.startsWith(`${path.resolve(root)}${path.sep}`)) { response.writeHead(403).end(); return; }
  try {
    const stat = await fs.stat(filename);
    if (!stat.isFile()) throw new Error("not a file");
    response.writeHead(200, { "Content-Type": contentTypes[path.extname(filename)] || "application/octet-stream", "Cache-Control": "no-store" });
    createReadStream(filename).pipe(response);
  } catch (_) { response.writeHead(404).end("Not found"); }
}).listen(Number(process.env.NAPI_TEST_PORT || 4174), "127.0.0.1", () => console.log(`Browser test server: http://127.0.0.1:${process.env.NAPI_TEST_PORT || 4174}`));
