import { newBlock, applyChanges, insertIndex, toWhatsApp, fromWhatsApp } from '@/lib/shared';
import type { Block, BlockChanges, BlockProps, BlockType, Data, List } from '@/lib/shared';
import type { Api, ApiError } from '@/lib/api';

const $ = (id: string) => document.getElementById(id)!;

const BLOCK_HTML = `<div class="block">
  <button class="circle check" tabindex="-1" title="Completar (Ctrl+Enter)">
    <svg viewBox="0 0 16 16"><path d="M4.5 8.2l2.3 2.3 4.7-4.9"/></svg>
  </button>
  <span class="marker"></span>
  <div class="line" contenteditable="true"></div>
  <button class="icon-btn delete" tabindex="-1" title="Eliminar">
    <svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/></svg>
  </button>
  <button class="icon-btn star" tabindex="-1" title="Importante">
    <svg viewBox="0 0 16 16"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6Z"/></svg>
  </button>
</div>`;

const ui = {
  tabList: $('tab-list'),
  content: $('content'),
  page: $('page'),
  toolbar: $('toolbar'),
  copy: $('copy'),
  template: Object.assign(document.createElement('template'), { innerHTML: BLOCK_HTML }),
};

const prefs = {
  get<T>(key: string, fallback: T): T {
    try {
      return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};

const CACHE_KEYS = ['data', 'queue', 'activeList'];

export function clearCache() {
  for (const key of CACHE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {}
  }
}

let api: Api | undefined;
let data = prefs.get<Data>('data', { lists: [], blocks: [] });
let activeListId = prefs.get<string | null>('activeList', null);
let editingTab = false;
let pendingRender = false;

const nodes = new Map<string, HTMLElement>();
const dirty = new Set<string>();
const queue = prefs.get<[string, unknown[]][]>('queue', []);
let syncing = false;
let incoming: Data | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const POLL_MS = 15000;

function saveCache() {
  prefs.set('data', data);
  prefs.set('queue', queue);
}

function activeList() {
  return data.lists.find(l => l.id === activeListId) || data.lists[0];
}

const byId = (id: string) => data.blocks.find(b => b.id === id);
const pageBlocks = (listId: string) => data.blocks.filter(b => b.listId === listId);

function lineOf(el: Element): HTMLElement;
function lineOf(el: string | Element | null | undefined): HTMLElement | null | undefined;
function lineOf(el: string | Element | null | undefined) {
  return (typeof el === 'string' ? nodes.get(el) : el)?.querySelector<HTMLElement>('.line');
}

function send(method: string, ...args: unknown[]) {
  queue.push([method, args]);
  saveCache();
  if (!syncing) drain();
}

const retryable = (err: ApiError) => !err.status || err.status >= 500;

async function drain() {
  if (syncing || !api) return;
  syncing = true;
  try {
    while (queue.length) {
      const [method, args] = queue[0];
      try {
        incoming = await api.call(method, ...args);
      } catch (e) {
        const err = e as ApiError;
        if (err.status === 401) return api.unauthorized();
        if (retryable(err)) return;
        alert(err.message);
        incoming = await api.load().catch(() => incoming);
      }
      queue.shift();
      prefs.set('queue', queue);
    }
  } finally {
    syncing = false;
  }
  if (incoming) receive(incoming);
}

async function refresh() {
  if (!api || document.hidden) return;
  if (queue.length) return drain();
  if (syncing) return;
  try {
    receive(await api.load());
  } catch (err) {
    if ((err as ApiError).status === 401) api.unauthorized();
  }
}

function receive(next: Data) {
  if (syncing || dirty.size || queue.length) {
    incoming = next;
    return;
  }
  incoming = null;
  data = next;
  saveCache();
  if (editingTab) {
    pendingRender = true;
    return;
  }
  render();
}

function markDirty(id: string) {
  dirty.add(id);
  flushTimer ??= setTimeout(flushText, 400);
}

function flushText() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  for (const id of dirty) {
    const block = byId(id);
    const line = lineOf(id);
    if (!block || !line) continue;
    const text = toMarkup(line);
    if (text !== block.text) {
      block.text = text;
      send('updateBlock', id, { text });
    }
  }
  dirty.clear();
  if (incoming && !syncing) receive(incoming);
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, c => HTML_ESCAPES[c]);
const EMPHASIS_TAGS: Record<string, string> = { '*': 'b', _: 'i', '~': 's' };
const EMPHASIS = /(^|[^\p{L}\p{N}])([*_~])(?!\s)(.*?\S)\2(?![\p{L}\p{N}])/gu;

function emphasis(s: string): string {
  return s.replace(EMPHASIS, (_, pre: string, mark: string, inner: string) => {
    const tag = EMPHASIS_TAGS[mark];
    return `${pre}<${tag}>${emphasis(inner)}</${tag}>`;
  });
}

function toHtml(text: string) {
  return escapeHtml(text)
    .split(/(```[^]+?```|`[^`]+`)/)
    .map((part, i) => (i % 2 ? `<code>${part.replace(/^`+|`+$/g, '')}</code>` : emphasis(part)))
    .join('');
}

const MARKS: Record<string, string> = { B: '*', STRONG: '*', I: '_', EM: '_', S: '~', STRIKE: '~', DEL: '~' };

function wrapMark(s: string, mark: string) {
  const [, lead, core, trail] = s.match(/^(\s*)([^]*?)(\s*)$/)!;
  return core ? lead + mark + core + mark + trail : s;
}

function toMarkup(node: Node, inside = ''): string {
  let out = '';
  for (const n of node.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) out += (n as Text).data;
    else if (n.nodeType !== Node.ELEMENT_NODE || n.nodeName === 'BR') continue;
    else if (n.nodeName === 'CODE' || n.nodeName === 'TT') out += wrapMark(n.textContent!, '```');
    else {
      const mark = MARKS[n.nodeName];
      const inner = toMarkup(n, inside + (mark || ''));
      out += mark && !inside.includes(mark) ? wrapMark(inner, mark) : inner;
    }
  }
  return out.replace(/ /g, ' ');
}

function render() {
  pendingRender = false;
  const list = activeList();
  if (!list) return;
  activeListId = list.id;
  prefs.set('activeList', list.id);
  renderTabs(list);
  renderPage(list);
}

function renderTabs(list = activeList()!) {
  if (editingTab) return;
  ui.tabList.replaceChildren(
    ...data.lists.map(l => {
      const tab = document.createElement('button');
      tab.className = 'tab' + (l.id === list.id ? ' active' : '');
      tab.textContent = l.name;
      const count = data.blocks.filter(b => b.listId === l.id && b.type === 'todo' && !b.done).length;
      if (count) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = String(count);
        tab.append(badge);
      }
      tab.onclick = () => {
        flushText();
        activeListId = l.id;
        render();
        focusEnd();
      };
      tab.ondblclick = () => editListName(tab, l);
      tab.oncontextmenu = e => {
        e.preventDefault();
        listMenu(tab, l);
      };
      if (l.id === list.id) {
        const more = document.createElement('span');
        more.className = 'tab-more';
        more.title = 'Opciones de la lista';
        more.innerHTML = '<svg viewBox="0 0 16 16"><circle cx="3.5" cy="8" r=".9"/><circle cx="8" cy="8" r=".9"/><circle cx="12.5" cy="8" r=".9"/></svg>';
        more.onclick = e => {
          e.stopPropagation();
          listMenu(tab, l);
        };
        tab.append(more);
      }
      return tab;
    })
  );
  ui.tabList.querySelector('.active')?.scrollIntoView({ inline: 'nearest' });
}

