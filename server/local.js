import http from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { createGate, createService, isServicePath, maxApiBodySize } from './http.js';
import { Workspace } from './workspace.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const data = path.resolve(process.env.MINDMAP_DATA_DIR || path.join(root, '.local'));
const port = Number(process.env.PORT || 4180);
const token = process.env.MINDMAP_ACCESS_TOKEN;
let usersJson = process.env.MINDMAP_USERS_JSON;
if (usersJson === undefined && !token) {
  try {
    usersJson = (await readFile(path.join(data, 'users.json'), 'utf8')).replace(/^\uFEFF/, '');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.error('Для входа настройте MINDMAP_USERS_JSON или .local/users.json');
  }
}

const gate = createGate({ usersJson, token });
const services = new Map();
function serviceFor(userId) {
  if (!services.has(userId)) {
    const dir = path.join(data, 'maps', Buffer.from(userId).toString('hex'));
    const file = path.join(dir, 'workspace.json');
    const workspace = new Workspace({
      async load() {
        try {
          return JSON.parse(await readFile(file, 'utf8'));
        } catch (error) {
          if (error.code === 'ENOENT') return null;
          throw error;
        }
      },
      async save(content) {
        await mkdir(dir, { recursive: true });
        await writeFile(file + '.tmp', content);
        await rename(file + '.tmp', file);
      }
    });
    services.set(userId, createService(workspace));
  }
  return services.get(userId);
}

const assets = new Map([
  ['/', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/map-model.js', ['map-model.js', 'text/javascript']],
  ['/map-view.js', ['map-view.js', 'text/javascript']],
  ['/markdown-it.min.js', ['markdown-it.min.js', 'text/javascript']],
  ['/icons.js', ['icons.js', 'text/javascript']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]
]);
const handler = toNodeHandler({
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (isServicePath(pathname)) {
      const identity = await gate(request);
      return identity instanceof Response ? identity : serviceFor(identity)(request, identity);
    }
    const asset = assets.get(pathname);
    if (!asset || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 });
    return new Response(request.method === 'HEAD' ? null : await readFile(path.join(root, 'public', asset[0])), {
      headers: { 'Content-Type': asset[1] + '; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }
    });
  }
}, { maxRequestBodySize: maxApiBodySize });

const checkHost = localhostHostValidation();
const checkOrigin = localhostOriginValidation();
const server = http.createServer((request, response) => {
  if (!checkHost(request, response) || !checkOrigin(request, response)) return;
  Promise.resolve(handler(request, response)).catch(error => {
    console.error(error);
    if (!response.headersSent) response.writeHead(500);
    response.end('Internal error');
  });
});

server.listen(port, '127.0.0.1', () => {
  const url = 'http://127.0.0.1:' + server.address().port;
  console.log('Редактор ' + url + '\nMCP ' + url + '/mcp');
});
