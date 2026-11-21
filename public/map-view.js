import { icon } from './icons.js';
import { AppError, maxTitleLength, movedBranchNodes, rootBranches } from './map-model.js';
import MarkdownIt from './markdown-it.min.js';

const markdown = new MarkdownIt({ html: false, breaks: true }).disable('image');
markdown.validateLink = url => /^(?:https?:\/\/|mailto:|#)/i.test(url);
markdown.renderer.rules.link_open = (tokens, index, options, _, renderer) => {
  tokens[index].attrSet('target', '_blank');
  tokens[index].attrSet('rel', 'noopener noreferrer');
  return renderer.renderToken(tokens, index, options);
};

export function renderMarkdown(target, content) {
  target.innerHTML = markdown.render(content);
}

export function setColor(element, color) {
  element.style.setProperty('--branch', 'var(--' + color + ')');
  element.style.setProperty('--branch-bg', 'var(--' + color + '-bg, color-mix(in srgb, var(--branch) 18%, var(--surface)))');
}

export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const detailsMarkup = `
  <aside id="node-details" class="details-panel" aria-label="Детали узла" hidden>
    <div class="details-resize" role="separator" aria-controls="node-details" aria-orientation="vertical" aria-label="Ширина панели деталей" tabindex="0"></div>
    <div class="inspector-header">
      <span>${icon('note')}</span><h2>Детали узла</h2>
      <button type="button" class="icon-button details-close" aria-label="Закрыть детали" title="Закрыть детали">${icon('x')}</button>
    </div>
    <div class="details-body">
      <h3 class="details-title"></h3>
      <div class="details-notes markdown-content"></div>
    </div>
  </aside>
`;

export function mountDetailsPanel(workArea) {
  workArea.insertAdjacentHTML('beforeend', detailsMarkup);
  return bindDetailsPanel(workArea, renderMarkdown);
}

function bindDetailsPanel(workArea, renderNotes) {
  const panel = workArea.querySelector('.details-panel');
  const handle = panel.querySelector('.details-resize');
  const body = panel.querySelector('.details-body');
  const title = panel.querySelector('.details-title');
  const notes = panel.querySelector('.details-notes');
  let preferred = 320;
  let opener;
  let drag;
  let previousContent;

  function resize(width, remember = false) {
    const reserve = matchMedia('(max-width: 860px)').matches ? 24 : 360;
    const max = Math.max(1, Math.min(760, workArea.clientWidth - reserve));
    const min = Math.min(240, max);
    const actual = Math.round(Math.max(min, Math.min(max, width)));
    if (remember) preferred = actual;
    panel.style.width = actual + 'px';
    handle.setAttribute('aria-valuemin', min);
    handle.setAttribute('aria-valuemax', max);
    handle.setAttribute('aria-valuenow', actual);
  }

  function hide() {
    panel.hidden = true;
    workArea.classList.remove('details-open');
  }

  function dismiss() {
    hide();
    opener?.focus({ preventScroll: true });
  }

  function update(name, content, trigger) {
    if (panel.hidden) return;
    if (title.textContent !== name || previousContent !== content) {
      body.scrollTop = 0;
      if (content?.trim()) renderNotes(notes, content);
      else notes.textContent = 'У этого узла пока нет заметок.';
      previousContent = content;
    }
    title.textContent = name;
    opener = trigger;
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
  panel.querySelector('.details-close').onclick = dismiss;
  workArea.addEventListener('keydown', event => {
    if (!panel.hidden && event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      dismiss();
    }
  });
  new ResizeObserver(() => { if (!panel.hidden) resize(preferred); }).observe(workArea);

  return {
    hide,
    update,
    show(name, content, trigger) {
      panel.hidden = false;
      workArea.classList.add('details-open');
      resize(preferred);
      update(name, content, trigger);
    }
  };
}

const branchGap = 62;
const rootColumnGap = 66;
const columnGap = 56;
const controlGap = 4;
const controlSize = 18;
const branchAddGap = 12;
const siblingAddGap = 16;
const branchControlSize = 16;
const branchButtonBaseSize = 24;
const branchButtonMinSize = 20;
const branchButtonMaxSize = 34;
const branchButtonMinZoom = .5;
const branchDotMinZoom = .35;

function branchButtonSize(scale) {
  return Math.min(branchButtonMaxSize, Math.max(branchButtonMinSize, branchButtonBaseSize * scale));
}

function transformStage(stage, x, y, scale) {
  stage.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
  stage.classList.toggle('hide-fold-buttons', scale < branchButtonMinZoom);
  stage.classList.toggle('hide-fold-dots', !branchDotsVisible(scale));
  stage.style.setProperty('--branch-button-scale', branchButtonSize(scale) / (branchControlSize * scale));
  stage.style.setProperty('--fold-dot-scale', branchDotScale(scale));
  stage.style.setProperty('--fold-dot-glyph-scale', 1 + (1 - Math.min(1, Math.max(branchDotMinZoom, scale))) / 2);
}

function branchDotScale(scale) {
  return 1 / Math.min(1, Math.max(branchDotMinZoom, scale));
}

function branchDotsVisible(scale) {
  return scale >= branchDotMinZoom - Number.EPSILON;
}

function foldedControlBounds({ branchControl, dotOffset }, scale) {
  const factor = branchDotScale(scale);
  return {
    x: branchControl.x + dotOffset.x * (factor - 1),
    y: branchControl.y + dotOffset.y * (factor - 1),
    width: branchControl.width * factor,
    height: branchControl.height * factor
  };
}

function layout(nodes, sizes) {
  const children = new Map();
  for (const node of nodes) {
    if (!children.has(node.parentId)) children.set(node.parentId, []);
    children.get(node.parentId).push(node);
  }

  const gap = 30;
  const root = { node: nodes[0], x: 0, y: 0, ...sizes.get('root'), depth: 0 };
  const positions = [root];
  const groupHeight = (items, spacing) =>
    items.reduce((sum, item, index) => sum + item.span + (index ? spacing : 0), 0);

  function measure(node, depth, columns) {
    const { width, height } = sizes.get(node.id);
    columns[depth] = Math.max(columns[depth] || 0, width);
    const items = (children.get(node.id) || []).map(child => measure(child, depth + 1, columns));
    return { node, depth, height, width, items, span: Math.max(height, groupHeight(items, gap)) };
  }

  function place(parent, items, direction, spacing, edges) {
    let y = parent.y - groupHeight(items, spacing) / 2;
    for (const item of items) {
      const position = {
        ...item, parent,
        x: direction * (edges[item.depth] + item.width / 2),
        y: y + item.span / 2
      };
      positions.push(position);
      place(position, item.items, direction, gap, edges);
      y += item.span + spacing;
    }
  }

  const sides = { left: [], right: [] };
  const columns = { left: [], right: [] };
  for (const { node, side } of rootBranches(nodes)) {
    sides[side].push(measure(node, 1, columns[side]));
  }
  for (const [side, items] of Object.entries(sides)) {
    const edges = [0, root.width / 2 + rootColumnGap];
    for (let depth = 2; depth < columns[side].length; depth++) {
      edges[depth] = edges[depth - 1] + columns[side][depth - 1] + columnGap;
    }
    place(root, items, side === 'left' ? -1 : 1, branchGap, edges);
  }
  return positions;
}

function measureNodes(buttons) {
  return new Map([...buttons].map(([id, button]) => [id, button.classList.contains('branch-toggle')
    ? { width: branchControlSize, height: branchControlSize }
    : { width: button.offsetWidth, height: button.offsetHeight }]));
}

function measureNodeStyles(layer, buttons, cards) {
  const sizes = measureNodes(buttons);
  if (!cards) return { sizes };
  const canvas = layer.closest('.canvas');
  canvas.classList.add('text-style');
  const textSizes = measureNodes(buttons);
  canvas.classList.remove('text-style');
  return { sizes, textSizes };
}

function mapNodeButton(node) {
  const button = element('button', 'node' + (node.id === 'root' ? ' root' : node.parentId === 'root' ? ' branch' : ''));
  button.type = 'button';
  button.dataset.nodeId = node.id;
  button.title = node.title;
  setColor(button, node.color);
  button.append(element('span', 'node-dot'), element('span', 'node-text', node.title));
  if (node.linkedMapId) {
    const link = element('span', 'node-link');
    link.title = 'Открыть связанную карту';
    link.innerHTML = icon('external');
    button.append(link);
  }
  if (node.notes) {
    const note = element('span', 'node-note');
    note.innerHTML = icon('note');
    button.append(note);
  }
  return button;
}

function placeFree(positions) {
  const placed = new Map();
  return positions.map(position => {
    const parent = position.parent && placed.get(position.parent.node.id);
    const offset = parent && (position.node.position ?? { x: position.x - position.parent.x, y: position.y - position.parent.y });
    const item = parent ? { ...position, parent, x: parent.x + offset.x, y: parent.y + offset.y } : position;
    placed.set(item.node.id, item);
    return item;
  });
}

function freeLayout(nodes, { sizes, textSizes }, visible) {
  const positions = placeFree(layout(nodes, sizes));
  if (!textSizes) return positions;

  // Use the text layout to preserve the side and order of each group of branches.
  const references = new Map(placeFree(layout(nodes, textSizes)).map(position => [position.node.id, position]));
  const groups = new Map();
  for (const position of positions.slice(1)) {
    const reference = references.get(position.node.id);
    const { vertical, direction } = connectionGeometry(reference.parent, reference, true);
    const id = position.parent.node.id + ':' + vertical + ':' + direction;
    if (!groups.has(id)) groups.set(id, { vertical, direction, depth: position.depth, items: [] });
    groups.get(id).items.push(position);
  }

  const root = positions[0];
  const placed = new Map([[root.node.id, root]]);
  const occupied = [root];
  for (const { vertical, direction, items } of [...groups.values()].sort((a, b) => a.depth - b.depth)) {
    const crossAxis = vertical ? 'x' : 'y';
    items.sort((a, b) => references.get(a.node.id)[crossAxis] - references.get(b.node.id)[crossAxis]);
    let previous;
    let previousCross;
    for (const position of items) {
      const parent = placed.get(position.parent.node.id);
      let item = {
        ...position, parent, vertical,
        x: parent.x + (position.x - position.parent.x),
        y: parent.y + (position.y - position.parent.y)
      };
      if (visible.has(item.node.id)) {
        const referenceCross = references.get(item.node.id)[crossAxis];
        const crossLimit = previous ? previous[crossAxis] + Math.min(12, referenceCross - previousCross) : -Infinity;
        item = clearCardPosition(item, occupied, direction, crossLimit);
        occupied.push(item);
        previous = item;
        previousCross = referenceCross;
      }
      placed.set(item.node.id, item);
    }
  }
  return positions.map(position => placed.get(position.node.id));
}

function clearCardPosition(item, occupied, direction, crossLimit = -Infinity) {
  const gap = 20;
  const { parent, vertical } = item;
  const axis = vertical ? 'y' : 'x';
  const crossAxis = vertical ? 'x' : 'y';
  const size = vertical ? 'height' : 'width';
  const edge = parent[axis] + direction * ((item[size] + parent[size]) / 2 + gap);
  item[axis] = direction * Math.max(direction * item[axis], direction * edge);
  item[crossAxis] = Math.max(item[crossAxis], crossLimit);

  const nextCross = clearAxis(crossAxis, crossLimit, Infinity);
  if (nextCross === item[crossAxis]) return item;
  const nextAlong = direction > 0 ? clearAxis(axis, edge, Infinity) : clearAxis(axis, -Infinity, edge);
  if (Math.abs(nextCross - item[crossAxis]) <= Math.abs(nextAlong - item[axis])) item[crossAxis] = nextCross;
  else item[axis] = nextAlong;
  return item;

  function clearAxis(axisToClear, min, max) {
    const { x, y, width, height } = item;
    if (axisToClear === 'y') return freeMarkerY(occupied, { x: x - width / 2, y, width, height }, min, max, gap);
    const rotated = occupied.map(card => ({ x: card.y, y: card.x, width: card.height, height: card.width }));
    return freeMarkerY(rotated, { x: y - height / 2, y: x, width: height, height: width }, min, max, gap);
  }
}

function connectionGeometry(parent, child, free) {
  const dx = child.x - parent.x;
  const dy = child.y - parent.y;
  const vertical = child.vertical ?? (free &&
    Math.abs(dx) < (parent.width + child.width) / 2 && Math.abs(dy) >= (parent.height + child.height) / 2);
  const direction = Math.sign(vertical ? dy : dx) || 1;
  const startX = parent.x + (vertical ? 0 : direction * parent.width / 2);
  const startY = parent.y + (vertical ? direction * parent.height / 2 : 0);
  const endX = child.x - (vertical ? 0 : direction * child.width / 2);
  const endY = child.y - (vertical ? direction * child.height / 2 : 0);
  const x = (startX + endX) / 2;
  const y = (startY + endY) / 2;
  const handles = vertical ? startX + ' ' + y + ', ' + endX + ' ' + y : x + ' ' + startY + ', ' + x + ' ' + endY;
  const path = 'M ' + startX + ' ' + startY + ' C ' + handles + ', ' + endX + ' ' + endY;
  return { path, x, y, startX, startY, direction, vertical };
}

export function visibleMapNodes(nodes, collapsed) {
  const parents = new Map(nodes.map(node => [node.id, node.parentId]));
  return nodes.filter(node => {
    for (let id = node.id; id && id !== 'root'; id = parents.get(id)) {
      if (collapsed.has(id)) return false;
    }
    return true;
  });
}

function drawTree(layer, connections, nodes, buttons, collapsed, toggleCollapse, free, cards) {
  const visible = new Set(visibleMapNodes(nodes, collapsed).map(node => node.id));
  const entries = nodes.filter(node => node.id === 'root' || visible.has(node.parentId));
  const items = new Map();
  const controls = new Map();
  for (const node of entries) {
    if (visible.has(node.id)) items.set(node.id, buttons.get(node.id));
    if (node.id === 'root') continue;

    const expanded = visible.has(node.id);
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'branch-toggle';
    control.dataset.collapseId = node.id;
    control.dataset.parentId = node.parentId;
    control.hidden = expanded;
    const label = (expanded ? 'Свернуть ветвь «' : 'Развернуть ветвь «') + node.title + '»';
    control.setAttribute('aria-expanded', String(expanded));
    control.setAttribute('aria-label', label);
    control.title = label;
    setColor(control, node.color);
    control.onclick = () => toggleCollapse(node.id);
    controls.set(node.id, control);
    if (!expanded) items.set(node.id, control);
  }

  let positions = [];
  let measurements;
  if (free) {
    layer.replaceChildren(...buttons.values());
    measurements = measureNodeStyles(layer, buttons, cards);
    if (nodes.length) positions = freeLayout(nodes, measurements, visible).filter(({ node }) => items.has(node.id));
  }
  layer.replaceChildren(...items.values());
  if (!free && entries.length) positions = layout(entries, measureNodes(items));
  const paths = [];
  const foldedGroups = new Map();
  for (const position of positions) {
    const { node, parent, x, y, width, height } = position;
    const item = items.get(node.id);
    const expanded = visible.has(node.id);
    if (expanded) {
      item.style.left = (x - width / 2) + 'px';
      item.style.top = (y - height / 2) + 'px';
    }
    if (!parent) continue;

    const geometry = connectionGeometry(parent, position, free);
    const control = controls.get(node.id);
    if (!expanded) {
      const { direction, vertical, startX, startY } = geometry;
      const groupId = parent.node.id + ':' + vertical + ':' + direction;
      if (!foldedGroups.has(groupId)) foldedGroups.set(groupId, []);
      foldedGroups.get(groupId).push({
        position, vertical, direction,
        x: startX + (vertical ? 0 : direction * 11),
        y: startY + (vertical ? direction * 11 : 0)
      });
      continue;
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'connection');
    path.setAttribute('d', geometry.path);
    setColor(path, node.color);
    paths.push(path);

    placeControl(position, control, geometry.x, geometry.y);
    item.before(control);
  }
  for (const group of foldedGroups.values()) {
    const axis = group[0].vertical ? 'x' : 'y';
    const averageDelta = group.reduce((sum, { position }) => sum + position[axis] - position.parent[axis], 0) / group.length;
    const offset = Math.max(-12, Math.min(12, averageDelta / 3));
    group.sort((a, b) => a.position[axis] - b.position[axis]);
    group.forEach(({ position, x, y, vertical, direction }, index) => {
      const spread = (index - (group.length - 1) / 2) * (branchControlSize + 2);
      const shift = offset + spread;
      position.folded = true;
      const outward = direction * branchControlSize / 2;
      position.dotOffset = { x: vertical ? spread : outward, y: vertical ? outward : spread };
      const control = controls.get(position.node.id);
      control.style.setProperty('--fold-dot-x', position.dotOffset.x + 'px');
      control.style.setProperty('--fold-dot-y', position.dotOffset.y + 'px');
      placeControl(position, control, x + (vertical ? shift : 0), y + (vertical ? 0 : shift));
    });
  }
  connections.replaceChildren(...paths);
  return { positions, measurements };

  function placeControl(position, control, x, y) {
    position.branchControl = { x, y, width: branchControlSize, height: branchControlSize };
    control.style.left = x + 'px';
    control.style.top = y + 'px';
  }
}

function showBranchControls(layer, selectedId) {
  for (const control of layer.querySelectorAll('.branch-toggle[aria-expanded="true"]')) {
    control.hidden = control.dataset.parentId !== selectedId;
  }
}

function branchControlFocus(layer, buttons, id) {
  const control = layer.querySelector('[data-collapse-id="' + id + '"]');
  return control && !control.getClientRects().length ? buttons.get(id) : control;
}

function freeMarkerY(positions, { x, y, width, height }, minY = -Infinity, maxY = Infinity, padding = 4) {
  const occupied = positions.filter(node =>
    node.x + node.width / 2 + padding > x && node.x - node.width / 2 - padding < x + width)
    .map(node => {
      const clearance = (node.height + height) / 2 + padding;
      return [node.y - clearance, node.y + clearance];
    })
    .sort((a, b) => a[0] - b[0]);

  let below = y;
  for (const [start, end] of occupied) {
    if (below > start && below < end) below = end;
  }
  let above = y;
  for (const [start, end] of occupied.reverse()) {
    if (above > start && above < end) above = start;
  }
  if (above < minY && below <= maxY) return below;
  if (below > maxY && above >= minY) return above;
  return y - above < below - y ? above : below;
}

function layoutBounds(positions) {
  const items = positions.map(position => position.folded ? position.branchControl : position);
  return {
    x1: Math.min(...items.map(item => item.x - item.width / 2)),
    x2: Math.max(...items.map(item => item.x + item.width / 2)),
    y1: Math.min(...items.map(item => item.y - item.height / 2)),
    y2: Math.max(...items.map(item => item.y + item.height / 2))
  };
}

export class MapView {
  x = 0;
  y = 0;
  scale = 1;
  autoFit = true;
  overview = false;
  trackpadMode = false;
  wheelSettings = {
    mouse: { action: 'zoom', zoom: 100, pan: 100 },
    trackpad: { zoom: 100, pan: 100 }
  };
  positions = [];
  layoutPositions = [];
  selection = [];

  constructor(canvas, { onSelect, onOpenLink, onAdd, onMarquee, onRename, onBranchStart, onBranchDrop, onCollapse }) {
    this.canvas = canvas;
    this.stage = canvas.querySelector('#stage');
    this.connections = canvas.querySelector('#connections');
    this.nodes = canvas.querySelector('#nodes');
    this.previewLayer = this.stage.appendChild(this.connections.ownerSVGElement.cloneNode(false));
    this.previewLayer.classList.add('branch-preview');
    this.previewLayer.setAttribute('hidden', '');
    const svg = this.previewLayer.namespaceURI;
    this.previewArrow = this.previewLayer.appendChild(document.createElementNS(svg, 'path'));
    this.previewArrow.setAttribute('class', 'branch-preview-arrow');
    this.previewMarker = this.previewLayer.appendChild(document.createElementNS(svg, 'rect'));
    this.previewMarker.setAttribute('class', 'branch-preview-marker');
    this.previewMarker.setAttribute('rx', '6');
    this.previewBranch = this.previewLayer.appendChild(document.createElementNS(svg, 'g'));
    this.previewBranch.classList.add('free-preview');
    this.controls = element('div', 'node-controls');
    this.level = canvas.querySelector('#zoom-level');
    this.onSelect = onSelect;
    this.onOpenLink = onOpenLink;
    this.onAdd = onAdd;
    this.onRename = onRename;
    this.onCollapse = onCollapse;
    canvas.querySelector('#zoom-in').onclick = () => this.zoom(this.scale * 1.22);
    canvas.querySelector('#zoom-out').onclick = () => this.zoom(this.scale / 1.22);
    canvas.querySelector('#fit').onclick = () => this.fit(true);
    this.level.onclick = () => this.zoom(1);

    canvas.addEventListener('wheel', event => {
      if (!this.positions.length) return;
      event.preventDefault();
      const settings = this.wheelSettings[this.trackpadMode ? 'trackpad' : 'mouse'];
      if (!event.ctrlKey && (this.trackpadMode || settings.action === 'pan')) {
        const mode = event.deltaMode;
        const line = mode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
        const dx = event.deltaX * (mode === WheelEvent.DOM_DELTA_PAGE ? canvas.clientWidth : line);
        const dy = event.deltaY * (mode === WheelEvent.DOM_DELTA_PAGE ? canvas.clientHeight : line);
        const sensitivity = settings.pan / 100;
        if (dx || dy) this.panBy(-dx * sensitivity, -dy * sensitivity);
        return;
      }
      // Chromium and Firefox expose touchpad pinch as Ctrl+wheel.
      const zoomStep = this.trackpadMode ? Math.max(-.22, Math.min(.22, -event.deltaY / 100)) : -event.deltaY * .002;
      if (!zoomStep) return;
      const bounds = canvas.getBoundingClientRect();
      const sensitivity = settings.zoom / 100;
      this.zoom(this.scale * Math.exp(zoomStep * sensitivity), event.clientX - bounds.left, event.clientY - bounds.top);
    }, { passive: false });

    this.bindGestures(onMarquee, onBranchStart, onBranchDrop);
    canvas.addEventListener('keydown', event => {
      if (event.target !== canvas) return;
      if (event.key === 'F2' && this.editable && this.selection.length === 1) this.onRename(this.selection[0]);
      else if (event.key === '0') this.fit(true);
      else if (['+', '='].includes(event.key)) this.zoom(this.scale * 1.22);
      else if (event.key === '-') this.zoom(this.scale / 1.22);
      else if (event.key.startsWith('Arrow')) {
        this.panBy(
          event.key === 'ArrowLeft' ? 45 : event.key === 'ArrowRight' ? -45 : 0,
          event.key === 'ArrowUp' ? 45 : event.key === 'ArrowDown' ? -45 : 0
        );
      } else return;
      event.preventDefault();
    });

    let width = canvas.clientWidth;
    let height = canvas.clientHeight;
    new ResizeObserver(() => {
      if (this.autoFit) this.fit(this.overview);
      else {
        this.x += (canvas.clientWidth - width) / 2;
        this.y += (canvas.clientHeight - height) / 2;
        this.transform();
      }
      width = canvas.clientWidth;
      height = canvas.clientHeight;
    }).observe(canvas);
  }

  bindGestures(onMarquee, onBranchStart, onBranchDrop) {
    const { canvas } = this;
    const marquee = canvas.appendChild(element('div', 'selection-marquee'));
    const ghost = canvas.appendChild(element('div', 'branch-ghost'));
    for (const overlay of [marquee, ghost]) {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
    }

    let space = false;
    let pointer;
    let drag;
    let drop;
    const releaseSpace = () => {
      space = false;
      canvas.classList.remove('pan-ready');
    };
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape' && drag?.kind === 'branch') {
        event.preventDefault();
        finish(drag.pointerId, false);
        return;
      }
      if ((event.code !== 'Space' && event.key !== ' ') || event.ctrlKey || event.altKey || event.metaKey ||
          event.target.closest?.('input, textarea, select, [contenteditable], dialog') ||
          this.editingTitle || document.querySelector('dialog[open]')) return;
      if (pointer || !event.target.closest?.('button')) event.preventDefault();
      space = true;
      canvas.classList.add('pan-ready');
    });
    window.addEventListener('keyup', event => { if (event.code === 'Space' || event.key === ' ') releaseSpace(); });
    window.addEventListener('blur', () => {
      releaseSpace();
      pointer = undefined;
      if (drag) finish(drag.pointerId, false);
    });
    canvas.addEventListener('auxclick', event => { if (event.button === 1) event.preventDefault(); });

    canvas.addEventListener('pointerdown', event => {
      if (drag || !this.positions.length || event.target.closest('input, textarea, .node-link')) return;
      const interactive = event.target.closest('button');
      const primary = event.button === 0;
      const pan = event.button === 1 || (primary && (space || (!interactive && (event.pointerType === 'touch' || !this.editable))));
      const branch = primary && !event.shiftKey && this.editable && (event.pointerType !== 'touch' || this.free) &&
        interactive?.dataset.nodeId && interactive.dataset.nodeId !== 'root';
      if (!pan && (!primary || (interactive && !branch))) return;
      const kind = pan ? 'pan' : branch ? 'branch' : 'marquee';
      if (kind !== 'branch') {
        event.preventDefault();
        canvas.focus({ preventScroll: true });
      }
      if (this.editingTitle) return;
      drag = {
        pointerId: event.pointerId, kind, x: event.clientX, y: event.clientY,
        nodeId: interactive?.dataset.nodeId, additive: event.shiftKey
      };
      if (kind === 'branch' && this.free) drag.origin = mapPoint(event, canvas.getBoundingClientRect());
      this.gestureActive = true;
      if (kind === 'branch') return;
      canvas.setPointerCapture(event.pointerId);
      if (pan) canvas.classList.add('panning');
    });

    const frameAt = event => {
      const bounds = canvas.getBoundingClientRect();
      return {
        left: Math.min(drag.x, event.clientX) - bounds.left,
        top: Math.min(drag.y, event.clientY) - bounds.top,
        right: Math.max(drag.x, event.clientX) - bounds.left,
        bottom: Math.max(drag.y, event.clientY) - bounds.top
      };
    };
    const hitNodes = ({ left, top, right, bottom }) => {
      const x1 = (left - this.x) / this.scale;
      const x2 = (right - this.x) / this.scale;
      const y1 = (top - this.y) / this.scale;
      const y2 = (bottom - this.y) / this.scale;
      return this.positions.filter(({ x, y, width, height }) =>
        x + width / 2 >= x1 && x - width / 2 <= x2 && y + height / 2 >= y1 && y - height / 2 <= y2
      ).map(({ node }) => node.id);
    };
    const dragged = event => Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= 5;
    const marqueeSelection = frame => {
      const ids = frame ? hitNodes(frame) : [];
      return drag.additive ? [...new Set([...this.selection, ...ids])] : ids;
    };
    const mapPoint = (event, bounds) => ({
      x: (event.clientX - bounds.left - this.x) / this.scale,
      y: (event.clientY - bounds.top - this.y) / this.scale
    });
    const showBranchDrop = event => {
      if (!drag.started) {
        if (!dragged(event)) return;
        if (!onBranchStart(drag.nodeId)) {
          finish(event.pointerId, false);
          return;
        }
        canvas.setPointerCapture(event.pointerId);
        canvas.classList.add('dragging-branch');
        drag.started = true;
        drag.blocked = new Set();
        drag.source = this.positions.find(position => position.node.id === drag.nodeId);
        for (const position of this.positions) {
          let ancestor = position;
          while (ancestor && ancestor.node.id !== drag.nodeId) ancestor = ancestor.parent;
          if (ancestor) drag.blocked.add(position.node.id);
        }
        for (const button of this.nodes.querySelectorAll('button.node')) {
          button.classList.toggle('drag-source', drag.blocked.has(button.dataset.nodeId));
        }
        if (this.free) this.buildFreePreview(drag.blocked);
        else {
          ghost.textContent = drag.source.node.title;
          ghost.hidden = false;
        }
      }
      const bounds = canvas.getBoundingClientRect();
      ghost.style.left = (event.clientX - bounds.left + 13) + 'px';
      ghost.style.top = (event.clientY - bounds.top + 13) + 'px';
      const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest('button.node');
      const parentId = hit && this.nodes.contains(hit) ? hit.dataset.nodeId : undefined;
      const rootBounds = parentId === 'root' ? hit.getBoundingClientRect() : null;
      const side = rootBounds ? (event.clientX < rootBounds.left + rootBounds.width / 2 ? 'left' : 'right') : undefined;
      if (this.free) {
        const outside = event.clientX < bounds.left || event.clientX >= bounds.right ||
          event.clientY < bounds.top || event.clientY >= bounds.bottom;
        drop = outside ? null : this.showFreePreview(drag, mapPoint(event, bounds), parentId, side);
        if (!drop) this.clearDropPreview();
        return;
      }
      if (drop?.parentId === parentId && drop?.side === side) return;

      this.clearDropPreview();
      drop = null;
      if (parentId && !drag.blocked.has(parentId)) {
        try {
          if (this.showDropPreview(drag.nodeId, parentId, side)) drop = { parentId, side };
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
        }
      }
      ghost.hidden = Boolean(drop);
    };

    canvas.addEventListener('pointermove', event => {
      const current = { x: event.clientX, y: event.clientY };
      const previous = pointer;
      pointer = current;
      if (!drag) {
        if (space && previous && this.positions.length && event.pointerType === 'mouse') {
          this.panBy(current.x - previous.x, current.y - previous.y);
        }
        return;
      }
      if (drag.pointerId !== event.pointerId) return;
      if (drag.kind === 'pan') {
        const last = drag.last ?? drag;
        this.panBy(current.x - last.x, current.y - last.y);
        drag.last = current;
      } else if (drag.kind === 'branch') showBranchDrop(event);
      else if (dragged(event) || !marquee.hidden) {
        const frame = frameAt(event);
        marquee.style.left = frame.left + 'px';
        marquee.style.top = frame.top + 'px';
        marquee.style.width = (frame.right - frame.left) + 'px';
        marquee.style.height = (frame.bottom - frame.top) + 'px';
        marquee.hidden = false;
        this.select(marqueeSelection(frame), { preview: true });
      }
    });

    const finish = (pointerId, commit, event) => {
      if (drag?.pointerId !== pointerId) return;
      const { kind, nodeId } = drag;
      const ids = kind === 'marquee' && commit ? marqueeSelection(dragged(event) ? frameAt(event) : null) : [];
      if (kind === 'branch' && commit && drag.started) showBranchDrop(event);
      const destination = commit ? drop : null;
      drag = null;
      drop = null;
      this.gestureActive = false;
      marquee.hidden = true;
      ghost.hidden = true;
      canvas.classList.remove('panning', 'dragging-branch');
      for (const button of this.nodes.querySelectorAll('.drag-source')) button.classList.remove('drag-source');
      if (kind === 'marquee' && (!commit || !onMarquee(ids))) this.select(this.selection);
      this.clearDropPreview();
      this.previewBranch.replaceChildren();
      this.previewNodes?.clear();
      if (destination?.position) this.autoFit = false;
      if (destination) onBranchDrop(nodeId, destination.parentId, destination.side, destination.position);
    };
    canvas.addEventListener('pointerup', event => finish(event.pointerId, true, event));
    canvas.addEventListener('lostpointercapture', event => finish(event.pointerId, false));
    canvas.addEventListener('pointerleave', () => {
      pointer = undefined;
      if (drag?.kind === 'branch' && !drag.started) finish(drag.pointerId, false);
    });
  }

  render(map, selection, fit, editable, textStyle, collapsed) {
    const focused = document.activeElement?.dataset;
    if (this.editor && map?.id !== this.mapId) this.closeEditor(false);
    this.mapId = map?.id;
    this.editable = editable;
    this.free = map?.layout === 'free';
    this.freeCards = this.free && !textStyle;
    this.canvas.classList.toggle('editable', editable);
    this.canvas.classList.toggle('text-style', textStyle);
    const buttons = new Map();
    this.mapNodes = map?.nodes ?? [];
    for (const node of this.mapNodes) {
      const button = mapNodeButton(node);
      button.onclick = event => {
        if (event.target.closest('.node-link') && !event.shiftKey) this.onOpenLink(node.linkedMapId);
        else this.onSelect(node.id, event.shiftKey);
      };
      if (editable) {
        button.ondblclick = () => this.onRename(node.id);
        button.onkeydown = event => {
          if (event.key !== 'F2') return;
          event.preventDefault();
          this.onRename(node.id);
        };
      }
      buttons.set(node.id, button);
    }
    this.buttons = buttons;
    this.collapsed = collapsed;
    const tree = drawTree(this.nodes, this.connections, this.mapNodes, buttons, collapsed, this.onCollapse, this.free, this.freeCards);
    this.layoutPositions = tree.positions;
    this.freeMeasurements = tree.measurements;
    this.positions = this.layoutPositions.filter(position => !position.folded);
    this.select(selection);
    if (this.editor) this.positionEditor();
    const focusTarget = buttons.get(focused?.nodeId) ||
      (focused?.collapseId && branchControlFocus(this.nodes, buttons, focused.collapseId)) ||
      [...this.controls.children].find(button => button.dataset.control === focused?.control);
    focusTarget?.focus({ preventScroll: true });
    if (fit) this.fit();
  }

  initialBranchPositions() {
    const clones = new Map([...this.buttons].map(([id, button]) => [id, button.cloneNode(true)]));
    const measuring = this.nodes.appendChild(element('div'));
    measuring.style.visibility = 'hidden';
    measuring.append(...clones.values());
    const positions = layout(this.mapNodes, measureNodes(clones));
    measuring.remove();
    return positions.filter(({ node, parent }) => parent && !node.position).map(({ node, parent, x, y }) =>
      ({ nodeId: node.id, x: x - parent.x, y: y - parent.y }));
  }

  placeNear(parent, { width, height }, side, y, occupied, minY) {
    const direction = side === 'left' ? -1 : 1;
    const gap = parent.depth ? columnGap : rootColumnGap;
    const x = parent.x + direction * ((parent.width + width) / 2 + gap);
    return { x, y: freeMarkerY(occupied, { x: x - width / 2, y, width, height }, minY) };
  }

  buildFreePreview(ids) {
    const svg = this.previewLayer.namespaceURI;
    this.previewBranch.removeAttribute('transform');
    this.previewNodes = new Map();
    for (const item of this.positions) {
      if (!ids.has(item.node.id)) continue;
      let path;
      if (ids.has(item.parent?.node.id)) {
        path = this.previewBranch.appendChild(document.createElementNS(svg, 'path'));
        path.setAttribute('class', 'branch-preview-arrow');
      }
      const marker = this.previewBranch.appendChild(document.createElementNS(svg, 'rect'));
      marker.setAttribute('class', 'branch-preview-marker');
      marker.setAttribute('rx', '6');
      const preview = { path, marker };
      this.previewNodes.set(item.node.id, preview);
      this.positionPreviewNode(item, preview);
    }
  }

  positionPreviewNode(item, { path, marker }) {
    path?.setAttribute('d', connectionGeometry(item.parent, item, true).path);
    marker.setAttribute('x', item.x - item.width / 2);
    marker.setAttribute('y', item.y - item.height / 2);
    marker.setAttribute('width', item.width);
    marker.setAttribute('height', item.height);
  }

  previewFreeCardDrop(drag, fields) {
    const source = drag.source.node;
    let measurements = this.freeMeasurements;
    if ((source.parentId === 'root') !== (fields.parentId === 'root')) {
      if (!drag.reparentedMeasurements) {
        const sample = mapNodeButton({ ...source, parentId: fields.parentId });
        sample.style.visibility = 'hidden';
        this.nodes.append(sample);
        const changed = measureNodeStyles(this.nodes, new Map([[source.id, sample]]), true);
        drag.reparentedMeasurements = {
          sizes: new Map([...measurements.sizes, ...changed.sizes]),
          textSizes: new Map([...measurements.textSizes, ...changed.textSizes])
        };
        sample.remove();
      }
      measurements = drag.reparentedMeasurements;
    }
    const nodes = movedBranchNodes(this.mapNodes, { nodeId: source.id, ...fields });
    const visible = new Set(visibleMapNodes(nodes, this.collapsed).map(node => node.id));
    const positions = freeLayout(nodes, measurements, visible);
    for (const item of positions) {
      const preview = this.previewNodes.get(item.node.id);
      if (preview) this.positionPreviewNode(item, preview);
    }
    const item = positions.find(position => position.node.id === source.id);
    return connectionGeometry(item.parent, item, true).path;
  }

  showFreePreview(drag, pointer, targetId, side) {
    const source = drag.source;
    const target = !drag.blocked.has(targetId) && this.positions.find(item => item.node.id === targetId);
    const parent = target || source.parent;
    const parentId = parent.node.id;
    if (parentId !== source.node.parentId && drag.checkedParent !== parentId) {
      drag.checkedParent = parentId;
      drag.validParent = false;
      try {
        movedBranchNodes(this.mapNodes, { nodeId: source.node.id, parentId, side });
        drag.validParent = true;
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
      }
    }
    if (parentId !== source.node.parentId && !drag.validParent) return null;

    let point = { x: source.x + pointer.x - drag.origin.x, y: source.y + pointer.y - drag.origin.y };
    if (target) {
      const direction = side ?? (pointer.x < parent.x ? 'left' : 'right');
      point = this.placeNear(parent, source, direction, parent.y,
        this.positions.filter(item => !drag.blocked.has(item.node.id)));
    }
    this.previewTarget?.classList.remove('drop-target');
    this.previewTarget = target ? this.buttons.get(parentId) : null;
    this.previewTarget?.classList.add('drop-target');
    this.previewMarker.setAttribute('width', '0');
    const position = { x: Math.round(point.x - parent.x), y: Math.round(point.y - parent.y) };
    const destination = { parentId, side, position };
    if (this.freeCards) {
      try {
        this.previewArrow.setAttribute('d', this.previewFreeCardDrop(drag, destination));
      } catch (error) {
        if (error instanceof AppError) return null;
        throw error;
      }
    } else {
      this.previewBranch.setAttribute('transform', 'translate(' + (point.x - source.x) + ' ' + (point.y - source.y) + ')');
      this.previewArrow.setAttribute('d', connectionGeometry(parent, { ...source, ...point }, true).path);
    }
    this.previewLayer.removeAttribute('hidden');
    return destination;
  }

  showDropPreview(nodeId, parentId, side) {
    const positions = new Map(this.layoutPositions.map(position => [position.node.id, position]));
    const source = positions.get(nodeId);
    const parent = positions.get(parentId);
    if (source.node.parentId === parentId && (!side || this.sideOf(nodeId) === side)) return false;

    const nodes = movedBranchNodes(this.mapNodes, { nodeId, parentId, side });
    const siblings = side ? rootBranches(nodes).filter(branch => branch.side === side).map(branch => branch.node)
      : nodes.filter(node => node.parentId === parentId);
    const index = siblings.findIndex(node => node.id === nodeId);
    const previous = positions.get(siblings[index - 1]?.id);
    const next = positions.get(siblings[index + 1]?.id);
    const direction = side === 'left' || parent.x < 0 ? -1 : 1;
    const width = Math.min(84, Math.max(48, source.width * .55));
    const height = 18;
    const startX = parent.x + direction * parent.width / 2;
    const column = previous ?? next ?? this.layoutPositions.find(position =>
      position.depth === parent.depth + 1 && Math.sign(position.x) === direction);
    let edge = column ? column.x - direction * column.width / 2 : startX + direction * rootColumnGap;
    if (!column && parent.depth) {
      const parentColumn = this.layoutPositions.filter(position =>
        position.depth === parent.depth && Math.sign(position.x) === direction);
      const outside = Math.max(...parentColumn.map(position => direction * position.x + position.width / 2));
      edge = direction * (outside + columnGap);
    }
    const x = direction > 0 ? edge : edge - width;
    const minY = previous ? previous.y + previous.height / 2 + height / 2 + 4 : -Infinity;
    const maxY = next ? next.y - next.height / 2 - height / 2 - 4 : Infinity;
    let y = previous && next ? (minY + maxY) / 2 : parent.y;
    if (previous && !next) y = minY + 10;
    if (next && !previous) y = maxY - 10;
    y = freeMarkerY(this.positions, { x, y, width, height }, minY, maxY);

    const endX = edge - direction * 5;
    const midX = (startX + endX) / 2;
    const arrowX = endX - direction * 7;
    this.previewArrow.setAttribute('d', `M ${startX} ${parent.y} C ${midX} ${parent.y}, ${midX} ${y}, ${endX} ${y}
      M ${arrowX} ${y - 4} L ${endX} ${y} L ${arrowX} ${y + 4}`);
    this.previewMarker.setAttribute('x', x);
    this.previewMarker.setAttribute('y', y - height / 2);
    this.previewMarker.setAttribute('width', width);
    this.previewMarker.setAttribute('height', height);
    this.previewTarget = this.buttons.get(parentId);
    this.previewTarget.classList.add('drop-target');
    this.previewLayer.removeAttribute('hidden');
    return true;
  }

  clearDropPreview() {
    this.previewLayer.setAttribute('hidden', '');
    this.previewTarget?.classList.remove('drop-target');
    this.previewTarget = null;
  }

  select(selection, { preview = false } = {}) {
    if (!preview) this.selection = selection;
    showBranchControls(this.nodes, !preview && selection.length === 1 ? selection[0] : undefined);
    const selectedIds = new Set(selection);
    let selectedButton;
    for (const button of this.nodes.querySelectorAll('.node')) {
      const selected = selectedIds.has(button.dataset.nodeId);
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      if (selected) selectedButton = button;
    }
    this.controls.remove();
    this.controls.replaceChildren();
    if (preview || !this.editable || selection.length !== 1 || !selectedButton) return;
    const position = this.positions.find(item => item.node.id === selection[0]);
    if (!position) return;
    selectedButton.after(this.controls);
    const { x, y, width, height, depth } = position;
    const offset = controlGap + controlSize / 2;
    const root = depth === 0;
    for (const side of root ? ['left', 'right'] : [this.sideOf(position.node.id)]) {
      const direction = side === 'left' ? -1 : 1;
      let sideOffset = width / 2 + offset;
      let bottom;
      for (const child of this.childBranches(position, side)) {
        if (child.folded) {
          if (!branchDotsVisible(this.scale)) continue;
          const dot = foldedControlBounds(child, this.scale);
          const dotOffset = direction * (dot.x - x);
          if (dotOffset > width / 2 && Math.abs(dot.y - y) < (dot.height + controlSize) / 2 + controlGap) {
            sideOffset = Math.max(sideOffset, dotOffset + dot.width / 2 + offset);
          }
        } else if (!bottom || child.y + child.height / 2 > bottom.y + bottom.height / 2) {
          bottom = child;
        }
      }
      const placement = bottom
        ? { x: bottom.x, y: bottom.y + bottom.height / 2 + controlSize / 2 + branchAddGap, keepBelow: true }
        : { x: x + direction * sideOffset, y };
      const label = !root ? 'Добавить ответвление' : side === 'left' ? 'Добавить ветвь слева' : 'Добавить ветвь справа';
      this.addControl(side, label, placement, position.node.color, root ? { side } : {});
    }
    if (!root) {
      const placement = { x, y: y + height / 2 + controlSize / 2 + siblingAddGap, keepBelow: true };
      this.addControl('below', 'Добавить соседний узел', placement, position.node.color, { sibling: true });
    }
  }

  get editingTitle() { return Boolean(this.editor); }
  get hasUnsavedTitle() { return Boolean(this.editor && this.editor.input.value.trim() !== this.editor.original); }

  editTitle(nodeId, save) {
    const position = this.positions.find(item => item.node.id === nodeId);
    if (!position) return;
    this.openTitleEditor({ nodeId, original: position.node.title }, save);
  }

  createBranch(placement, save) {
    this.openTitleEditor({ placement, original: '' }, save);
  }

  openTitleEditor({ nodeId, original, placement }, save) {
    if (this.editor) return;
    const shell = element('div', 'node-editor');
    const input = element('textarea', 'node-title-input');
    const measure = element('span', 'node-title-measure');
    input.value = original;
    input.maxLength = maxTitleLength;
    input.rows = 1;
    input.setAttribute('aria-label', placement ? 'Название нового узла' : 'Название узла на холсте');
    if (placement) input.placeholder = 'Название узла';
    measure.setAttribute('aria-hidden', 'true');
    const editor = { nodeId, shell, input, measure, original, placement };
    if (placement) {
      editor.path = document.createElementNS(this.connections.namespaceURI, 'path');
      editor.path.setAttribute('class', 'connection');
    }
    this.editor = editor;
    shell.append(input, measure);
    this.stage.append(shell);
    this.positionEditor();
    if (this.editor !== editor) return;
    if (placement) this.revealPosition(editor.preview, 0);

    const submit = async returnFocus => {
      if (this.editor !== editor || input.readOnly) return;
      const title = input.value.trim();
      if (!title || title === original) {
        if (!title && !placement && returnFocus) {
          input.setCustomValidity('Введите название узла');
          input.reportValidity();
        } else this.closeEditor(returnFocus);
        return;
      }
      input.readOnly = true;
      const saved = await save(title, editor.offset);
      if (this.editor !== editor) return;
      if (saved) this.closeEditor(returnFocus);
      else {
        input.readOnly = false;
        input.focus({ preventScroll: true });
      }
    };
    input.oninput = () => {
      input.setCustomValidity('');
      this.positionEditor();
    };
    input.onblur = () => submit(false);
    input.onkeydown = event => {
      if (event.isComposing || !['Escape', 'Enter'].includes(event.key)) return;
      event.preventDefault();
      if (input.readOnly) return;
      if (event.key === 'Escape') this.closeEditor(true);
      else submit(true);
    };
    input.focus({ preventScroll: true });
    input.setSelectionRange(original.length, original.length);
  }

  positionEditor() {
    const { nodeId, input, shell, measure, placement } = this.editor;
    const position = this.positions.find(item => item.node.id === (placement?.parentId ?? nodeId));
    if (!this.editable || !position) { this.closeEditor(false); return; }
    const { x, y, width, height, depth } = position;
    if (!placement) this.buttons.get(nodeId).classList.add('renaming');
    this.controls.hidden = true;
    const editorDepth = placement ? depth + 1 : depth;
    shell.className = 'node node-editor selected' + (editorDepth === 0 ? ' root' : editorDepth === 1 ? ' branch' : '');
    setColor(shell, position.node.color);
    measure.textContent = input.value || input.placeholder;
    shell.style.width = Math.max(placement ? 0 : width, 145, measure.offsetWidth + 28) + 'px';
    input.style.height = '0';
    input.style.height = Math.max(placement ? 0 : height - 2, input.scrollHeight) + 'px';
    const point = placement ? this.positionNewBranch(position) : { x, y };
    shell.style.left = point.x + 'px';
    shell.style.top = point.y + 'px';
  }

  positionNewBranch(parent) {
    const { shell, path, placement } = this.editor;
    const size = { width: shell.offsetWidth, height: shell.offsetHeight };
    const side = placement.side ?? this.sideOf(parent.node.id);
    const siblings = this.childBranches(parent, side);
    const previous = siblings.find(item => item.node.id === placement.afterId);
    const anchors = previous ? [previous] : siblings.map(item => item.folded ? item.branchControl : item);
    const spacing = parent.depth ? 30 : branchGap;
    const y = anchors.length ? Math.max(...anchors.map(item => item.y + item.height / 2)) + spacing + size.height / 2
      : parent.y;
    const point = this.placeNear(parent, size, side, y, this.positions, anchors.length ? y : undefined);
    const preview = { ...point, ...size, depth: parent.depth + 1 };
    this.editor.preview = preview;
    this.editor.offset = { x: point.x - parent.x, y: point.y - parent.y };
    path.setAttribute('d', connectionGeometry(parent, preview, this.free).path);
    setColor(path, parent.node.color);
    this.connections.append(path);
    return point;
  }

  closeEditor(returnFocus) {
    const { shell, nodeId, path } = this.editor;
    this.editor = null;
    shell.remove();
    path?.remove();
    this.controls.hidden = false;
    const node = this.buttons.get(nodeId ?? this.selection[0]);
    node?.classList.remove('renaming');
    if (returnFocus) node?.focus({ preventScroll: true });
  }

  childBranches(parent, side) {
    return this.layoutPositions.filter(item => item.parent === parent && (parent.depth ||
      (item.x === parent.x ? item.node.side ?? 'right' : item.x < parent.x ? 'left' : 'right') === side));
  }

  addControl(direction, label, { x, y, keepBelow }, color, options) {
    const control = element('button', 'node-add-control');
    control.type = 'button';
    control.dataset.control = direction;
    control.setAttribute('aria-label', label);
    control.title = label;
    control.style.left = x + 'px';
    const expandedSize = branchButtonSize(this.scale) / this.scale;
    const toggles = this.layoutPositions.filter(position => position.folded ? branchDotsVisible(this.scale)
      : this.scale >= branchButtonMinZoom && position.node.parentId === this.selection[0])
      .map(position => position.folded ? foldedControlBounds(position, this.scale)
        : { ...position.branchControl, width: expandedSize, height: expandedSize });
    const occupied = keepBelow ? [...toggles, ...this.positions, ...Array.from(this.controls.children, button => ({
      x: parseFloat(button.style.left), y: parseFloat(button.style.top), width: controlSize, height: controlSize
    }))] : toggles;
    control.style.top = freeMarkerY(occupied, {
      x: x - controlSize / 2, y, width: controlSize, height: controlSize
    }, keepBelow ? y : undefined) + 'px';
    control.style.width = control.style.height = controlSize + 'px';
    control.innerHTML = icon('plus');
    setColor(control, color);
    control.onclick = () => this.onAdd(options);
    this.controls.append(control);
  }

  sideOf(nodeId) {
    const position = this.positions.find(item => item.node.id === nodeId);
    return position?.x < 0 ? 'left' : 'right';
  }

  freerRootSide() {
    let left = 0;
    let right = 0;
    for (const position of this.layoutPositions) {
      if (position.depth !== 1) continue;
      if (position.x < 0) left += position.span + branchGap;
      else right += position.span + branchGap;
    }
    return left < right ? 'left' : 'right';
  }

  fit(overview = false) {
    if (!this.positions.length) return;
    this.autoFit = true;
    this.overview = overview;
    const { x1, x2, y1, y2 } = layoutBounds(this.layoutPositions);
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const horizontalPadding = this.editable ? 76 : 36;
    const fitScale = Math.max(.02, Math.min(1.1, (width - horizontalPadding) / (x2 - x1), (height - 136) / Math.max(1, y2 - y1)));
    this.scale = !overview && width < 510 ? Math.max(.6, fitScale) : fitScale;
    const centerOnRoot = this.scale > fitScale;
    this.x = width / 2 - (centerOnRoot ? 0 : (x1 + x2) / 2 * this.scale);
    this.y = height / 2 - (centerOnRoot ? 0 : (y1 + y2) / 2 * this.scale);
    this.transform();
  }

  reveal(nodeId) {
    const position = this.positions.find(item => item.node.id === nodeId);
    if (!position) return;
    this.revealPosition(position, this.editable ? controlGap + controlSize : 0);
  }

  revealPosition(position, controls) {
    const x = this.x + position.x * this.scale;
    const y = this.y + position.y * this.scale;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const halfWidth = position.width * this.scale / 2;
    const halfHeight = position.height * this.scale / 2;
    const left = halfWidth + (position.x <= 0 ? controls * this.scale : 0);
    const right = halfWidth + (position.x >= 0 ? controls * this.scale : 0);
    const bottom = halfHeight + (position.depth && controls ? (siblingAddGap + controlSize) * this.scale : 0);
    if (x - left < 12 || x + right > width - 12 || y - halfHeight < 65 || y + bottom > height - 65) {
      this.autoFit = false;
      this.x = width / 2 - position.x * this.scale;
      this.y = height / 2 - position.y * this.scale;
      this.transform();
    }
  }

  panBy(dx, dy) {
    this.autoFit = false;
    this.x += dx;
    this.y += dy;
    this.transform();
  }

  zoom(scale, x = this.canvas.clientWidth / 2, y = this.canvas.clientHeight / 2) {
    this.autoFit = false;
    const next = Math.min(2.5, Math.max(.02, scale));
    this.x = x - (x - this.x) * next / this.scale;
    this.y = y - (y - this.y) * next / this.scale;
    this.scale = next;
    this.transform();
  }

  transform() {
    transformStage(this.stage, this.x, this.y, this.scale);
    if (this.controlsScale !== this.scale && this.controls.isConnected && this.layoutPositions.some(item => item.folded)) {
      const focused = this.controls.contains(document.activeElement) ? document.activeElement.dataset.control : undefined;
      this.select(this.selection);
      [...this.controls.children].find(button => button.dataset.control === focused)?.focus({ preventScroll: true });
    }
    this.controlsScale = this.scale;
    this.level.textContent = Math.round(this.scale * 100) + '%';
  }

  toStandaloneHtml(title) {
    const file = document.implementation.createHTMLDocument(title);
    file.documentElement.lang = 'ru';
    file.documentElement.dataset.theme = document.documentElement.dataset.theme || 'light';
    const charset = file.createElement('meta');
    charset.setAttribute('charset', 'utf-8');
    file.head.prepend(charset);
    const viewport = file.createElement('meta');
    viewport.name = 'viewport';
    viewport.content = 'width=device-width, initial-scale=1';
    file.head.append(viewport);
    const policy = file.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'";
    file.head.append(policy);

    const style = file.createElement('style');
    const stylesheet = document.querySelector('link[href="/styles.css"]').sheet;
    style.textContent = [...stylesheet.cssRules].map(rule => rule.cssText).join('\n') + `
      .offline-workspace { height: 100vh; height: 100dvh; }
      .offline-caption, .offline-hint { color: var(--muted); font-size: 12px; }
      .offline-caption { white-space: nowrap; }
      .offline-hint { position: absolute; right: 18px; bottom: 28px; pointer-events: none; }
      .offline-workspace .details-open .offline-hint { display: none; }
      @media (max-width: 1040px) { .offline-hint { display: none; } }
      @media (max-width: 420px) { .offline-workspace .zoom-bar { left: 50%; transform: translateX(-50%); } }
    `;
    file.head.append(style);

    file.body.innerHTML = `
      <main class="workspace offline-workspace">
        <header class="topbar"><h1></h1><span class="offline-caption">Автономная карта</span></header>
        <div class="work-area view-mode">
        <section id="canvas" class="canvas" aria-label="Холст ментальной карты" tabindex="0">
          <div id="stage" class="map-stage"></div>
          <div class="zoom-bar" role="group" aria-label="Навигация по холсту">
            <button class="icon-button" id="zoom-out" aria-label="Уменьшить" title="Уменьшить">${icon('minus')}</button>
            <button id="zoom-level" aria-label="Сбросить масштаб" title="Сбросить масштаб">100%</button>
            <button class="icon-button" id="zoom-in" aria-label="Увеличить" title="Увеличить">${icon('plus')}</button>
            <span class="toolbar-divider"></span>
            <button class="icon-button" id="fit" aria-label="Показать всю карту" title="Показать всю карту">${icon('fit')}</button>
          </div>
          <p class="offline-hint">Перетащите фон для перемещения. Нажмите на узел, чтобы открыть заметки.</p>
        </section>
        ${detailsMarkup}
        </div>
      </main>
    `;
    file.querySelector('h1').textContent = title;
    file.getElementById('canvas').classList.toggle('text-style', this.canvas.classList.contains('text-style'));
    const stage = file.getElementById('stage');
    stage.dataset.collapsed = JSON.stringify([...this.collapsed]);
    if (this.free) stage.dataset.layout = 'free';
    stage.append(file.importNode(this.connections.ownerSVGElement, true));
    const layer = file.createElement('div');
    layer.id = 'nodes';
    stage.append(layer);
    for (const node of this.mapNodes) {
      const copy = file.importNode(this.buttons.get(node.id), true);
      copy.querySelector('.node-link')?.remove();
      copy.classList.remove('selected', 'renaming', 'drag-source', 'drop-target');
      copy.removeAttribute('aria-pressed');
      copy.dataset.parentId = node.parentId ?? '';
      copy.dataset.color = node.color;
      if (node.side) copy.dataset.side = node.side;
      if (node.position) copy.dataset.position = JSON.stringify(node.position);
      copy.dataset.noteHtml = node.notes ? markdown.render(node.notes) : '';
      layer.append(copy);
    }
    const script = file.createElement('script');
    script.textContent = [
      `const branchGap = ${branchGap}, rootColumnGap = ${rootColumnGap}, columnGap = ${columnGap}, branchControlSize = ${branchControlSize};`,
      `const branchButtonBaseSize = ${branchButtonBaseSize}, branchButtonMinSize = ${branchButtonMinSize}, branchButtonMaxSize = ${branchButtonMaxSize};`,
      `const branchButtonMinZoom = ${branchButtonMinZoom}, branchDotMinZoom = ${branchDotMinZoom};`,
      ...[rootBranches, visibleMapNodes, layout, measureNodes, measureNodeStyles, placeFree, freeLayout,
        clearCardPosition, freeMarkerY, connectionGeometry,
        drawTree, showBranchControls, branchControlFocus, setColor, layoutBounds, bindDetailsPanel,
        branchButtonSize, branchDotScale, branchDotsVisible, transformStage]
        .map(helper => helper.toString()),
      '(' + startOfflineViewer.toString() + ')();'
    ].join('\n');
    file.body.append(script);
    return '<!doctype html>\n' + file.documentElement.outerHTML;
  }
}

