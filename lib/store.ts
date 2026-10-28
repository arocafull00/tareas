import { and, asc, eq } from 'drizzle-orm';
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { db, schema } from '../db';
import { applyChanges, newBlock } from './shared';
import type { Block, BlockChanges, BlockProps, Data, List } from './shared';

const { lists, blocks } = schema;
const DEFAULT_LIST = 'Tareas';

type Row = typeof blocks.$inferSelect;
type Loaded = Data & { rows: Row[] };

const byPosition = (a: Row, b: Row) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0);

function toBlock(row: Row): Block {
  const { userId, position, done, important, completedAt, ...block } = row;
  return block.type === 'todo' ? { ...block, done: !!done, important: !!important, completedAt } : block;
}

function toRow(block: Block, userId: string) {
  return {
    id: block.id,
    userId,
    listId: block.listId,
    type: block.type,
    text: block.text,
    done: block.done ?? null,
    important: block.important ?? null,
    completedAt: block.completedAt ?? null,
    createdAt: block.createdAt,
  };
}

async function read(userId: string) {
  const [listRows, blockRows] = await Promise.all([
    db.select().from(lists).where(eq(lists.userId, userId)).orderBy(asc(lists.position)),
    db.select().from(blocks).where(eq(blocks.userId, userId)).orderBy(asc(blocks.position)),
  ]);
  const order = new Map(listRows.map((l, i) => [l.id, i]));
  blockRows.sort((a, b) => order.get(a.listId)! - order.get(b.listId)! || byPosition(a, b));
  return { listRows, blockRows };
}

async function seed(userId: string) {
  const list = { id: crypto.randomUUID(), userId, name: DEFAULT_LIST, position: generateKeyBetween(null, null) };
  await db.insert(lists).values(list);
  await db.insert(blocks).values({ ...toRow(newBlock(list.id), userId), position: generateKeyBetween(null, null) });
}

export async function load(userId: string): Promise<Loaded> {
  let { listRows, blockRows } = await read(userId);
  if (!listRows.length) {
    await seed(userId);
    ({ listRows, blockRows } = await read(userId));
  }
  return {
    lists: listRows.map(({ id, name }) => ({ id, name })),
    blocks: blockRows.map(toBlock),
    rows: blockRows,
  };
}

export function findList(data: Data, ref?: string | null): List {
  if (!ref) return data.lists.find(l => l.name === DEFAULT_LIST) || data.lists[0];
  const q = String(ref).trim().toLowerCase();
  const list = data.lists.find(l => l.id === ref) || data.lists.find(l => l.name.toLowerCase() === q);
  if (!list) throw new Error(`No existe la lista "${ref}". Listas: ${data.lists.map(l => l.name).join(', ')}`);
  return list;
}

function findTask(data: Data, ref: string, listRef?: string): Block {
  const r = String(ref).trim();
  const todos = data.blocks.filter(b => b.type === 'todo');
  const byId = todos.find(t => t.id === r);
  if (byId) return byId;
  const scope = listRef ? todos.filter(t => t.listId === findList(data, listRef).id) : todos;
  if (/^\d+$/.test(r)) {
    const pending = scope.filter(t => !t.done);
    const byIndex = pending[Number(r) - 1];
    if (byIndex) return byIndex;
  }
  const q = r.toLowerCase();
  const exact = scope.filter(t => t.text.toLowerCase() === q);
  if (exact.length === 1) return exact[0];
  const matches = scope.filter(t => t.text.toLowerCase().includes(q));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`"${r}" coincide con varias tareas: ${matches.map(t => t.text).join(' | ')}`);
  throw new Error(`No encuentro la tarea "${r}"`);
}

function positionsAfter(data: Loaded, listId: string, afterId: string | null, n: number) {
  const page = data.rows.filter(r => r.listId === listId);
  const i = afterId ? page.findIndex(r => r.id === afterId) : -1;
  const prev = i >= 0 ? page[i] : afterId ? page.at(-1) : null;
  const next = i >= 0 ? page[i + 1] : afterId ? null : page[0];
  return generateNKeysBetween(prev?.position ?? null, next?.position ?? null, n);
}

