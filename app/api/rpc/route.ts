import { withUser } from '@/lib/auth';
import * as store from '@/lib/store';

const METHODS = ['addTask', 'addNote', 'updateTask', 'removeTask', 'insertBlocks', 'updateBlock', 'removeBlock', 'addList', 'renameList', 'removeList'] as const;

type Method = (typeof METHODS)[number];

export const POST = async (request: Request) => {
  const { method, args = [] } = await request.json().catch(() => ({}));
  return withUser(async userId => {
    if (!METHODS.includes(method)) throw new Error(`Método no permitido: ${method}`);
    const fn = store[method as Method] as (userId: string, ...args: unknown[]) => Promise<unknown>;
    const result = await fn(userId, ...args);
    const { lists, blocks } = await store.load(userId);
    return { result: result ?? null, data: { lists, blocks } };
  });
};
