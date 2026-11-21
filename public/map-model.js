export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const palette = ['amber', 'olive', 'teal', 'coral', 'sand', 'orange', 'green', 'sky', 'slate', 'pink', 'blue', 'plum', 'violet'];
export const colorFamilies = [
  [['coral', 'Коралловый'], ['coral-light', 'Светло-коралловый'], ['coral-muted', 'Пыльно-коралловый'],
    ['coral-rich', 'Насыщенный коралловый'], ['coral-deep', 'Терракотовый']],
  [['amber', 'Янтарный'], ['sand', 'Песочный'], ['orange', 'Оранжевый'],
    ['amber-rich', 'Медовый'], ['amber-deep', 'Медный']],
  [['olive', 'Оливковый'], ['olive-light', 'Светло-оливковый'], ['olive-muted', 'Серо-оливковый'],
    ['olive-rich', 'Травяной'], ['olive-deep', 'Тёмно-оливковый']],
  [['green', 'Зелёный'], ['green-light', 'Светло-зелёный'], ['green-muted', 'Шалфейный'],
    ['green-rich', 'Изумрудный'], ['green-deep', 'Хвойный']],
  [['teal', 'Бирюзовый'], ['teal-light', 'Светло-бирюзовый'], ['teal-muted', 'Серо-бирюзовый'],
    ['teal-rich', 'Насыщенный бирюзовый'], ['teal-deep', 'Цвет морской волны']],
  [['blue', 'Синий'], ['sky', 'Голубой'], ['slate', 'Серо-синий'],
    ['blue-rich', 'Лазурный'], ['blue-deep', 'Глубокий синий']],
  [['violet', 'Фиолетовый'], ['violet-light', 'Лавандовый'], ['violet-muted', 'Серо-сиреневый'],
    ['violet-rich', 'Насыщенный фиолетовый'], ['violet-deep', 'Глубокий фиолетовый']],
  [['pink', 'Розовый'], ['pink-light', 'Светло-розовый'], ['pink-muted', 'Пыльно-розовый'],
    ['plum', 'Сливовый'], ['pink-deep', 'Ягодный']]
];
export const nodeColors = colorFamilies.flat().map(([id]) => id);
export const maxTitleLength = 320;
export const maxBranchOffset = 1_000_000;

function branchPosition(position) {
  if (!position || ![position.x, position.y].every(value => Number.isFinite(value) && Math.abs(value) <= maxBranchOffset)) {
    throw new AppError('Некорректные координаты ветви');
  }
  return { x: position.x, y: position.y };
}

function layoutMode(mode = 'auto') {
  if (mode !== 'auto' && mode !== 'free') throw new AppError('Неизвестный режим раскладки');
  return mode;
}

export function rootBranches(nodes) {
  let automatic = 0;
  return nodes.filter(node => node.parentId === 'root').map(node => ({
    node, side: node.side ?? (automatic++ % 2 === 0 ? 'right' : 'left')
  }));
}

function preserveRootSides(nodes, excluded) {
  for (const { node, side } of rootBranches(nodes)) {
    if (!excluded.has(node.id)) node.side = side;
  }
}

function normalizeTitle(value) {
  const title = typeof value === 'string' ? value.trim() : '';
  if (!title || title.length > maxTitleLength) {
    throw new AppError('Введите название длиной от 1 до ' + maxTitleLength + ' символов');
  }
  return title;
}

export function mapCreationFromExport(document) {
  const nodes = document?.nodes;
  if (!Array.isArray(nodes) || !nodes.length || nodes.length > 160) {
    throw new AppError('В файле должна быть карта с 1–160 узлами');
  }
  const idPattern = /^[a-zA-Z0-9_-]{1,64}$/;
  const normalized = nodes.map(node => {
    if (typeof node?.id !== 'string' || !idPattern.test(node.id) ||
        (node.id === 'root' ? node.parentId !== null
          : typeof node.parentId !== 'string' || !idPattern.test(node.parentId))) {
      throw new AppError('В файле есть узел с неверным идентификатором или родителем');
    }
    const notes = node.notes === undefined ? '' : node.notes;
    if (typeof notes !== 'string' || notes.length > 2000) throw new AppError('Заметки узла должны содержать до 2000 символов');
    if (node.color !== undefined && !nodeColors.includes(node.color)) throw new AppError('В файле есть неизвестный цвет узла');
    const normalized = { id: node.id, parentId: node.parentId, title: normalizeTitle(node.title), notes, color: node.color };
    if (node.linkedMapId !== undefined) {
      if (typeof node.linkedMapId !== 'string' || !idPattern.test(node.linkedMapId)) throw new AppError('Некорректная ссылка на карту');
      normalized.linkedMapId = node.linkedMapId;
    }
    if (node.side !== undefined) normalized.side = node.side;
    if (node.id !== 'root' && node.position !== undefined) normalized.position = branchPosition(node.position);
    return normalized;
  });
  const root = normalized.find(node => node.id === 'root');
  if (!root) throw new AppError('В карте отсутствует центральный узел');
  const branches = normalized.filter(node => node !== root);
  checkTree({ nodes: [root, ...branches] });
  return { title: root.title, notes: root.notes, color: root.color, linkedMapId: root.linkedMapId, branches, layout: layoutMode(document.layout) };
}

