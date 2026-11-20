import { z } from 'zod';
import { AppError, MapWorkspace, maxBranchOffset, maxTitleLength, nodeColors } from '../public/map-model.js';

export { AppError };

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const title = z.string().trim().min(1).max(maxTitleLength);
const notes = z.string().max(2000);
const color = z.enum(nodeColors);
const side = z.enum(['left', 'right']).optional();
const nodeId = { nodeId: id };
const mutable = { mapId: id, expectedRevision: z.number().int().min(1) };
const layout = z.enum(['auto', 'free']);
const offset = z.number().min(-maxBranchOffset).max(maxBranchOffset);
const coordinates = { x: offset, y: offset };
const position = z.object(coordinates).optional();
const branch = z.object({ id, parentId: id.default('root'), title, notes: notes.default(''), color: color.optional(), side, position });
const patch = { title: title.optional(), notes: notes.optional(), color: color.optional() };
const restoreInput = z.object({ ...mutable, layout: layout.optional(), nodes: z.array(z.unknown()).min(1).max(160) });

export const tools = {
  list_maps: { description: 'List mind maps in your workspace with their IDs and revisions.', input: z.object({}), readOnly: true },
  get_map: { description: 'Read a mind map with its complete tree and revision.', input: z.object({ mapId: id }), readOnly: true },
  create_map: {
    description: 'Create a mind map. To create a complete tree in one call, pass branches with unique IDs and parent IDs. Use root as the parent for top-level branches.',
    input: z.object({
      title, notes: notes.default(''), color: color.default('violet'), branches: z.array(branch).max(159).default([]), layout: layout.optional()
    })
  },
  add_node: {
    description: 'Add a child to an existing node. Set side for a direct child of root or afterId to insert after another child of the same parent. Read the map first to obtain expectedRevision.',
    input: z.object({ ...mutable, parentId: id, title, notes: notes.default(''), color: color.optional(), side, afterId: id.optional(), position })
  },
  update_node: {
    description: 'Change a node title, notes or color. Renaming root also renames the map.',
    input: z.object({ ...mutable, ...nodeId, ...patch })
  },
  move_node: {
    description: 'Move a branch and its descendants. Use position for an offset from the parent in free layout. Keep parentId to move without reparenting. Set side when moving under root.',
    input: z.object({ ...mutable, ...nodeId, parentId: id, side, position })
  },
  set_layout: {
    description: 'Switch between automatic and free layout. Optional positions are node center offsets from their parents in canvas units.',
    input: z.object({ ...mutable, layout, positions: z.array(z.object({ ...nodeId, ...coordinates })).max(159).optional() })
  },
  delete_node: {
    description: 'Delete branches and their descendants atomically. Supply nodeId for one branch or nodeIds for several. The root cannot be deleted.',
    input: z.object({ ...mutable, nodeId: id.optional(), nodeIds: z.array(id).min(1).max(159).optional() })
      .refine(args => Boolean(args.nodeId) !== Boolean(args.nodeIds), 'Provide exactly one of nodeId or nodeIds'),
    destructive: true
  },
  delete_map: {
    description: 'Permanently delete a mind map and its nodes.',
    input: z.object(mutable), destructive: true
  }
};

function validate(action, input) {
  const schema = action === 'restore_map' ? restoreInput : Object.hasOwn(tools, action) && tools[action].input;
  if (!schema) throw new AppError('Неизвестная операция', 404);
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('Некорректные параметры: ' + parsed.error.issues.map(issue => issue.path.join('.') || issue.message).join(', '));
  }
  return parsed.data;
}

export class Workspace extends MapWorkspace {
  constructor(storage) {
    super(storage, validate);
  }
}