function startOfflineViewer() {
  const $ = id => document.getElementById(id);
  const canvas = $('canvas');
  const stage = $('stage');
  const level = $('zoom-level');
  const details = bindDetailsPanel(document.querySelector('.work-area'), (target, html) => { target.innerHTML = html; });
  const layer = $('nodes');
  const buttons = new Map([...layer.querySelectorAll('.node')].map(button => [button.dataset.nodeId, button]));
  const mapNodes = [...buttons.values()].map(button => ({
    id: button.dataset.nodeId, parentId: button.dataset.parentId || null,
    color: button.dataset.color, side: button.dataset.side, title: button.title,
    position: button.dataset.position ? JSON.parse(button.dataset.position) : undefined
  }));
  const collapsed = new Set(JSON.parse(stage.dataset.collapsed));
  const free = stage.dataset.layout === 'free';
  const cards = !canvas.classList.contains('text-style');
  let { positions } = drawTree(layer, $('connections'), mapNodes, buttons, collapsed, toggleCollapse, free, cards);
  let selected;
  let x = 0;
  let y = 0;
  let scale = 1;
  let autoFit = true;
  let drag;

  function draw() {
    transformStage(stage, x, y, scale);
    level.textContent = Math.round(scale * 100) + '%';
  }

  function fit() {
    const { x1, x2, y1, y2 } = layoutBounds(positions);
    const { clientWidth: width, clientHeight: height } = canvas;
    scale = Math.max(.02, Math.min(1.1, (width - 32) / (x2 - x1), (height - 96) / (y2 - y1)));
    x = width / 2 - (x1 + x2) / 2 * scale;
    y = height / 2 - (y1 + y2) / 2 * scale;
    autoFit = true;
    draw();
  }

  function toggleCollapse(id) {
    if (collapsed.has(id)) collapsed.delete(id);
    else collapsed.add(id);
    ({ positions } = drawTree(layer, $('connections'), mapNodes, buttons, collapsed, toggleCollapse, free, cards));
    if (selected && !layer.contains(selected)) {
      selected.classList.remove('selected');
      selected = buttons.get(mapNodes.find(node => node.id === id).parentId);
      selected.classList.add('selected');
      details.update(selected.title, selected.dataset.noteHtml, selected);
    }
    showBranchControls(layer, selected?.dataset.nodeId);
    branchControlFocus(layer, buttons, id)?.focus({ preventScroll: true });
    if (autoFit) fit();
  }

  function zoom(next, px = canvas.clientWidth / 2, py = canvas.clientHeight / 2) {
    next = Math.max(.02, Math.min(2.5, next));
    x = px - (px - x) * next / scale;
    y = py - (py - y) * next / scale;
    scale = next;
    autoFit = false;
    draw();
  }

  $('zoom-out').onclick = () => zoom(scale / 1.22);
  $('zoom-in').onclick = () => zoom(scale * 1.22);
  level.onclick = () => zoom(1);
  $('fit').onclick = fit;
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const box = canvas.getBoundingClientRect();
    zoom(scale * Math.exp(-event.deltaY * .002), event.clientX - box.left, event.clientY - box.top);
  }, { passive: false });

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX - x, y: event.clientY - y };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('panning');
  });
  canvas.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    x = event.clientX - drag.x;
    y = event.clientY - drag.y;
    autoFit = false;
    draw();
  });
  canvas.addEventListener('lostpointercapture', () => {
    drag = undefined;
    canvas.classList.remove('panning');
  });
  canvas.addEventListener('keydown', event => {
    if (event.target !== canvas) return;
    if (event.key === '0') fit();
    else if (event.key === '+' || event.key === '=') zoom(scale * 1.22);
    else if (event.key === '-') zoom(scale / 1.22);
    else return;
    event.preventDefault();
  });

  stage.onclick = event => {
    const node = event.target.closest('.node');
    if (!node) return;
    selected?.classList.remove('selected');
    selected = node;
    selected.classList.add('selected');
    showBranchControls(layer, node.dataset.nodeId);
    details.show(node.title, node.dataset.noteHtml, node);
  };
  let width = canvas.clientWidth;
  let height = canvas.clientHeight;
  new ResizeObserver(() => {
    if (autoFit) fit();
    else {
      x += (canvas.clientWidth - width) / 2;
      y += (canvas.clientHeight - height) / 2;
      draw();
    }
    width = canvas.clientWidth;
    height = canvas.clientHeight;
  }).observe(canvas);
  fit();
}