async function insertInto(userId: string, data: Loaded, list: List, afterId: string | null, props: BlockProps[]) {
  const created = props.map(p => {
    const block = newBlock(list.id, p);
    if (p.createdAt) block.createdAt = p.createdAt;
    if (block.type === 'todo' && p.completedAt !== undefined) block.completedAt = p.completedAt;
    return block;
  });
  if (!created.length) return created;
  const keys = positionsAfter(data, list.id, afterId, created.length);
  await db
    .insert(blocks)
    .values(created.map((b, i) => ({ ...toRow(b, userId), position: keys[i] })))
    .onConflictDoNothing();
  return created;
}

async function saveBlock(userId: string, block: Block) {
  const { id, userId: _, listId, createdAt, ...changes } = toRow(block, userId);
  await db.update(blocks).set(changes).where(and(eq(blocks.id, block.id), eq(blocks.userId, userId)));
  return block;
}

async function appendBlock(userId: string, listRef: string | undefined, props: BlockProps) {
  const data = await load(userId);
  const list = findList(data, listRef);
  const page = data.blocks.filter(b => b.listId === list.id);
  const after = (props.type === 'todo' && page.findLast(b => b.type === 'todo')) || page.findLast(b => b.text.trim());
  const [block] = await insertInto(userId, data, list, after?.id ?? null, [props]);
  return block;
}

export const addTask = (userId: string, title: string, { list, important = false }: { list?: string; important?: boolean } = {}) =>
  appendBlock(userId, list, { type: 'todo', text: String(title).trim(), important });

export const addNote = (userId: string, text: string, { list }: { list?: string } = {}) => appendBlock(userId, list, { text: String(text).trim() });

export async function updateTask(userId: string, ref: string, changes: BlockChanges, listRef?: string) {
  const task = findTask(await load(userId), ref, listRef);
  return saveBlock(userId, applyChanges(task, changes));
}

export async function removeTask(userId: string, ref: string, listRef?: string) {
  const task = findTask(await load(userId), ref, listRef);
  await db.delete(blocks).where(and(eq(blocks.id, task.id), eq(blocks.userId, userId)));
  return task;
}

export async function insertBlocks(userId: string, listRef: string, afterId: string | null, props: BlockProps[]) {
  const data = await load(userId);
  return insertInto(userId, data, findList(data, listRef), afterId, props);
}

export async function updateBlock(userId: string, id: string, changes: BlockChanges) {
  const [row] = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, id), eq(blocks.userId, userId)));
  return row ? saveBlock(userId, applyChanges(toBlock(row), changes)) : null;
}

export async function removeBlock(userId: string, id: string) {
  await db.delete(blocks).where(and(eq(blocks.id, id), eq(blocks.userId, userId)));
}

export async function addList(userId: string, name: string, id?: string): Promise<List> {
  const { listRows } = await read(userId);
  const existing = listRows.find(l => l.name.toLowerCase() === name.trim().toLowerCase());
  if (existing) return { id: existing.id, name: existing.name };
  const list = { id: id || crypto.randomUUID(), name: name.trim() };
  await db
    .insert(lists)
    .values({ ...list, userId, position: generateKeyBetween(listRows.at(-1)?.position ?? null, null) })
    .onConflictDoNothing();
  return list;
}

export async function renameList(userId: string, ref: string, name: string) {
  const list = findList(await load(userId), ref);
  list.name = name.trim();
  await db.update(lists).set({ name: list.name }).where(and(eq(lists.id, list.id), eq(lists.userId, userId)));
  return list;
}

export async function removeList(userId: string, ref: string) {
  const data = await load(userId);
  if (data.lists.length === 1) throw new Error('No se puede borrar la única lista');
  const list = findList(data, ref);
  await db.delete(lists).where(and(eq(lists.id, list.id), eq(lists.userId, userId)));
  return list;
}
