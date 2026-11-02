import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
let port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const privateRoot = resolve(root, 'private');
const localAssetTypes = {
  mesh6: ['containers-mesh6.obj.gz', 'application/gzip'],
  mesh7: ['containers-mesh7.obj.gz', 'application/gzip'],
  texture: ['concrete.png', 'image/png'],
  enemyMerged: ['EnemyMerged.obj.gz', 'application/gzip'],
  enemyHeadless: ['EnemyMergedHeadless.obj.gz', 'application/gzip'],
};
const localAssets = new Map();
const inside = (file, directory) => file.toLowerCase().startsWith((directory.endsWith(sep) ? directory : directory + sep).toLowerCase());
try {
  const config = JSON.parse(await readFile(resolve(privateRoot, 'browser-assets.json'), 'utf8'));
  const actualPrivateRoot = await realpath(privateRoot);
  for (const [id, [name, type]] of Object.entries(localAssetTypes)) {
    if (config[id] === undefined) continue;
    if (typeof config[id] !== 'string') throw new TypeError('Invalid local asset configuration');
    const file = await realpath(resolve(privateRoot, config[id]));
    if (!inside(file, actualPrivateRoot) || !(await stat(file)).isFile()) {
      throw new Error('Local asset must be a file inside private/');
    }
    localAssets.set(id, { file, name, type });
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  localAssets.clear();
}
function send(res, status, type, body, head = false) {
  res.writeHead(status, {
    'Content-Type': type, 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
  });
  res.end(head ? undefined : body);
}
const server = createServer(async (req, res) => {
  try {
    // Loopback binding alone does not protect against DNS rebinding.
    const host = (req.headers.host || '').toLowerCase();
    if (![ `localhost:${port}`, `127.0.0.1:${port}` ].includes(host)) {
      send(res, 403, 'text/plain', 'Forbidden host'); return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, 'text/plain', 'Method not allowed'); return;
    }
    const url = new URL(req.url || '/', `http://${host}`);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith('/local-assets/')) {
      const site = req.headers['sec-fetch-site'];
      if ((site && site !== 'same-origin' && site !== 'none') ||
          (req.headers.origin && req.headers.origin !== `http://${host}`)) {
        send(res, 403, 'text/plain', 'Same-origin access only'); return;
      }
      const id = pathname.slice('/local-assets/'.length);
      if (id === 'manifest') {
        const assets = Object.fromEntries([...localAssets].map(([key, { name, type }]) => [key, { name, type }]));
        send(res, 200, 'application/json', JSON.stringify({ assets }), req.method === 'HEAD'); return;
      }
      const asset = localAssets.get(id);
      if (!asset) { send(res, 404, 'text/plain', 'Local asset unavailable'); return; }
      send(res, 200, asset.type, await readFile(asset.file), req.method === 'HEAD'); return;
    }
    const publicPath = pathname === '/' ? '/index.html' : pathname;
    if (!['/index.html', '/style.css', '/favicon.ico'].includes(publicPath) &&
        !publicPath.startsWith('/src/') && !publicPath.startsWith('/scripts/')) {
      send(res, 404, 'text/plain', 'Not found'); return;
    }
    const file = await realpath(resolve(root, `.${publicPath}`));
    if (!inside(file, root) || inside(file, privateRoot) ||
        publicPath.split('/').some(part => part.startsWith('.'))) {
      send(res, 403, 'text/plain', 'Forbidden'); return;
    }
    if (!(await stat(file)).isFile()) throw new Error('Not a file');
    const contents = await readFile(file);
    res.writeHead(200, { 'Content-Type': `${mime[extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' });
    res.end(req.method === 'HEAD' ? undefined : contents);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});
server.listen(port, '127.0.0.1', () => {
  port = server.address().port;
  console.log(`FRAME//BREAK running at http://localhost:${port}`);
});
