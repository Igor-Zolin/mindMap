import { createAuthenticator } from './auth.js';
import { createMcp } from './mcp.js';
import { AppError } from './workspace.js';

const json = (value, status = 200, headers = {}) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

export const isServicePath = pathname => pathname === '/mcp' || pathname.startsWith('/api/');
export const maxApiBodySize = 2 * 1024 * 1024;

export function createGate(config) {
  const authenticate = createAuthenticator(config);
  return async request => {
    const origin = request.headers.get('Origin');
    if (origin !== null && origin !== new URL(request.url).origin) return json({ error: 'Origin not allowed' }, 403);
    const userId = await authenticate(request);
    if (userId === null) return json({ error: 'Настройте MINDMAP_USERS_JSON или локальный реестр ключей' }, 503);
    if (!userId) return json({ error: 'Введите действующий ключ доступа' }, 401, {
      'WWW-Authenticate': 'Bearer realm="mindMap"'
    });
    return userId;
  };
}

async function readJson(request) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new AppError('Ожидается application/json', 415);
  }
  if (!request.body) throw new AppError('Отсутствует тело запроса');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = '';
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxApiBodySize) {
        await reader.cancel();
        throw new AppError('Запрос слишком большой', 413);
      }
      body += decoder.decode(value, { stream: true });
    }
    const args = JSON.parse(body + decoder.decode());
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new AppError('Ожидается JSON-объект');
    return args;
  } catch (error) {
    if (error instanceof SyntaxError) throw new AppError('Некорректный JSON');
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function createService(workspace) {
  const mcp = createMcp(workspace);
  const nodeActions = new Set(['add_node', 'update_node', 'set_node_colors', 'move_node', 'delete_node', 'delete_map', 'set_layout', 'restore_map']);
  return async (request, userId) => {
    const { pathname } = new URL(request.url);
    try {
      if (pathname === '/mcp') return await mcp.fetch(request);
      if (pathname === '/api/session' && request.method === 'GET') return json({ userId });
      if (pathname === '/api/maps') {
        if (request.method === 'GET') return json(await workspace.run('list_maps', {}));
        if (request.method === 'POST') return json(await workspace.run('create_map', await readJson(request)), 201);
      }
      const match = /^\/api\/maps\/([A-Za-z0-9_-]{1,64})$/.exec(pathname);
      if (match) {
        const mapId = match[1];
        if (request.method === 'GET') return json(await workspace.run('get_map', { mapId }));
        if (request.method === 'POST') {
          const { action, ...args } = await readJson(request);
          if (nodeActions.has(action)) return json(await workspace.run(action, { ...args, mapId }));
        }
      }
      return json({ error: 'Маршрут не найден' }, 404);
    } catch (error) {
      if (error instanceof AppError) return json({ error: error.message }, error.status);
      console.error(error);
      return json({ error: 'Не удалось выполнить операцию' }, 500);
    }
  };
}
