import { DurableObject } from 'cloudflare:workers';
import { createGate, createService, isServicePath } from './http.js';
import { Workspace } from './workspace.js';

let gate;
const configuration = env => ({ usersJson: env.MINDMAP_USERS_JSON, token: env.MINDMAP_ACCESS_TOKEN });

export class MindMapWorkspace extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS workspace (part INTEGER PRIMARY KEY, content TEXT NOT NULL)');
    this.service = createService(new Workspace({
      load() {
        const parts = sql.exec('SELECT content FROM workspace ORDER BY part').toArray();
        return parts.length ? JSON.parse(parts.map(part => part.content).join('')) : null;
      },
      save(content) {
        ctx.storage.transactionSync(() => {
          sql.exec('DELETE FROM workspace');
          for (let start = 0; start < content.length;) {
            let end = Math.min(start + 32768, content.length);
            if (/[\uD800-\uDBFF]/.test(content[end - 1])) end--;
            sql.exec('INSERT INTO workspace (part, content) VALUES (?, ?)', start, content.slice(start, end));
            start = end;
          }
        });
      }
    }));
  }

  fetch(request) {
    return this.service(request, this.ctx.id.name);
  }
}

export default {
  async fetch(request, env) {
    if (!isServicePath(new URL(request.url).pathname)) return env.ASSETS.fetch(request);
    gate ??= createGate(configuration(env));
    const identity = await gate(request);
    if (identity instanceof Response) return identity;
    return env.WORKSPACES.getByName(identity).fetch(request);
  }
};
