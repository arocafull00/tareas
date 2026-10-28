import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { BlockType } from '../lib/shared';

export const lists = pgTable(
  'lists',
  {
    id: uuid('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    position: text('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  t => [index('lists_user_idx').on(t.userId, t.position)]
);

export const blocks = pgTable(
  'blocks',
  {
    id: uuid('id').primaryKey(),
    userId: text('user_id').notNull(),
    listId: uuid('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    type: text('type').$type<BlockType>().notNull().default('text'),
    text: text('text').notNull().default(''),
    done: boolean('done'),
    important: boolean('important'),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    position: text('position').notNull(),
  },
  t => [index('blocks_user_idx').on(t.userId), index('blocks_list_idx').on(t.listId, t.position)]
);