function listMenu(tab: HTMLElement, list: List) {
  document.querySelector('.menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.innerHTML = '<button data-action="rename">Renombrar lista</button><hr><button data-action="delete" class="danger">Eliminar lista</button>';
  const close = () => {
    menu.remove();
    document.removeEventListener('pointerdown', outside, true);
  };
  const outside = (e: PointerEvent) => !menu.contains(e.target as Node) && close();
  menu.onclick = e => {
    const action = (e.target as Element).closest('button')?.dataset.action;
    if (!action) return;
    close();
    if (action === 'rename') editListName(tab, list);
    if (action === 'delete' && confirm(`¿Eliminar la lista "${list.name}" y todo su contenido?`)) removeList(list.id);
  };
  const r = tab.getBoundingClientRect();
  menu.style.left = `${Math.min(r.left, innerWidth - 180)}px`;
  menu.style.top = `${r.bottom + 4}px`;
  document.body.append(menu);
  document.addEventListener('pointerdown', outside, true);
}

function removeList(id: string) {
  if (data.lists.length === 1) return alert('No se puede borrar la única lista');
  data.lists = data.lists.filter(l => l.id !== id);
  data.blocks = data.blocks.filter(b => b.listId !== id);
  send('removeList', id);
  render();
}

function inlineListInput(value: string, onDone: (name: string | null) => void) {
  const input = document.createElement('input');
  input.className = 'tab-input';
  input.value = value;
  input.maxLength = 40;
  let finished = false;
  const finish = (save: boolean) => {
    if (finished) return;
    finished = true;
    editingTab = false;
    const name = input.value.trim();
    onDone(save && name ? name : null);
    if (pendingRender) render();
  };
  input.onkeydown = e => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  };
  input.onblur = () => finish(true);
  editingTab = true;
  return input;
}

