import { applyIcons, icon } from './icons.js';
import { AppError, MapWorkspace, colorFamilies, mapCreationFromExport, maxTitleLength } from './map-model.js';
import { element, MapView, mountDetailsPanel, renderMarkdown, setColor, visibleMapNodes } from './map-view.js';

const $ = id => document.getElementById(id);
const branches = [
  { id: 'strategy', parentId: 'root', title: 'Стратегия', color: 'olive' },
  { id: 'product', parentId: 'root', title: 'Продукт', color: 'teal' },
  { id: 'marketing', parentId: 'root', title: 'Маркетинг', color: 'coral' },
  { id: 'metrics', parentId: 'root', title: 'Метрики', color: 'sand' },
  { id: 'audience', parentId: 'strategy', title: 'Аудитория', color: 'olive' },
  { id: 'positioning', parentId: 'strategy', title: 'Позиция на рынке', color: 'olive' },
  { id: 'scope', parentId: 'product', title: 'Функции MVP', color: 'teal' },
  { id: 'prototype', parentId: 'product', title: 'Прототип', color: 'teal' },
  { id: 'channels', parentId: 'marketing', title: 'Каналы', color: 'coral' },
  { id: 'content', parentId: 'marketing', title: 'Контент-план', color: 'coral' },
  { id: 'success', parentId: 'metrics', title: 'Критерии успеха', color: 'sand' },
  { id: 'dashboard', parentId: 'metrics', title: 'Дашборд', color: 'sand' }
];
const demo = {
  id: 'example', title: 'Запуск продукта',
  nodes: [{ id: 'root', parentId: null, title: 'Запуск продукта', color: 'amber',
    notes: 'Разложите подготовку к запуску на направления, задачи и критерии успеха.' }, ...branches]
};
const plurals = new Intl.PluralRules('ru');
const nodeLabels = { one: 'узел', few: 'узла', many: 'узлов' };
const labelCount = count => count + ' ' + nodeLabels[plurals.select(count)];

let key = '';
let identity = null;
let maps = [];
let map = null;
let selection = ['root'];
let viewing = false;
const collapsedMaps = new Map();
const mapHistories = new Map();
const historyLimit = 25;
let textStyle = false;
let paletteExpanded = false;
let draft;
let busy = false;
let polling = false;
let sequence = 0;
let toastTimer;
let dialogAction;
const view = new MapView($('canvas'), {
  onSelect: selectNode, onAdd: startAdd, onMarquee: selectNodes, onRename: renameNode,
  onBranchStart: id => selectNodes([id]), onBranchDrop: moveBranch, onCollapse: toggleCollapse
});
const workArea = document.querySelector('.work-area');
const details = mountDetailsPanel(workArea);
applyIcons();

const guestKey = 'mindmap.guest-maps.v1';
const themeKey = 'mindmap.theme';
const nodeStyleKey = 'mindmap.node-style';
const trackpadKey = 'mindmap.trackpad';
const wheelSensitivityKey = 'mindmap.wheel-sensitivity';
const minWheelSensitivity = 10;
const maxWheelSensitivity = 100;
let browserStorage;
try { browserStorage = window.localStorage; } catch { /* Use memory if storage is blocked. */ }
let guestContent = null;
const guestWorkspace = new MapWorkspace({
  load: () => JSON.parse(browserStorage?.getItem(guestKey) ?? guestContent ?? 'null'),
  save(content) {
    try {
      if (browserStorage) browserStorage.setItem(guestKey, content);
      else guestContent = content;
    } catch {
      throw new AppError('В браузере не удалось сохранить карту. Проверьте доступное место.');
    }
  }
});

function runMapAction(action, args = {}) {
  if (!identity) {
    const run = () => guestWorkspace.run(action, args);
    return navigator.locks ? navigator.locks.request(guestKey, run) : run();
  }
  if (action === 'list_maps') return api('maps');
  if (action === 'get_map') return api('maps/' + args.mapId);
  if (action === 'create_map') return api('maps', args);
  const { mapId, ...fields } = args;
  return api('maps/' + mapId, { ...fields, action });
}

async function api(path, body, accessKey = key) {
  const headers = { Authorization: 'Bearer ' + accessKey };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/' + path, {
    method: body === undefined ? 'GET' : 'POST', headers,
    body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store'
  });
  const data = await response.json();
  if (response.ok) return data;
  throw Object.assign(new Error(data.error || 'Не удалось выполнить запрос'), { status: response.status });
}

function setSync(text, type) {
  const sync = $('sync');
  sync.className = 'sync' + (type ? ' ' + type : '');
  sync.lastChild.textContent = text;
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4600);
}

function displayMap() {
  return map || (!maps.length ? demo : null);
}

function updateSync() {
  const label = identity ? 'Подключено' : browserStorage ? 'В этом браузере' : 'До закрытия вкладки';
  setSync(displayMap()?.id === demo.id ? 'Пример карты' : label, identity ? 'live' : '');
}

function button(text, kind, glyph, click) {
  const control = element('button', 'button ' + kind);
  control.type = 'button';
  if (glyph) {
    const symbol = element('span');
    symbol.innerHTML = icon(glyph);
    control.append(symbol);
  }
  control.append(text);
  if (click) control.onclick = click;
  return control;
}

function renderRail() {
  const displayed = displayMap();
  const listed = maps;
  $('map-count').textContent = String(listed.length);
  const entries = listed.length ? listed : [{ id: demo.id, title: demo.title, nodeCount: demo.nodes.length }];
  $('maps').replaceChildren(...entries.map(entry => {
    const active = displayed?.id === entry.id;
    const item = element('button', 'map-item' + (active ? ' active' : ''));
    item.type = 'button';
    item.setAttribute('aria-current', String(active));
    const glyph = element('span');
    glyph.innerHTML = icon('map');
    const caption = element('span');
    caption.style.minWidth = '0';
    caption.append(element('strong', null, entry.title), element('small', null,
      entry.id === demo.id ? 'Пример · ' + labelCount(entry.nodeCount) : labelCount(entry.nodeCount)));
    item.append(glyph, caption);
    item.onclick = () => {
      document.querySelector('.sidebar').classList.remove('open');
      if (!active && entry.id !== demo.id) openMap(entry.id);
    };
    return item;
  }));
  $('account-name').textContent = identity?.userId || 'Гость';
  $('account-label').textContent = identity ? 'Выйти в гостевой режим' : 'Войти по ключу';
  $('account-action').innerHTML = icon(identity ? 'logout' : 'login');
}

