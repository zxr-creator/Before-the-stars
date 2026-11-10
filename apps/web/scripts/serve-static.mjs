// A plain static file server that mounts one directory under a path prefix, the way
// GitHub Pages serves a project site under /<repository>/. It has no API: anything
// the browser game needs must already be in the directory.
//
//   node apps/web/scripts/serve-static.mjs dist/pages 8080 /Before-the-stars/
//
// Requests outside the prefix, and files that do not exist, get 404 (with the
// directory's 404.html when there is one). Listens on 127.0.0.1 only.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist/pages');
const port = Number(process.argv[3] ?? 8080);
let prefix = process.argv[4] ?? '/';
if (!prefix.startsWith('/')) prefix = '/' + prefix;
if (!prefix.endsWith('/')) prefix += '/';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

async function notFound(res) {
  const page = await readFile(join(root, '404.html')).catch(() => null);
  res.writeHead(404, { 'content-type': page ? TYPES['.html'] : TYPES['.txt'] });
  res.end(page ?? 'Not found');
}

const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'content-type': TYPES['.txt'] });
      res.end('This is a static site.');
      return;
    }
    // like GitHub Pages: /name redirects to /name/
    if (path + '/' === prefix) {
      res.writeHead(301, { location: prefix });
      res.end();
      return;
    }
    if (!path.startsWith(prefix)) return await notFound(res);
    let file = normalize(join(root, path.slice(prefix.length)));
    if (file !== root && !file.startsWith(root + sep)) return await notFound(res);
    let info = await stat(file).catch(() => null);
    if (info?.isDirectory()) {
      file = join(file, 'index.html');
      info = await stat(file).catch(() => null);
    }
    if (!info?.isFile()) return await notFound(res);
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (e) {
    res.writeHead(500, { 'content-type': TYPES['.txt'] });
    res.end(String(e));
  }
});
server.listen(port, '127.0.0.1', () => console.log(`serving ${root} at http://127.0.0.1:${port}${prefix}`));