function editListName(tab: HTMLElement, list: List) {
  const input = inlineListInput(list.name, name => {
    if (name && name !== list.name) {
      list.name = name;
      send('renameList', list.id, name);
    }
    renderTabs();
  });
  tab.replaceWith(input);
  input.select();
}

function newList() {
  flushText();
  const input = inlineListInput('', name => {
    if (!name) return renderTabs();
    let list = data.lists.find(l => l.name.toLowerCase() === name.toLowerCase());
    if (!list) {
      list = { id: crypto.randomUUID(), name };
      data.lists.push(list);
      send('addList', name, list.id);
    }
    activeListId = list.id;
    render();
    focusEnd();
  });
  input.placeholder = 'Nombre de la lista';
  ui.tabList.append(input);
  input.focus();
}

function renderPage(list: List) {
  let blocks = pageBlocks(list.id);
  if (!blocks.length) {
    const block = newBlock(list.id);
    data.blocks.push(block);
    send('insertBlocks', list.id, null, [block]);
    blocks = [block];
  }
  const keep = new Set(blocks.map(b => b.id));
  for (const [id, el] of nodes) {
    if (keep.has(id)) continue;
    el.remove();
    nodes.delete(id);
    dirty.delete(id);
  }
  blocks.forEach((b, i) => {
    const el = blockEl(b);
    if (ui.page.children[i] !== el) ui.page.insertBefore(el, ui.page.children[i] || null);
  });
  updateToolbar();
}

function blockEl(b: Block) {
  let el = nodes.get(b.id);
  if (!el) {
    el = ui.template.content.firstElementChild!.cloneNode(true) as HTMLElement;
    el.dataset.id = b.id;
    bindBlock(el);
    nodes.set(b.id, el);
  }
  el.dataset.type = b.type;
  el.classList.toggle('done', !!b.done);
  el.classList.toggle('important', !!b.important);
  el.querySelector<HTMLElement>('.check')!.title = b.done ? 'Marcar como pendiente (Ctrl+Enter)' : 'Completar (Ctrl+Enter)';
  const line = lineOf(el);
  if (document.activeElement !== line && !dirty.has(b.id) && toMarkup(line) !== b.text) line.innerHTML = toHtml(b.text);
  updateEmpty(el);
  return el;
}

function updateEmpty(el: Element) {
  const line = lineOf(el);
  const empty = !line.textContent;
  if (empty && line.innerHTML) line.innerHTML = '';
  el.classList.toggle('empty', empty);
}