function render({ fit = false, preserveDraft = false } = {}) {
  const displayed = displayMap();
  const collapsed = collapsedMaps.get(displayed?.id) ?? new Set();
  if (displayed && selection.length) {
    const visible = new Set(visibleMapNodes(displayed.nodes, collapsed).map(node => node.id));
    selection = selection.filter(id => visible.has(id));
    if (!selection.length) selection = ['root'];
  }
  $('map-title').textContent = displayed?.title || 'Мои карты';
  $('map-meta').textContent = displayed ? labelCount(displayed.nodes.length) + (displayed.id === demo.id ? ' · Пример' : '') : '';
  workArea.classList.toggle('view-mode', viewing);
  $('create').hidden = viewing;
  $('empty-create').hidden = viewing;
  $('import').hidden = viewing;
  $('add').hidden = viewing || !map;
  $('toggle-inspector').hidden = viewing;
  $('inspector').hidden = viewing;
  const mode = $('view-mode');
  const modeLabel = viewing ? 'Редактировать' : 'Просмотр';
  mode.setAttribute('aria-pressed', String(viewing));
  mode.setAttribute('aria-label', modeLabel);
  mode.title = viewing ? 'Вернуться к редактированию' : 'Открыть режим просмотра';
  mode.firstElementChild.innerHTML = icon(viewing ? 'edit' : 'eye');
  mode.lastElementChild.textContent = modeLabel;
  updateAddButton();
  $('export').disabled = !displayed;
  $('empty').hidden = Boolean(displayed);
  renderRail();
  $('node-style').setAttribute('aria-pressed', String(textStyle));
  const free = displayed?.layout === 'free';
  const layoutMode = $('layout-mode');
  layoutMode.hidden = !map || viewing;
  layoutMode.setAttribute('aria-pressed', String(free));
  layoutMode.title = free ? 'Вернуться к автоматической раскладке' : 'Включить свободное размещение';
  view.render(displayed, selection, fit, Boolean(map) && !viewing, textStyle, collapsed);
  if (viewing) {
    const selected = displayed?.nodes.find(node => node.id === selection[0]);
    if (selected) details.update(selected.title, selected.notes, view.buttons.get(selected.id));
    else details.hide();
  }
  if (!preserveDraft || draft?.nodeId !== selection[0]) renderInspector();
  else updateRootActions();
  updateHistoryButtons();
  updateSync();
}

function nodeColorPalette(initialColor, editable, onChange) {
  const field = element('div', 'field node-palette', 'Цвет узла');
  const main = element('div', 'palette-main');
  const shades = element('div', 'palette-shades');
  shades.id = 'node-color-shades';
  const swatches = new Map();

  function markSelection(color) {
    const family = swatches.get(color)?.dataset.family;
    for (const [id, swatch] of swatches) {
      swatch.setAttribute('aria-pressed', String(id === color));
      swatch.classList.toggle('active-family', id === family && id !== color);
      swatch.innerHTML = id === color ? icon('check') : '';
    }
  }

  function addSwatch(container, [id, label], family) {
    const swatch = element('button', 'swatch');
    swatch.type = 'button';
    swatch.title = label;
    swatch.setAttribute('aria-label', label);
    swatch.dataset.color = id;
    swatch.dataset.family = family;
    swatch.disabled = !editable;
    setColor(swatch, id);
    swatch.onclick = () => {
      markSelection(id);
      onChange(id);
    };
    swatches.set(id, swatch);
    container.append(swatch);
  }

  for (const [primary, ...variants] of colorFamilies) {
    addSwatch(main, primary, primary[0]);
    const column = element('div', 'palette-column');
    column.setAttribute('role', 'group');
    column.setAttribute('aria-label', 'Оттенки цвета «' + primary[1] + '»');
    for (const variant of variants) addSwatch(column, variant, primary[0]);
    shades.append(column);
  }

  const toggle = element('button', 'icon-button palette-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Оттенки палитры');
  toggle.setAttribute('aria-controls', shades.id);
  toggle.innerHTML = icon('chevron');
  function updateExpansion() {
    shades.hidden = !paletteExpanded;
    toggle.title = paletteExpanded ? 'Скрыть оттенки' : 'Показать оттенки';
    toggle.setAttribute('aria-expanded', String(paletteExpanded));
  }
  toggle.onclick = () => {
    paletteExpanded = !paletteExpanded;
    updateExpansion();
  };
  main.append(toggle);
  field.append(main, shades);
  markSelection(initialColor);
  updateExpansion();
  return field;
}