const findNode = (map, id) => {
  const node = map.nodes.find(candidate => candidate.id === id);
  if (!node) throw new AppError('Узел не найден', 404);
  return node;
};

function checkTree(map) {
  if (map.nodes.length > 160) throw new AppError('В карте может быть до 160 узлов');
  const nodes = new Map(map.nodes.map(node => [node.id, node]));
  if (nodes.size !== map.nodes.length) throw new AppError('Идентификаторы узлов должны быть уникальными');
  for (const node of map.nodes) {
    if (node.side !== undefined && (node.parentId !== 'root' || !['left', 'right'].includes(node.side))) {
      throw new AppError('Сторону можно задать только для ветви центрального узла');
    }
  }
  for (const node of map.nodes.slice(1)) {
    let parentId = node.parentId;
    const seen = new Set([node.id]);
    while (parentId !== 'root') {
      if (seen.has(parentId)) throw new AppError('Вложенность образует цикл');
      const parent = nodes.get(parentId);
      if (!parent) throw new AppError('Родительский узел не найден', 404);
      seen.add(parentId);
      if (seen.size > 10) throw new AppError('Допустимо до 10 уровней вложенности');
      parentId = parent.parentId;
    }
  }
}

function treeNodes({ title, notes, color, linkedMapId, branches }) {
  const root = { id: 'root', parentId: null, title, notes: notes ?? '', color: color ?? palette[0] };
  if (linkedMapId !== undefined) root.linkedMapId = linkedMapId;
  return [root, ...(branches ?? []).map((branch, index) => {
    const node = { ...branch, color: branch.color || palette[1 + index % (palette.length - 1)] };
    if (node.position !== undefined) node.position = branchPosition(node.position);
    return node;
  })];
}

function removeMissingLinks(map, maps) {
  const targets = new Set(maps.filter(item => item.id !== map.id).map(item => item.id));
  let changed = false;
  for (const node of map.nodes) {
    if (node.linkedMapId !== undefined && !targets.has(node.linkedMapId)) {
      delete node.linkedMapId;
      changed = true;
    }
  }
  return changed;
}

function createMap(maps, args) {
  if (maps.length >= 50) throw new AppError('В пространстве может быть до 50 карт');
  const title = normalizeTitle(args.title);
  const map = {
    id: crypto.randomUUID(), title, revision: 1, updatedAt: new Date().toISOString(),
    nodes: treeNodes({ ...args, title })
  };
  if (layoutMode(args.layout) === 'free') map.layout = 'free';
  checkTree(map);
  removeMissingLinks(map, maps);
  maps.push(map);
  return map;
}

function markUpdated(map) {
  map.revision++;
  map.updatedAt = new Date().toISOString();
}

export function movedBranchNodes(nodes, { nodeId, parentId, side, position }) {
  const map = { nodes: nodes.map(node => ({ ...node })) };
  const node = findNode(map, nodeId);
  if (node.id === 'root') throw new AppError('Центральный узел нельзя переместить');
  findNode(map, parentId);
  if (node.parentId === 'root' && !node.side && (parentId !== 'root' || side !== undefined)) {
    preserveRootSides(map.nodes, new Set([node.id]));
  }
  node.parentId = parentId;
  if (parentId !== 'root') delete node.side;
  if (side !== undefined) node.side = side;
  if (position !== undefined) node.position = branchPosition(position);
  checkTree(map);
  return map.nodes;
}

export class MapWorkspace {
  #queue = Promise.resolve();

  constructor(storage, validate = (_, input) => input) {
    this.storage = storage;
    this.validate = validate;
  }

  run(action, input) {
    const result = this.#queue.then(() => this.#run(action, input));
    this.#queue = result.catch(() => {});
    return result;
  }

  async #run(action, input) {
    const args = this.validate(action, input);
    const maps = await this.storage.load() || [];