function createBlocks(listId: string, afterId: string | null, props: BlockProps[]) {
  const blocks = props.map(p => newBlock(listId, p));
  data.blocks.splice(insertIndex(data, listId, afterId), 0, ...blocks);
  send('insertBlocks', listId, afterId, blocks);
  renderPage(activeList()!);
  return blocks;
}

function update(id: string, changes: BlockChanges) {
  const block = byId(id);
  if (!block) return;
  if ('text' in changes) dirty.delete(id);
  applyChanges(block, changes);
  send('updateBlock', id, changes);
  blockEl(block);
  renderTabs();
  updateToolbar();
}

function removeBlock(id: string) {
  dirty.delete(id);
  data.blocks = data.blocks.filter(b => b.id !== id);
  send('removeBlock', id);
  renderPage(activeList()!);
  renderTabs();
}

function toggleDone(id: string) {
  const block = byId(id);
  if (block?.type !== 'todo') return;
  update(id, { done: !block.done });
  const el = nodes.get(id)!;
  if (block.done && !reducedMotion.matches) {
    el.classList.remove('just-done');
    void el.offsetWidth;
    el.classList.add('just-done');
  }
}

function rangeToCaret(line: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(line);
  const sel = getSelection()!;
  if (sel.rangeCount && line.contains(sel.anchorNode)) {
    const r = sel.getRangeAt(0);
    range.setEnd(r.startContainer, r.startOffset);
  }
  return range;
}

const caretOffset = (line: HTMLElement) => rangeToCaret(line).toString().length;
const collapsed = () => getSelection()!.isCollapsed;

function setCaret(line: HTMLElement | null | undefined, offset = 0) {
  if (!line) return;
  line.focus();
  const range = document.createRange();
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (offset <= node.length) {
      range.setStart(node, offset);
      break;
    }
    offset -= node.length;
  }
  if (!node) {
    range.selectNodeContents(line);
    range.collapse(false);
  }
  const sel = getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

function focusEnd() {
  const last = ui.page.lastElementChild;
  if (last) setCaret(lineOf(last), Infinity);
}

function splitBlock(el: HTMLElement) {
  flushText();
  const id = el.dataset.id!;
  const block = byId(id)!;
  const line = lineOf(el);
  if (!line.textContent && block.type !== 'text') return update(id, { type: 'text' });
  const range = getSelection()!.getRangeAt(0);
  range.deleteContents();
  if (caretOffset(line) === 0 && line.textContent) {
    createBlocks(block.listId, (el.previousElementSibling as HTMLElement | null)?.dataset.id ?? null, [{ type: block.type }]);
    return setCaret(line, 0);
  }
  const tail = document.createRange();
  tail.selectNodeContents(line);
  tail.setStart(range.startContainer, range.startOffset);
  const rest = toMarkup(tail.extractContents());
  updateEmpty(el);
  update(id, { text: toMarkup(line) });
  const [created] = createBlocks(block.listId, id, [{ type: block.type, text: rest }]);
  setCaret(lineOf(created.id), 0);
}

function mergeInto(target: HTMLElement, source: HTMLElement) {
  const line = lineOf(target);
  const offset = line.textContent.length;
  line.append(...lineOf(source).childNodes);
  updateEmpty(target);
  update(target.dataset.id!, { text: toMarkup(line) });
  removeBlock(source.dataset.id!);
  setCaret(line, offset);
}

function backspaceAtStart(el: HTMLElement) {
  flushText();
  const block = byId(el.dataset.id!)!;
  if (block.type !== 'text') return update(block.id, { type: 'text' });
  const prev = el.previousElementSibling as HTMLElement | null;
  if (prev) mergeInto(prev, el);
}

function deleteAtEnd(el: HTMLElement) {
  flushText();
  const next = el.nextElementSibling as HTMLElement | null;
  if (next) mergeInto(el, next);
}

function caretRect(line: HTMLElement) {
  const range = getSelection()!.getRangeAt(0).cloneRange();
  range.collapse(true);
  return range.getClientRects()[0] || line.getBoundingClientRect();
}