function renderInspector() {
  const displayed = displayMap();
  const node = displayed?.nodes.find(item => item.id === selection[0]);
  const body = $('inspector-body');
  const footer = $('inspector-footer');
  body.replaceChildren();
  footer.replaceChildren();
  draft = undefined;
  updateRootActions();
  if (viewing) return;
  if (selection.length > 1) {
    const branches = selection.filter(id => id !== 'root');
    const children = childBranchesForSelection(displayed.nodes, selection);
    const collapsed = collapsedMaps.get(displayed.id);
    const foldedChildren = children.filter(id => collapsed?.has(id));
    const actions = element('div', 'bulk-actions');
    const collapse = button('Свернуть все', 'secondary', null, () => changeCollapse(branches));
    const collapseChildren = button('Скрыть дочерние узлы', 'secondary', null, () => changeCollapse(children));
    const expandChildren = button('Показать дочерние узлы', 'secondary', null, () => changeCollapse(foldedChildren, 'show'));
    const remove = button('Удалить все', 'danger', 'trash', showDeleteNode);
    collapse.disabled = !branches.length;
    collapseChildren.disabled = children.length === foldedChildren.length;
    expandChildren.disabled = !foldedChildren.length;
    remove.disabled = !map || !branches.length;
    actions.append(collapse, collapseChildren, expandChildren, remove);
    body.append(actions, element('p', 'inspector-empty', 'Выбрано ' + labelCount(selection.length)));
    return;
  }
  if (!node) {
    body.append(element('p', 'inspector-empty', 'Выберите узел на холсте.'));
    return;
  }

  const editable = displayed.id !== demo.id;
  const root = node.id === 'root';
  const type = element('div', 'node-type');
  type.innerHTML = icon(root ? 'map' : 'note') + (root ? 'Центральный узел' : 'Узел карты');
  body.append(type);
  const form = element('form');
  const title = element('input');
  title.value = node.title;
  title.maxLength = maxTitleLength;
  title.required = true;
  title.readOnly = !editable;
  const notes = element('textarea');
  notes.value = node.notes || '';
  notes.placeholder = 'Заметка в Markdown…';
  notes.maxLength = 2000;
  notes.readOnly = !editable;

  function addField(label, input) {
    const field = element('label', 'field', label);
    field.append(input);
    form.append(field);
  }
  addField('Название', title);
  addField('Заметки', notes);
  const preview = element('div', 'markdown-content notes-preview');
  preview.hidden = true;
  const previewButton = button('Предпросмотр Markdown', 'secondary', 'eye', () => {
    const showing = preview.hidden;
    preview.hidden = !showing;
    notes.hidden = showing;
    previewButton.lastChild.textContent = showing ? 'Исходный текст' : 'Предпросмотр Markdown';
    if (showing) {
      if (notes.value.trim()) renderMarkdown(preview, notes.value);
      else preview.textContent = 'Здесь появится предпросмотр заметки.';
    }
  });
  previewButton.classList.add('notes-preview-toggle');
  form.append(previewButton, preview);
  let color = node.color;
  form.append(nodeColorPalette(color, editable, value => {
    color = value;
    scheduleSave();
  }));
  body.append(form);

  if (!editable) {
    footer.append(element('p', null, 'Создайте копию, чтобы редактировать эту карту в своём пространстве.'));
    footer.append(button('Использовать пример', 'primary', 'copy', copyExample));
    return;
  }

  let baseline = { title: node.title, notes: node.notes || '', color: node.color };
  let timer;
  let saving = false;
  let activeSave;
  const values = () => {
    const patch = {};
    if (title.value.trim() !== baseline.title) patch.title = title.value.trim();
    if (notes.value !== baseline.notes) patch.notes = notes.value;
    if (color !== baseline.color) patch.color = color;
    return patch;
  };
  const dirty = () => Object.keys(values()).length > 0;
  const currentDraft = { nodeId: node.id, revision: displayed.revision, dirty, flush: saveChanges };
  draft = currentDraft;
  if (!root) {
    const actions = element('div', 'inspector-actions');
    actions.append(button('Переместить', 'secondary', null, showMove));
    form.append(actions);
  }
  function scheduleSave() {
    clearTimeout(timer);
    if (dirty()) setSync('Ожидает сохранения…');
    timer = setTimeout(saveChanges, 400);
  }
  async function saveChanges() {
    clearTimeout(timer);
    if (draft !== currentDraft || !dirty()) return;
    if (saving) { await activeSave; if (dirty()) return saveChanges(); return; }
    if (!title.value.trim()) {
      title.setCustomValidity('Название не может быть пустым');
      setSync('Укажите название узла', 'warn');
      return;
    }
    title.setCustomValidity('');
    if (busy) { timer = setTimeout(saveChanges, 150); return; }
    const patch = values();
    saving = true;
    activeSave = mutate('update_node', { nodeId: node.id, ...patch }, currentDraft.revision, false, true);
    const saved = await activeSave;
    saving = false;
    if (saved) {
      baseline = { ...baseline, ...patch };
      currentDraft.revision = map.revision;
      if (dirty()) scheduleSave();
      else updateSync();
    }
  }
  form.addEventListener('input', () => { title.setCustomValidity(''); scheduleSave(); });
  form.addEventListener('focusout', () => { if (dirty()) saveChanges(); });
  form.onsubmit = event => { event.preventDefault(); saveChanges(); };

  footer.append(root
    ? button('Удалить карту', 'danger', 'trash', showDeleteMap)
    : button('Удалить ветвь', 'danger', 'trash', showDeleteNode));
}

function selectNode(id, additive) {
  if (viewing) {
    const node = displayMap()?.nodes.find(item => item.id === id);
    if (!node) return;
    selection = [id];
    view.select(selection);
    details.show(node.title, node.notes, view.buttons.get(id));
    return;
  }
  if (additive) {
    const next = selection.includes(id) ? selection.filter(selected => selected !== id) : [...selection, id];
    if (selectNodes(next) && next.includes(id)) view.reveal(id);
    return;
  }
  if (selection.length === 1 && selection[0] === id) return;
  if (selectNodes([id])) view.reveal(id);
}

function toggleCollapse(id) {
  changeCollapse([id], 'toggle');
}

function childBranchesForSelection(nodes, ids) {
  const selected = new Set(ids);
  const parents = new Map(nodes.map(node => [node.id, node.parentId]));
  const kept = new Set();
  for (const id of selected) {
    for (let parent = id; parent && !kept.has(parent); parent = parents.get(parent)) kept.add(parent);
  }
  return nodes.filter(node => selected.has(node.parentId) && !kept.has(node.id)).map(node => node.id);
}

