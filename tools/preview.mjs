/** Local development preview only. No business API or Python server is needed. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('dist'); const port = Number(process.env.PREVIEW_PORT || 4173);
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.ttf': 'font/ttf' };
createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const filename = resolve(root, '.' + (path === '/' ? '/index.html' : path === '/print' ? '/print_invoice.html' : path));
    if (!filename.startsWith(root + sep) || !(await stat(filename)).isFile()) throw new Error('Not found');
    response.writeHead(200, { 'Content-Type': types[extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(await readFile(filename));
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Development preview: http://127.0.0.1:${port}`));