function moveVertical(el: HTMLElement, dir: number, e: KeyboardEvent) {
  const line = lineOf(el);
  const target = lineOf(dir < 0 ? el.previousElementSibling : el.nextElementSibling);
  if (!target) return;
  const r = caretRect(line);
  const box = line.getBoundingClientRect();
  const lineHeight = parseFloat(getComputedStyle(line).lineHeight) || 20;
  const onEdge = dir < 0 ? r.top - box.top < lineHeight * 0.75 : box.bottom - r.bottom < lineHeight * 0.75;
  if (!onEdge) return;
  e.preventDefault();
  const t = target.getBoundingClientRect();
  const x = Math.min(Math.max(r.left, t.left), t.right - 1);
  const y = dir < 0 ? t.bottom - lineHeight / 2 : t.top + lineHeight / 2;
  const pos = document.caretRangeFromPoint?.(x, y);
  target.focus();
  if (pos && target.contains(pos.startContainer)) {
    const sel = getSelection()!;
    sel.removeAllRanges();
    sel.addRange(pos);
  } else setCaret(target, dir < 0 ? Infinity : 0);
}

const SHORTCUTS: [RegExp, BlockChanges][] = [
  [/^\[ ?\] $/, { type: 'todo' }],
  [/^\[[xX]\] $/, { type: 'todo', done: true }],
  [/^[-*•] $/, { type: 'bullet' }],
  [/^\d+[.)] $/, { type: 'number' }],
  [/^> $/, { type: 'quote' }],
];

function markdownShortcut(el: HTMLElement) {
  if (byId(el.dataset.id!)?.type !== 'text') return false;
  const line = lineOf(el);
  const before = rangeToCaret(line);
  const typed = before.toString().replace(/ /g, ' ');
  const hit = SHORTCUTS.find(([re]) => re.test(typed));
  if (!hit) return false;
  before.deleteContents();
  updateEmpty(el);
  update(el.dataset.id!, { ...hit[1], text: toMarkup(line) });
  setCaret(line, 0);
  return true;
}

function paste(el: HTMLElement, e: ClipboardEvent) {
  e.preventDefault();
  const raw = e.clipboardData!.getData('text/plain').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!raw) return;
  const line = lineOf(el);
  const parsed = fromWhatsApp(raw);
  if (parsed.length === 1 && (parsed[0].type === 'text' || line.textContent)) {
    document.execCommand('insertText', false, raw);
    return;
  }
  flushText();
  const id = el.dataset.id!;
  const block = byId(id)!;
  const range = getSelection()!.getRangeAt(0);
  range.deleteContents();
  const tailRange = document.createRange();
  tailRange.selectNodeContents(line);
  tailRange.setStart(range.startContainer, range.startOffset);
  const tailFragment = tailRange.extractContents();
  const tailLength = tailFragment.textContent.length;
  parsed.at(-1)!.text += toMarkup(tailFragment);
  const [first, ...rest] = parsed;
  const text = toMarkup(line) + first.text;
  const changes = !line.textContent && block.type === 'text' ? { ...first, text } : { text };
  line.innerHTML = toHtml(text);
  updateEmpty(el);
  update(id, changes);
  const created = createBlocks(block.listId, id, rest);
  const target = created.length ? lineOf(created.at(-1)!.id)! : line;
  setCaret(target, target.textContent.length - tailLength);
}

function toggleCode() {
  const line = document.activeElement as HTMLElement | null;
  if (!line?.classList.contains('line')) return;
  const sel = getSelection()!;
  const range = sel.getRangeAt(0);
  const start = range.startContainer;
  const code = (start.nodeType === Node.ELEMENT_NODE ? (start as Element) : start.parentElement!).closest('code, tt');
  if (code && line.contains(code)) code.replaceWith(...code.childNodes);
  else if (!range.collapsed) {
    const el = document.createElement('code');
    el.textContent = range.extractContents().textContent;
    range.insertNode(el);
    sel.selectAllChildren(el);
  }
  markDirty(line.parentElement!.dataset.id!);
}