function updateRootActions() {
  const displayed = displayMap();
  const actions = $('root-actions');
  actions.hidden = viewing || !displayed || selection.length !== 1 || selection[0] !== 'root';
  if (actions.hidden) return;
  const collapsed = collapsedMaps.get(displayed.id);
  $('hide-all-nodes').disabled = !displayed.nodes.some(node => node.parentId === 'root' && !collapsed?.has(node.id));
  $('show-all-nodes').disabled = !displayed.nodes.some(node => collapsed?.has(node.id));
}

function changeCollapse(ids, operation = 'hide') {
  const displayed = displayMap();
  if (!displayed || busy || view.editingTitle || view.gestureActive || $('dialog').open) return;
  const collapsed = new Set(collapsedMaps.get(displayed.id));
  const changes = ids.filter(id => id !== 'root' && (operation === 'toggle' || collapsed.has(id) === (operation === 'show')));
  if (!changes.length) return;
  for (const id of changes) {
    if (operation === 'show' || (operation === 'toggle' && collapsed.has(id))) collapsed.delete(id);
    else collapsed.add(id);
  }
  const visible = new Set(visibleMapNodes(displayed.nodes, collapsed).map(node => node.id));
  const next = selection.filter(nodeId => visible.has(nodeId));
  if (next.length !== selection.length && !allowLeaving()) return;
  if (map && !viewing) recordHistory(historyForMap(true), historyState(false));
  if (selection.length && !next.length) {
    const parents = new Map(displayed.nodes.map(node => [node.id, node.parentId]));
    for (const id of selection) {
      let ancestor = parents.get(id);
      while (ancestor && !visible.has(ancestor)) ancestor = parents.get(ancestor);
      if (ancestor && !next.includes(ancestor)) next.push(ancestor);
    }
  }
  selection = next;
  collapsedMaps.set(displayed.id, collapsed);
  render({ fit: view.autoFit, preserveDraft: draft?.dirty() });
}

function updateAddButton() {
  $('add').disabled = selection.length !== 1;
  $('add').title = selection.length === 1 ? 'Добавить дочерний узел' : 'Выберите один узел';
}

function selectNodes(ids) {
  if (view.editingTitle) return false;
  if (draft?.dirty()) {
    const pending = draft;
    pending.flush().then(() => {
      if (draft === pending && !pending.dirty() && selectNodes(ids) && ids.length === 1) view.reveal(ids[0]);
    });
    return false;
  }
  if (busy) return false;
  selection = ids;
  view.select(selection);
  updateAddButton();
  renderInspector();
  return true;
}

function renameNode(id) {
  if (!map || viewing || !selectNodes([id])) return;
  let revision = map.revision;
  view.reveal(id);
  view.editTitle(id, async title => {
    const saved = await mutate('update_node', { nodeId: id, title }, revision);
    revision = map?.revision;
    if (saved) view.reveal(id);
    return saved;
  });
}

function allowLeaving() {
  if (!draft?.dirty()) return true;
  draft.flush();
  return false;
}

function showDialog({ title, description, glyph, fields, submit, action }) {
  if (busy) return;
  $('dialog-title').textContent = title;
  $('dialog-description').textContent = description;
  $('dialog-icon').innerHTML = icon(glyph);
  $('dialog-fields').replaceChildren(...(fields || []));
  $('dialog-error').hidden = true;
  $('dialog-submit').textContent = submit || 'Закрыть';
  $('dialog-cancel').hidden = !action;
  dialogAction = action;
  $('dialog-submit').autofocus = Boolean(action && !fields?.length);
  $('dialog').showModal();
}

function field(label, input) {
  const wrapper = element('label', 'field', label);
  wrapper.append(input);
  return wrapper;
}

function closeDialog() {
  if (!busy) $('dialog').close();
}

$('dialog-form').onsubmit = async event => {
  event.preventDefault();
  if (busy) return;
  if (!dialogAction) { closeDialog(); return; }
  $('dialog-submit').disabled = true;
  $('dialog-error').hidden = true;
  try {
    if (await dialogAction() !== false) closeDialog();
  } catch (error) {
    $('dialog-error').textContent = error.message;
    $('dialog-error').hidden = false;
  } finally {
    $('dialog-submit').disabled = false;
  }
};
$('dialog').addEventListener('cancel', event => { if (busy) event.preventDefault(); });
$('dialog-close').onclick = closeDialog;
$('dialog-cancel').onclick = closeDialog;

async function perform(action) {
  if (busy) return false;
  sequence++;
  busy = true;
  try {
    return await action();
  } finally {
    busy = false;
  }
}

function showLogin() {
  if (!allowLeaving()) return;
  const input = element('input');
  input.type = 'password';
  input.required = true;
  input.autocomplete = 'off';
  input.placeholder = 'Личный ключ доступа';
  input.maxLength = 512;
  input.autofocus = true;
  showDialog({
    title: 'Войти в MindMap Studio',
    description: 'Используйте ключ Slides для доступа к личным картам и MCP. Гостевые карты сохраняются отдельно в этом браузере.',
    glyph: 'lock', fields: [field('Ключ доступа', input)], submit: 'Войти',
    action: () => perform(async () => {
      const accessKey = input.value.trim();
      const user = await api('session', undefined, accessKey);
      const list = await api('maps', undefined, accessKey);
      const first = list.length ? await api('maps/' + list[0].id, undefined, accessKey) : null;
      key = accessKey;
      identity = user;
      mapHistories.clear();
      maps = list;
      map = first;
      selection = ['root'];
      input.value = '';
      render({ fit: true });
    })
  });
}

function signOut() {
  sequence++;
  key = '';
  identity = null;
  mapHistories.clear();
  maps = [];
  map = null;
  selection = ['root'];
  render({ fit: true });
  sync();
}

