import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { AppError, tools } from './workspace.js';

export const maxBodySize = 1024 * 1024;

export function createMcp(workspace) {
  return createMcpHandler(() => {
    const server = new McpServer({ name: 'mind-map-studio', version: '1.3.0' });
    for (const [name, tool] of Object.entries(tools)) {
      server.registerTool(name, {
        description: tool.description,
        inputSchema: tool.input,
        annotations: {
          readOnlyHint: Boolean(tool.readOnly),
          destructiveHint: Boolean(tool.destructive),
          idempotentHint: Boolean(tool.readOnly),
          openWorldHint: false
        }
      }, async args => {
        try {
          const result = await workspace.run(name, args);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        } catch (error) {
          if (!(error instanceof AppError)) console.error(error);
          const result = error instanceof AppError
            ? { error: error.message, status: error.status }
            : { error: 'Не удалось выполнить операцию', status: 500 };
          return { isError: true, content: [{ type: 'text', text: JSON.stringify(result) }] };
        }
      });
    }
    return server;
  }, { responseMode: 'json', maxRequestBodySize: maxBodySize });
}