function format(cmd: string) {
  if (!document.activeElement?.classList.contains('line')) return;
  if (cmd === 'code') toggleCode();
  else document.execCommand(cmd);
  updateToolbar();
}

let lastBlockId = '';

function currentBlockEl() {
  return document.activeElement?.closest?.<HTMLElement>('.block') || nodes.get(lastBlockId) || (ui.page.lastElementChild as HTMLElement | null);
}

function setType(type: BlockType) {
  const el = currentBlockEl();
  if (!el) return;
  flushText();
  const block = byId(el.dataset.id!)!;
  const line = lineOf(el);
  const hadFocus = document.activeElement === line;
  const offset = hadFocus ? caretOffset(line) : Infinity;
  update(block.id, { type: block.type === type ? 'text' : type });
  setCaret(line, offset);
}

const FORMAT_TAGS: Record<string, string> = { code: 'code, tt', strikeThrough: 's, strike, del' };

function updateToolbar() {
  const el = document.activeElement?.closest?.<HTMLElement>('.block');
  const type = el && byId(el.dataset.id!)?.type;
  for (const btn of ui.toolbar.querySelectorAll<HTMLElement>('[data-cmd]')) {
    const cmd = btn.dataset.cmd!;
    const tags = FORMAT_TAGS[cmd];
    const node = getSelection()!.anchorNode;
    const inTag = () => !!(node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement)?.closest(tags);
    btn.classList.toggle('on', !!el && (tags ? inTag() : document.queryCommandState(cmd)));
  }
  for (const btn of ui.toolbar.querySelectorAll<HTMLElement>('[data-block]')) btn.classList.toggle('on', btn.dataset.block === type);
}

function onKeyDown(el: HTMLElement, e: KeyboardEvent) {
  const ctrl = e.ctrlKey || e.metaKey;
  const line = lineOf(el);
  if (e.isComposing) return;
  if (ctrl && e.shiftKey && ['Digit7', 'Digit8', 'Digit9'].includes(e.code)) {
    e.preventDefault();
    return setType(({ Digit7: 'number', Digit8: 'bullet', Digit9: 'todo' } as Record<string, BlockType>)[e.code]);
  }
  if (ctrl && e.shiftKey && e.code === 'KeyX') {
    e.preventDefault();
    return format('strikeThrough');
  }
  if (ctrl && !e.shiftKey && e.code === 'KeyE') {
    e.preventDefault();
    return format('code');
  }
  if (ctrl && !e.shiftKey && e.code === 'KeyU') return e.preventDefault();
  if (ctrl && e.key === 'Enter') {
    e.preventDefault();
    return toggleDone(el.dataset.id!);
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    return splitBlock(el);
  }
  if (e.key === 'Backspace' && collapsed() && caretOffset(line) === 0) {
    e.preventDefault();
    return backspaceAtStart(el);
  }
  if (e.key === 'Delete' && collapsed() && caretOffset(line) === line.textContent.length) {
    e.preventDefault();
    return deleteAtEnd(el);
  }
  if (e.shiftKey || ctrl || e.altKey) return;
  if (e.key === 'ArrowUp') moveVertical(el, -1, e);
  if (e.key === 'ArrowDown') moveVertical(el, 1, e);
  if (e.key === 'ArrowLeft' && collapsed() && caretOffset(line) === 0 && el.previousElementSibling) {
    e.preventDefault();
    setCaret(lineOf(el.previousElementSibling), Infinity);
  }
  if (e.key === 'ArrowRight' && collapsed() && caretOffset(line) === line.textContent.length && el.nextElementSibling) {
    e.preventDefault();
    setCaret(lineOf(el.nextElementSibling), 0);
  }
}