async function openMap(id) {
  if (!allowLeaving()) return;
  try {
    await perform(async () => {
      map = await runMapAction('get_map', { mapId: id });
      selection = ['root'];
      render({ fit: true });
    });
  } catch (error) { toast(error.message); }
}

function remember(updated) {
  const summary = { id: updated.id, title: updated.title, revision: updated.revision, nodeCount: updated.nodes.length };
  maps = [summary, ...maps.filter(item => item.id !== updated.id)];
}

function historyForMap(create = false) {
  if (!map) return undefined;
  let history = mapHistories.get(map.id);
  if (history && history.revision !== map.revision) {
    mapHistories.delete(map.id);
    history = undefined;
  }
  if (!history && create) {
    history = { revision: map.revision, undo: [], redo: [] };
    mapHistories.set(map.id, history);
  }
  return history;
}

function historyState(saved) {
  return {
    tree: saved ? { nodes: map.nodes, layout: map.layout ?? 'auto' } : null,
    collapsed: new Set(collapsedMaps.get(map.id)),
    selection: [...selection]
  };
}

function recordHistory(history, state) {
  history.revision = map.revision;
  history.undo.push(state);
  if (history.undo.length > historyLimit) history.undo.shift();
  history.redo.length = 0;
}

function updateHistoryButtons() {
  const history = historyForMap();
  $('history-controls').hidden = !map || viewing;
  $('undo').disabled = !history?.undo.length;
  $('redo').disabled = !history?.redo.length;
}

function stepHistory(direction) {
  if (!map || viewing || busy || view.editingTitle || view.gestureActive || $('dialog').open) return;
  const history = historyForMap();
  const entry = history?.[direction].at(-1);
  if (!entry || !allowLeaving()) return;
  const previous = historyState(Boolean(entry.tree));
  const id = map.id;
  perform(async () => {
    const oldLayout = map.layout ?? 'auto';
    try {
      if (entry.tree) {
        setSync('Сохранение…');
        map = await runMapAction('restore_map', { ...entry.tree, mapId: id, expectedRevision: history.revision });
        remember(map);
      }
      history.revision = map.revision;
      history[direction].pop();
      history[direction === 'undo' ? 'redo' : 'undo'].push(previous);
      collapsedMaps.set(id, new Set(entry.collapsed));
      selection = [...entry.selection];
      render({ fit: view.autoFit || oldLayout !== (map.layout ?? 'auto') });
    } catch (error) {
      if (error.status === 409) {
        mapHistories.delete(id);
        await reloadConflictingMap(id);
        updateHistoryButtons();
      }
      setSync('Изменение не сохранено', 'warn');
      toast(error.message);
    }
  });
}

function createMap(input) {
  return perform(async () => {
    map = await runMapAction('create_map', input);
    remember(map);
    selection = ['root'];
    render({ fit: true });
  });
}

async function copyExample() {
  try { await createMap(mapCreationFromExport(demo)); }
  catch (error) { toast(error.message); }
}

function showCreate() {
  if (viewing || !allowLeaving()) return;
  const input = titleInput('Например, План проекта');
  const example = button('Использовать пример', 'secondary', 'copy', async () => {
    if (busy) return;
    try { await createMap(mapCreationFromExport(demo)); closeDialog(); }
    catch (error) { $('dialog-error').textContent = error.message; $('dialog-error').hidden = false; }
  });
  example.style.marginTop = '12px';
  showDialog({
    title: 'Новая карта', description: 'Название станет центральным узлом карты.', glyph: 'map',
    fields: [field('Название карты', input), example], submit: 'Создать',
    action: () => createMap({ title: input.value })
  });
}

function titleInput(placeholder) {
  const input = element('input');
  input.required = true;
  input.maxLength = maxTitleLength;
  input.placeholder = placeholder;
  input.autofocus = true;
  return input;
}

function startAdd({ side, sibling = false } = {}) {
  if (busy || !map || viewing || view.editingTitle || view.gestureActive || selection.length !== 1 || !allowLeaving()) return;
  const selected = map.nodes.find(item => item.id === selection[0]);
  if (!selected || (sibling && selected.id === 'root')) return;
  const parent = sibling ? map.nodes.find(item => item.id === selected.parentId) : selected;
  let revision = map.revision;
  const placement = { parentId: parent.id };
  if (sibling) placement.afterId = selected.id;
  if (parent.id === 'root') {
    placement.side = sibling ? view.sideOf(selected.id) : side ?? view.freerRootSide();
  }
  view.createBranch(placement, async (title, offset) => {
    const position = map.layout === 'free' ? offset : undefined;
    const saved = await mutate('add_node', { ...placement, title, position }, revision);
    revision = map?.revision;
    return saved;
  });
}

function showMove() {
  if (!allowLeaving()) return;
  const node = map.nodes.find(item => item.id === selection[0]);
  const revision = map.revision;
  const select = element('select');
  const index = new Map(map.nodes.map(item => [item.id, item]));
  function isDescendant(item) {
    while (item) {
      if (item.id === node.id) return true;
      item = index.get(item.parentId);
    }
    return false;
  }
  for (const item of map.nodes.filter(item => !isDescendant(item))) {
    const option = element('option', null, item.title);
    option.value = item.id;
    option.selected = item.id === node.parentId;
    select.append(option);
  }
  showDialog({
    title: 'Переместить ветвь', description: 'Узел «' + node.title + '» и его потомки перейдут к новому родителю.',
    glyph: 'map', fields: [field('Новый родитель', select)], submit: 'Переместить',
    action: () => select.value === node.parentId || mutate('move_node', { nodeId: node.id, parentId: select.value }, revision, true)
  });
}

function moveBranch(nodeId, parentId, side, position) {
  if (busy || !map || viewing) return;
  const node = map.nodes.find(item => item.id === nodeId);
  if (!node || (!position && node.parentId === parentId && (!side || view.sideOf(nodeId) === side))) return;
  mutate('move_node', { nodeId, parentId, side, position }, map.revision);
}

