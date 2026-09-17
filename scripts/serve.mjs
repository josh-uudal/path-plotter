import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const port = Number(option('--port', '8123'));
const base = '/' + String(option('--base', '')).replace(/^\/+|\/+$/g, '');
const prefix = base === '/' ? '/' : base + '/';
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Use --port with an integer from 1 to 65535.');
}
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp'
};

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (base !== '/' && pathname === base) {
      response.writeHead(302, { Location: prefix }).end();
      return;
    }
    const requested = pathname.startsWith(prefix) ? pathname.slice(prefix.length) || 'index.html' : '';
    const path = resolve(root, requested);
    const resource = relative(root, path).replaceAll('\\', '/');
    const allowed = requested && (resource === 'index.html' || /^(assets|examples)\//.test(resource));
    if (!allowed || !path.startsWith(root.endsWith(sep) ? root : root + sep)) {
      response.writeHead(404).end('Not found');
      return;
    }
    const body = await readFile(path);
    response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    response.writeHead(error instanceof URIError ? 400 : 404).end('Not found');
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Path Plotter: http://127.0.0.1:${port}${prefix}`);
});