    if (action === 'list_maps') {
      return maps.map(({ id, title, updatedAt, revision, nodes }) => ({
        id, title, updatedAt, revision, nodeCount: nodes.length
      })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }

    if (action === 'create_map') {
      const map = createMap(maps, args);
      await this.#save(maps);
      return map;
    }

    const index = maps.findIndex(map => map.id === args.mapId);
    if (index < 0) throw new AppError('Карта не найдена', 404);
    const map = maps[index];
    if (action === 'get_map') return map;
    if (map.revision !== args.expectedRevision) throw new AppError('Карта уже изменилась. Обновите её и повторите действие.', 409);
    if (action === 'delete_map') {
      maps.splice(index, 1);
      for (const remaining of maps) {
        if (removeMissingLinks(remaining, maps)) markUpdated(remaining);
      }
      await this.#save(maps);
      return { deleted: map.id };
    }

    let createdMap;
    if (action === 'create_linked_map') {
      const node = findNode(map, args.nodeId);
      createdMap = createMap(maps, { title: args.title ?? node.title, notes: node.notes, color: node.color });
      node.linkedMapId = createdMap.id;
    } else if (action === 'set_node_link') {
      const node = findNode(map, args.nodeId);
      if (args.linkedMapId === null) delete node.linkedMapId;
      else {
        if (args.linkedMapId === map.id) throw new AppError('Выберите другую карту');
        if (!maps.some(target => target.id === args.linkedMapId)) throw new AppError('Связанная карта не найдена', 404);
        node.linkedMapId = args.linkedMapId;
      }
    } else if (action === 'move_node') map.nodes = movedBranchNodes(map.nodes, args);
    else {
      this.#edit(map, action, args);
      if (action === 'restore_map') removeMissingLinks(map, maps);
      checkTree(map);
    }
    map.title = map.nodes[0].title;
    markUpdated(map);
    await this.#save(maps);
    return createdMap ? { sourceMap: map, createdMap } : map;
  }

  #edit(map, action, args) {
    if (action === 'set_node_colors') {
      if (!Array.isArray(args.nodeIds) || !args.nodeIds.length || args.nodeIds.length > 160 || !nodeColors.includes(args.color)) {
        throw new AppError('Укажите узлы и цвет палитры');
      }
      const nodes = args.nodeIds.map(id => findNode(map, id));
      for (const node of nodes) node.color = args.color;
      return;
    }

    if (action === 'restore_map') {
      const state = mapCreationFromExport(args);
      map.nodes = treeNodes(state);
      map.layout = state.layout;
      return;
    }

    if (action === 'set_layout') {
      map.layout = layoutMode(args.layout);
      for (const { nodeId, x, y } of args.positions ?? []) {
        if (nodeId === 'root') throw new AppError('Центральный узел задаёт начало координат');
        findNode(map, nodeId).position = branchPosition({ x, y });
      }
      return;
    }

    if (action === 'add_node') {
      const parent = findNode(map, args.parentId);
      const count = map.nodes.filter(node => node.parentId === 'root').length;
      let index = map.nodes.length;
      if (args.afterId !== undefined) {
        const sibling = findNode(map, args.afterId);
        if (sibling.parentId !== parent.id) throw new AppError('У соседних узлов должен быть общий родитель');
        index = map.nodes.indexOf(sibling) + 1;
      }
      const node = {
        id: crypto.randomUUID(), parentId: parent.id, title: normalizeTitle(args.title), notes: args.notes ?? '',
        color: args.color || (parent.id === 'root' ? palette[count % palette.length] : parent.color)
      };
      if (args.side !== undefined) node.side = args.side;
      if (args.position !== undefined) node.position = branchPosition(args.position);
      map.nodes.splice(index, 0, node);
      return;
    }

    if (action === 'delete_node') {
      const ids = args.nodeIds ?? [args.nodeId];
      if (!ids.length || (args.nodeIds && args.nodeId !== undefined)) throw new AppError('Укажите узлы для удаления');
      const removed = new Set(ids.map(id => findNode(map, id).id));
      if (removed.has('root')) throw new AppError('Центральный узел нельзя удалить');
      while (true) {
        const size = removed.size;
        for (const child of map.nodes) if (removed.has(child.parentId)) removed.add(child.id);
        if (size === removed.size) break;
      }
      if (map.nodes.some(node => removed.has(node.id) && node.parentId === 'root' && !node.side)) {
        preserveRootSides(map.nodes, removed);
      }
      map.nodes = map.nodes.filter(child => !removed.has(child.id));
      return;
    }

    const node = findNode(map, args.nodeId);
    if (action === 'update_node') {
      if (args.title !== undefined) node.title = normalizeTitle(args.title);
      if (args.notes !== undefined) node.notes = args.notes;
      if (args.color !== undefined) node.color = args.color;
      return;
    }
    throw new AppError('Неизвестная операция', 404);
  }

  async #save(maps) {
    const content = JSON.stringify(maps);
    if (new TextEncoder().encode(content).length > 2 * 1024 * 1024) {
      throw new AppError('Хранилище карт заполнено', 413);
    }
    await this.storage.save(content);
  }
}