function showDeleteNode() {
  if (busy || !map || viewing || view.editingTitle) return;
  const nodeIds = selection.filter(id => id !== 'root');
  if (!nodeIds.length || !allowLeaving()) return;
  const multiple = nodeIds.length > 1;
  const node = map.nodes.find(item => item.id === nodeIds[0]);
  const revision = map.revision;
  showDialog({
    title: multiple ? 'Удалить выбранные ветви?' : 'Удалить ветвь?',
    description: multiple ? 'Выбранные узлы и все их потомки будут удалены.'
      : 'Узел «' + node.title + '» и все его потомки будут удалены.',
    glyph: 'trash', submit: 'Удалить',
    action: () => mutate('delete_node', multiple ? { nodeIds } : { nodeId: node.id }, revision, true)
  });
}

function showDeleteMap() {
  if (!allowLeaving()) return;
  const revision = map.revision;
  showDialog({
    title: 'Удалить карту?', description: 'Карта «' + map.title + '» и все её узлы будут удалены.',
    glyph: 'trash', submit: 'Удалить',
    action: () => mutate('delete_map', {}, revision, true)
  });
}

async function reloadConflictingMap(id, preserveDraft = false) {
  try {
    map = await runMapAction('get_map', { mapId: id });
    remember(map);
    render({ preserveDraft });
    if (preserveDraft && draft) draft.revision = map.revision;
  } catch { /* Keep the current view and report the original error. */ }
}

async function mutate(action, fields, revision, inDialog = false, preserveDraft = false) {
  try {
    return await perform(async () => {
      const id = map.id;
      const history = action === 'delete_map' ? undefined : historyForMap(true);
      const previous = history && historyState(true);
      setSync('Сохранение…');
      try {
        const result = await runMapAction(action, { mapId: id, expectedRevision: revision, ...fields });
        if (action === 'delete_map') {
          collapsedMaps.delete(id);
          mapHistories.delete(id);
          maps = maps.filter(item => item.id !== id);
          map = null;
          selection = ['root'];
          if (maps.length) {
            try { map = await runMapAction('get_map', { mapId: maps[0].id }); }
            catch { /* The next sync reloads the remaining list. */ }
          }
        } else {
          if (action === 'add_node') {
            const previousIds = new Set(map.nodes.map(node => node.id));
            selection = [result.nodes.find(node => !previousIds.has(node.id)).id];
          }
          map = result;
          if (action === 'add_node' || action === 'move_node') {
            const collapsed = collapsedMaps.get(id);
            if (collapsed?.size) {
              for (let parent = fields.parentId; parent;) {
                collapsed.delete(parent);
                parent = result.nodes.find(node => node.id === parent)?.parentId;
              }
            }
          }
          remember(map);
          recordHistory(history, previous);
        }
        render({ fit: action === 'delete_map' || action === 'set_layout', preserveDraft });
        if (action === 'add_node' || (action === 'move_node' && !fields.position)) view.reveal(selection[0]);
        return true;
      } catch (error) {
        if (error.status === 409) {
          await reloadConflictingMap(id, action === 'update_node' && draft?.dirty());
        }
        setSync('Изменение не сохранено', 'warn');
        throw error;
      }
    });
  } catch (error) {
    if (inDialog) throw error;
    toast(error.message);
    return false;
  }
}

async function sync() {
  const paused = () => busy || view.editingTitle || view.gestureActive || $('dialog').open;
  if (polling || document.hidden || paused()) return;
  const marker = sequence;
  polling = true;
  try {
    const list = await runMapAction('list_maps');
    if (marker !== sequence || paused()) return;
    const current = list.find(item => item.id === map?.id);
    const next = current || list[0];
    const changed = !current || current.revision !== map?.revision;
    const nextMap = next && changed ? await runMapAction('get_map', { mapId: next.id }) : map;
    if (marker !== sequence || paused()) return;
    const replace = !list.length ? Boolean(map) : changed;
    const sameMap = nextMap?.id === map?.id;
    const changedList = JSON.stringify(maps) !== JSON.stringify(list);
    maps = list;
    if (replace) {
      map = list.length ? nextMap : null;
      if (!sameMap || !list.length) selection = ['root'];
      render({ fit: !sameMap || !list.length, preserveDraft: sameMap && draft?.dirty() });
    } else if (changedList) {
      renderRail();
    }
    if (!draft?.dirty()) updateSync();
  } catch (error) {
    if (marker !== sequence || paused()) return;
    if (error.status === 401) { signOut(); toast('Срок доступа истёк. Войдите снова.'); }
    else setSync('Нет синхронизации', 'warn');
  } finally {
    polling = false;
  }
}

function showImport() {
  if (viewing || !allowLeaving()) return;
  const input = element('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.required = true;
  showDialog({
    title: 'Импорт карты из JSON', description: 'Выберите файл экспорта MindMap Studio. Карта откроется как отдельная копия.',
    glyph: 'upload', fields: [field('Файл карты', input)], submit: 'Импортировать',
    action: async () => {
      const file = input.files[0];
      if (file.size > 2 * 1024 * 1024) throw new AppError('Файл слишком большой. Максимальный размер — 2 МБ.');
      const text = await file.text();
      let document;
      try { document = JSON.parse(text); } catch { throw new AppError('Файл содержит некорректный JSON'); }
      if (await createMap(mapCreationFromExport(document)) !== false) toast('Карта импортирована');
    }
  });
}

function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#1e1e1e' : '#f5f5f5';
  const theme = $('theme');
  const label = dark ? 'Светлая тема' : 'Тёмная тема';
  theme.setAttribute('aria-pressed', String(dark));
  theme.setAttribute('aria-label', label);
  theme.title = label;
  theme.innerHTML = icon(dark ? 'sun' : 'moon');
}

