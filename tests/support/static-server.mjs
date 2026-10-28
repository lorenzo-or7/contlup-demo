/* Servidor estático mínimo para testar o site localmente (o chat usa módulos ES, que não abrem via file://).
   Uso: npm run serve  ->  http://localhost:8080 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };
const BLOCKED = /(^|\/)(\.[^/]*|_[^/]*|node_modules|worker|tests|eval|docs)(\/|$)/; // como no GitHub Pages (_config.yml)

export function createStaticServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      if (BLOCKED.test(rel)) { res.writeHead(404).end(); return; }
      const file = path.resolve(ROOT, rel);
      if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
      const data = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    } catch { res.writeHead(404).end(); }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8080);
  createStaticServer().listen(port, () => console.log(`Site em http://localhost:${port}`));
}
