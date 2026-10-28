#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { toWhatsApp } from './lib/shared.ts';
import type { Block, BlockChanges, Data, List } from './lib/shared.ts';

const CONFIG_FILE = path.join(os.homedir(), '.tareas.json');
const LEGACY_FILE = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'Tareas', 'tareas.json');

const USAGE = `Uso:
  node cli.ts login <url> <api-key>
  node cli.ts add "texto" [--lista NOMBRE] [--importante]
  node cli.ts note "texto" [--lista NOMBRE]
  node cli.ts show [--lista NOMBRE]
  node cli.ts list [--lista NOMBRE] [--todas]
  node cli.ts done <n|texto|id> [--lista NOMBRE]
  node cli.ts undone <n|texto|id> [--lista NOMBRE]
  node cli.ts star <n|texto|id> [--lista NOMBRE]
  node cli.ts unstar <n|texto|id> [--lista NOMBRE]
  node cli.ts rename <n|texto|id> "nuevo texto" [--lista NOMBRE]
  node cli.ts rm <n|texto|id> [--lista NOMBRE]
  node cli.ts lists
  node cli.ts new-list NOMBRE
  node cli.ts import [ruta-a-tareas.json]

<n> es el número de la tarea pendiente tal y como lo muestra "list".`;

interface Flags {
  lista?: string;
  importante?: boolean;
  todas?: boolean;
}

function parse(argv: string[]) {
  const args: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lista' || a === '-l') flags.lista = argv[++i];
    else if (a === '--importante' || a === '-i') flags.importante = true;
    else if (a === '--todas' || a === '-a') flags.todas = true;
    else args.push(a);
  }
  return { args, flags };
}

function config() {
  let saved: { url?: string; token?: string } = {};
  try {
    saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {}
  const url = process.env.TAREAS_URL || saved.url;
  const token = process.env.TAREAS_TOKEN || saved.token;
  if (!url || !token) throw new Error('Falta configurar la conexión: node cli.ts login <url> <api-key>');
  return { url: url.replace(/\/+$/, ''), token };
}

async function request<T>(route: string, body?: unknown): Promise<T> {
  const { url, token } = config();
  const res = await fetch(url + route, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `${res.status} ${res.statusText}`);
  return json;
}

const load = () => request<Data>('/api/data');
const call = async <T = Block>(method: string, ...args: unknown[]) => (await request<{ result: T }>('/api/rpc', { method, args })).result;

function findList(data: Data, ref?: string): List {
  if (!ref) return data.lists.find(l => l.name === 'Tareas') || data.lists[0];
  const q = String(ref).trim().toLowerCase();
  const list = data.lists.find(l => l.id === ref) || data.lists.find(l => l.name.toLowerCase() === q);
  if (!list) throw new Error(`No existe la lista "${ref}". Listas: ${data.lists.map(l => l.name).join(', ')}`);
  return list;
}

function printList(list: List, data: Data, all?: boolean) {
  const tasks = data.blocks.filter(b => b.listId === list.id && b.type === 'todo');
  const pending = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done);
  console.log(`# ${list.name} (${pending.length} pendientes)`);
  pending.forEach((t, i) => console.log(`${i + 1}. [ ] ${t.important ? '★ ' : ''}${t.text}`));
  if (all && done.length) {
    console.log(`-- Completadas (${done.length})`);
    done.forEach(t => console.log(`   [x] ${t.text}`));
  }
}

async function importFile(file = LEGACY_FILE) {
  const source: Data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const current = await load();
  for (const list of source.lists) {
    const target = await call<List>('addList', list.name, list.id);
    const existing = new Set(current.blocks.map(b => b.id));
    const blocks = source.blocks.filter(b => b.listId === list.id && !existing.has(b.id));
    const page = current.blocks.filter(b => b.listId === target.id);
    const empty = page.length === 1 && page[0].type === 'text' && !page[0].text;
    if (blocks.length) await call('insertBlocks', target.id, page.at(-1)?.id ?? null, blocks);
    if (blocks.length && empty) await call('removeBlock', page[0].id);
    console.log(`${target.name}: ${blocks.length} bloques importados`);
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { args, flags } = parse(rest);
  const text = args.join(' ');

  switch (cmd) {
    case 'login': {
      const [url, token] = args;
      if (!url || !token) throw new Error('Uso: login <url> <api-key>');
      fs.writeFileSync(CONFIG_FILE, JSON.stringify({ url, token }, null, 2), { mode: 0o600 });
      const data = await load();
      console.log(`Conectado a ${url} (${data.lists.length} listas)`);
      break;
    }
    case 'add': {
      if (!text) throw new Error('Falta el texto de la tarea');
      const t = await call('addTask', text, { list: flags.lista, important: !!flags.importante });
      console.log(`Añadida: ${t.text}`);
      break;
    }
    case 'note': {
      if (!text) throw new Error('Falta el texto de la nota');
      const b = await call('addNote', text, { list: flags.lista });
      console.log(`Nota añadida: ${b.text}`);
      break;
    }
    case 'show': {
      const data = await load();
      const list = findList(data, flags.lista);
      console.log(toWhatsApp(data.blocks.filter(b => b.listId === list.id)));
      break;
    }
    case 'list':
    case 'ls': {
      const data = await load();
      const lists = flags.lista ? [findList(data, flags.lista)] : data.lists;
      lists.forEach((l, i) => {
        if (i) console.log('');
        printList(l, data, flags.todas);
      });
      break;
    }
    case 'done':
    case 'undone':
    case 'star':
    case 'unstar': {
      const changes: BlockChanges = { done: { done: true }, undone: { done: false }, star: { important: true }, unstar: { important: false } }[cmd];
      const t = await call('updateTask', text, changes, flags.lista);
      console.log(`${{ done: 'Completada', undone: 'Pendiente', star: 'Importante', unstar: 'Sin estrella' }[cmd]}: ${t.text}`);
      break;
    }
    case 'rename': {
      const [ref, ...title] = args;
      if (!ref || !title.length) throw new Error('Uso: rename <ref> "nuevo texto"');
      const t = await call('updateTask', ref, { text: title.join(' ').trim() }, flags.lista);
      console.log(`Renombrada: ${t.text}`);
      break;
    }
    case 'rm':
    case 'delete': {
      const t = await call('removeTask', text, flags.lista);
      console.log(`Borrada: ${t.text}`);
      break;
    }
    case 'lists':
      (await load()).lists.forEach(l => console.log(l.name));
      break;
    case 'new-list': {
      if (!text) throw new Error('Falta el nombre de la lista');
      console.log(`Lista: ${(await call<List>('addList', text)).name}`);
      break;
    }
    case 'import':
      await importFile(args[0]);
      break;
    default:
      console.log(USAGE);
      process.exitCode = cmd ? 1 : 0;
  }
}

main().catch((err: Error) => {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
});
