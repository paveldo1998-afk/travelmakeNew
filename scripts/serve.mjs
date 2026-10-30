import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const arg = process.argv.indexOf('--port');
const port = Number(arg >= 0 ? process.argv[arg + 1] : process.env.TRAVELMAKE_PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid --port');
const prefix = '/travelmakeNew/';
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8','.pdf':'application/pdf'};
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/' || url.pathname === '/travelmakeNew') {
    res.writeHead(302, {Location: prefix + url.search}); res.end(); return;
  }
  if (!url.pathname.startsWith(prefix)) { res.writeHead(404); res.end('Not found'); return; }
  let relative;
  try { relative = decodeURIComponent(url.pathname.slice(prefix.length)); }
  catch { res.writeHead(400); res.end('Bad URL'); return; }
  if (!relative) relative = 'index.html';
  const target = path.resolve(root, relative);
  if ((!target.startsWith(root + path.sep) && target !== root) || relative.split(/[\\/]/).some(part => part.startsWith('.'))) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405, {Allow: 'GET, HEAD'}); res.end(); return; }
  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error('Not a file');
    res.writeHead(200, {'Content-Type': mime[path.extname(target)] || 'application/octet-stream',
      'Content-Length': info.size, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'});
    if (req.method === 'HEAD') res.end();
    else createReadStream(target).on('error', () => res.destroy()).pipe(res);
  } catch { res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'}); res.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => process.stdout.write(`TravelOrganizer preview: http://127.0.0.1:${port}${prefix}\n`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