function exportMap() {
  const displayed = displayMap();
  if (!displayed) return;
  const choices = [
    { format: 'html', title: 'HTML для просмотра', description: 'Открывается в браузере без MindMap и интернета.' },
    { format: 'json', title: 'JSON для импорта', description: 'Позволяет снова открыть карту в редакторе.' }
  ].map(({ format, title, description }) => {
    const input = element('input');
    input.type = 'radio';
    input.name = 'export-format';
    input.value = format;
    input.checked = format === 'html';
    input.autofocus = input.checked;
    const label = element('label', 'export-option');
    const caption = element('span');
    caption.append(element('strong', null, title), element('small', null, description));
    label.append(input, caption);
    return label;
  });
  showDialog({
    title: 'Экспорт карты', description: 'Выберите формат файла.',
    glyph: 'download', fields: choices, submit: 'Скачать',
    action: () => downloadMap(displayed, $('dialog-form').elements.namedItem('export-format').value)
  });
}

function downloadMap(map, format) {
  const html = format === 'html';
  const content = html ? view.toStandaloneHtml(map.title) : JSON.stringify(map, null, 2);
  const url = URL.createObjectURL(new Blob([content], { type: html ? 'text/html;charset=utf-8' : 'application/json' }));
  const link = element('a');
  link.href = url;
  link.download = Array.from(map.title.replace(/[<>:"/\\|?*]/g, '-')).slice(0, 100).join('') + '.' + format;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Карта выгружена в ' + format.toUpperCase());
}

function showMcp() {
  const endpoint = element('input');
  endpoint.value = location.origin + '/mcp';
  endpoint.readOnly = true;
  const copy = button('Копировать адрес', 'secondary', 'copy', async () => {
    try { await navigator.clipboard.writeText(endpoint.value); toast('Адрес MCP скопирован'); }
    catch { endpoint.select(); }
  });
  copy.style.marginTop = '10px';
  showDialog({
    title: 'MCP-интеграция', description: 'Добавьте этот адрес в MCP-клиент как Streamable HTTP. Для Authorization используйте Bearer и свой личный ключ Slides.',
    glyph: 'plug', fields: [field('Адрес сервера', endpoint), copy]
  });
}

function showHelp() {
  const list = element('ul', 'help-list');
  list.innerHTML = '<li>Протяните рамку левой кнопкой по фону для выделения. <kbd>Del</kbd> удаляет выбранные ветви после подтверждения.</li><li>Удерживайте <kbd>Пробел</kbd> и двигайте мышь или перетаскивайте холст зажатым колёсиком.</li><li>Включите «Тачпад» в панели холста, чтобы двигать карту двумя пальцами и менять масштаб щипком.</li><li>В режиме «Свободно» перетащите ветвь на пустое место, чтобы изменить её положение. Перетащите ветвь на другой узел, чтобы сменить её родителя.</li><li>В обычном режиме колесо меняет масштаб. Кнопки <kbd>+</kbd> <kbd>−</kbd> доступны в обоих режимах, <kbd>0</kbd> показывает всю карту.</li><li>Двойной щелчок или <kbd>F2</kbd> открывает название. <kbd>Enter</kbd> сохраняет, <kbd>Esc</kbd> отменяет.</li>';
  showDialog({ title: 'Управление холстом', description: 'Быстрые действия для работы с картой.', glyph: 'help', fields: [list] });
}

function showWheelSettings() {
  const mouseAction = element('select');
  for (const [value, label] of Object.entries({ zoom: 'Зум', pan: 'Перемещение' })) {
    const option = element('option', null, label);
    option.value = value;
    mouseAction.append(option);
  }
  mouseAction.value = view.wheelSettings.mouse.action;
  mouseAction.autofocus = true;

  const profiles = Object.entries({ mouse: 'Мышь', trackpad: 'Тачпад' }).map(([profile, title]) => {
    const group = element('fieldset', 'sensitivity-profile');
    group.append(element('legend', null, title));
    if (profile === 'mouse') group.append(field('Действие колеса', mouseAction));

    const sliders = Object.entries({ zoom: 'Зум', pan: 'Перемещение' }).map(([kind, label]) => {
      const input = element('input');
      input.type = 'range';
      input.min = minWheelSensitivity;
      input.max = maxWheelSensitivity;
      input.step = 5;
      input.value = view.wheelSettings[profile][kind];

      const wrapper = field(label, input);
      wrapper.classList.add('sensitivity-field');
      const value = element('span', 'sensitivity-value');
      value.setAttribute('aria-hidden', 'true');
      wrapper.insertBefore(value, input);
      const update = () => {
        value.textContent = input.value + '%';
        input.setAttribute('aria-valuetext', value.textContent);
      };
      input.oninput = update;
      update();
      group.append(wrapper);
      return { kind, input };
    });
    return { profile, group, sliders };
  });

  showDialog({
    title: 'Чувствительность колёсика',
    description: '100% — исходная скорость. Профиль «Тачпад» действует при включённом режиме на холсте. Ctrl + колесо меняет масштаб.',
    glyph: 'sliders',
    fields: profiles.map(({ group }) => group),
    submit: 'Сохранить',
    action: () => {
      for (const { profile, sliders } of profiles) {
        for (const { kind, input } of sliders) view.wheelSettings[profile][kind] = input.valueAsNumber;
      }
      view.wheelSettings.mouse.action = mouseAction.value;
      try { browserStorage?.setItem(wheelSensitivityKey, JSON.stringify(view.wheelSettings)); } catch { /* Keep the current values. */ }
    }
  });
}

$('create').onclick = showCreate;
$('empty-create').onclick = showCreate;
$('account').onclick = () => {
  if (!identity) showLogin();
  else if (!busy && allowLeaving()) signOut();
};
$('import').onclick = showImport;
$('view-mode').onclick = () => {
  if (busy || !allowLeaving()) return;
  viewing = !viewing;
  $('inspector').classList.remove('open');
  if (!viewing) details.hide();
  render({ fit: true });
};
textStyle = browserStorage?.getItem(nodeStyleKey) === 'text';
$('node-style').onclick = () => {
  if (busy || view.editingTitle) return;
  textStyle = !textStyle;
  try { browserStorage?.setItem(nodeStyleKey, textStyle ? 'text' : 'cards'); } catch { /* Keep the current style. */ }
  render({ fit: true, preserveDraft: draft?.dirty() });
};
$('layout-mode').onclick = () => {
  if (busy || !map || viewing || view.editingTitle || view.gestureActive || !allowLeaving()) return;
  const layout = map.layout === 'free' ? 'auto' : 'free';
  const positions = layout === 'free' ? view.initialBranchPositions() : undefined;
  mutate('set_layout', { layout, positions }, map.revision);
};
const preferredTheme = browserStorage?.getItem(themeKey);
applyTheme(preferredTheme ? preferredTheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
$('theme').onclick = () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  applyTheme(dark);
  try { browserStorage?.setItem(themeKey, dark ? 'dark' : 'light'); } catch { /* Keep the current theme. */ }
};
const trackpad = $('trackpad');
view.trackpadMode = browserStorage?.getItem(trackpadKey) === 'on';
trackpad.setAttribute('aria-pressed', String(view.trackpadMode));
trackpad.onclick = () => {
  view.trackpadMode = !view.trackpadMode;
  trackpad.setAttribute('aria-pressed', String(view.trackpadMode));
  try { browserStorage?.setItem(trackpadKey, view.trackpadMode ? 'on' : 'off'); } catch { /* Keep the current mode. */ }
};
try {
  const saved = JSON.parse(browserStorage?.getItem(wheelSensitivityKey) ?? 'null');
  for (const [profile, settings] of Object.entries(view.wheelSettings)) {
    for (const kind of ['zoom', 'pan']) {
      const value = saved?.[profile]?.[kind];
      if (Number.isInteger(value) && value >= minWheelSensitivity && value <= maxWheelSensitivity) {
        settings[kind] = value;
      }
    }
  }
  if (saved?.mouse?.action === 'pan') view.wheelSettings.mouse.action = 'pan';
} catch { /* Keep the defaults. */ }
$('wheel-settings').onclick = showWheelSettings;
$('add').onclick = () => startAdd();
$('add').setAttribute('aria-label', 'Добавить узел');
$('undo').onclick = () => stepHistory('undo');
$('redo').onclick = () => stepHistory('redo');
$('hide-all-nodes').onclick = () => {
  const nodes = displayMap()?.nodes ?? [];
  changeCollapse(nodes.filter(node => node.parentId === 'root').map(node => node.id));
};
$('show-all-nodes').onclick = () => changeCollapse([...(collapsedMaps.get(displayMap()?.id) ?? [])], 'show');
$('export').onclick = exportMap;
$('export').setAttribute('aria-label', 'Экспорт карты');
$('mcp-info').onclick = showMcp;
$('help').onclick = showHelp;
$('toggle-maps').onclick = () => document.querySelector('.sidebar').classList.toggle('open');
$('toggle-inspector').onclick = () => $('inspector').classList.toggle('open');
$('close-inspector').onclick = () => $('inspector').classList.remove('open');
document.addEventListener('visibilitychange', sync);
window.addEventListener('storage', event => {
  if (!identity && (event.key === guestKey || event.key === null)) sync();
});
window.addEventListener('beforeunload', event => {
  if (draft?.dirty() || view.hasUnsavedTitle) event.preventDefault();
});
window.addEventListener('keydown', event => {
  if (event.repeat || event.defaultPrevented || $('dialog').open ||
      event.target.closest?.('input, textarea, select, [contenteditable]') ||
      !map || viewing || view.gestureActive || view.editingTitle) return;
  if (event.key === 'Delete' && selection.some(id => id !== 'root')) {
    event.preventDefault();
    showDeleteNode();
  } else if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
    const key = event.key.toLowerCase();
    if (key === 'z' || key === 'y' || event.code === 'KeyZ' || event.code === 'KeyY') {
      event.preventDefault();
      stepHistory(key === 'y' || event.code === 'KeyY' ? 'redo' : 'undo');
    }
  }
});
setInterval(sync, 2500);
render({ fit: true });
sync();

// The editor width is constrained to leave room for the map.
{
  const area = document.querySelector('.work-area');
  const panel = $('inspector');
  const handle = panel.querySelector('.inspector-resize');
  let preferred = 278;
  let drag;
  function resize(width, remember = false) {
    const reserve = matchMedia('(max-width: 860px)').matches ? 24 : 320;
    const max = Math.max(1, Math.min(760, area.clientWidth - reserve));
    const min = Math.min(220, max);
    const actual = Math.round(Math.max(min, Math.min(max, width)));
    if (remember) preferred = actual;
    area.style.setProperty('--inspector-width', actual + 'px');
    handle.setAttribute('aria-valuemin', min);
    handle.setAttribute('aria-valuemax', max);
    handle.setAttribute('aria-valuenow', actual);
  }
  handle.addEventListener('pointerdown', event => {
    if (drag || event.button !== 0) return;
    event.preventDefault();
    handle.focus({ preventScroll: true });
    handle.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, width: panel.getBoundingClientRect().width };
  });
  handle.addEventListener('pointermove', event => {
    if (drag?.id === event.pointerId) resize(drag.width + drag.x - event.clientX, true);
  });
  handle.addEventListener('lostpointercapture', () => { drag = undefined; });
  handle.addEventListener('keydown', event => {
    const width = panel.getBoundingClientRect().width;
    if (event.key === 'ArrowLeft') resize(width + 24, true);
    else if (event.key === 'ArrowRight') resize(width - 24, true);
    else if (event.key === 'Home') resize(0, true);
    else if (event.key === 'End') resize(Infinity, true);
    else return;
    event.preventDefault();
  });
  new ResizeObserver(() => resize(preferred)).observe(area);
  resize(preferred);
}