function bindBlock(el: HTMLElement) {
  const id = el.dataset.id!;
  const line = lineOf(el);
  for (const btn of el.querySelectorAll('button')) btn.onmousedown = e => e.preventDefault();
  el.querySelector<HTMLElement>('.check')!.onclick = () => toggleDone(id);
  el.querySelector<HTMLElement>('.star')!.onclick = () => update(id, { important: !byId(id)?.important });
  el.querySelector<HTMLElement>('.delete')!.onclick = () => {
    const next = el.nextElementSibling || el.previousElementSibling;
    removeBlock(id);
    if (next?.isConnected) setCaret(lineOf(next), Infinity);
  };
  el.onmousedown = e => {
    if (e.target !== el && !(e.target as Element).classList.contains('marker')) return;
    e.preventDefault();
    setCaret(line, Infinity);
  };
  line.addEventListener('keydown', e => onKeyDown(el, e));
  line.addEventListener('beforeinput', e => {
    if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
      e.preventDefault();
      splitBlock(el);
    } else if (e.inputType === 'deleteContentBackward' && collapsed() && caretOffset(line) === 0) {
      e.preventDefault();
      backspaceAtStart(el);
    }
  });
  line.addEventListener('input', e => {
    const { inputType, data } = e as InputEvent;
    updateEmpty(el);
    if (inputType === 'insertText' && data === ' ' && markdownShortcut(el)) return;
    markDirty(id);
  });
  line.addEventListener('paste', e => paste(el, e));
  line.addEventListener('drop', e => e.dataTransfer!.files.length && e.preventDefault());
  line.addEventListener('focus', () => {
    lastBlockId = id;
    updateToolbar();
  });
  line.addEventListener('blur', () => {
    flushText();
    if (!document.hasFocus() || !line.isConnected) return;
    const html = toHtml(toMarkup(line));
    if (line.innerHTML !== html) line.innerHTML = html;
    const block = byId(id);
    if (block) blockEl(block);
    updateToolbar();
  });
}

ui.content.addEventListener('mousedown', e => {
  if (e.target !== ui.content && e.target !== ui.page) return;
  const last = ui.page.lastElementChild as HTMLElement | null;
  if (!last || e.clientY < last.getBoundingClientRect().bottom) return;
  e.preventDefault();
  const block = byId(last.dataset.id!);
  if (block?.type === 'text' && !lineOf(last).textContent) return setCaret(lineOf(last), 0);
  const [created] = createBlocks(activeList()!.id, last.dataset.id!, [{}]);
  setCaret(lineOf(created.id), 0);
});

for (const btn of ui.toolbar.querySelectorAll('button')) btn.onmousedown = e => e.preventDefault();
for (const btn of ui.toolbar.querySelectorAll<HTMLElement>('[data-cmd]')) btn.onclick = () => format(btn.dataset.cmd!);
for (const btn of ui.toolbar.querySelectorAll<HTMLElement>('[data-block]')) btn.onclick = () => setType(btn.dataset.block as BlockType);

let copiedTimer: ReturnType<typeof setTimeout> | undefined;
async function copyPage() {
  flushText();
  await navigator.clipboard.writeText(toWhatsApp(pageBlocks(activeList()!.id)));
  ui.copy.classList.add('copied');
  ui.copy.querySelector('.copy-label')!.textContent = 'Copiado';
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    ui.copy.classList.remove('copied');
    ui.copy.querySelector('.copy-label')!.textContent = 'Copiar';
  }, 1600);
}

ui.copy.onclick = copyPage;
document.addEventListener('selectionchange', updateToolbar);

$('new-list').onclick = newList;

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyC') {
    e.preventDefault();
    copyPage();
  }
});

window.addEventListener('pagehide', flushText);
document.addEventListener('visibilitychange', () => (document.hidden ? flushText() : refresh()));
window.addEventListener('online', refresh);
setInterval(refresh, POLL_MS);

if (data.lists.length) {
  render();
  if (matchMedia('(hover: hover)').matches) focusEnd();
}

export async function start(backend: Api) {
  api = backend;
  const fresh = !ui.page.childElementCount;
  await refresh();
  if (fresh && matchMedia('(hover: hover)').matches) focusEnd();
}
