const BLOCK_TYPES = ['text', 'todo', 'bullet', 'number', 'quote'] as const;

type BlockType = (typeof BLOCK_TYPES)[number];

interface List {
  id: string;
  name: string;
}

interface Block {
  id: string;
  listId: string;
  type: BlockType;
  text: string;
  createdAt: string;
  done?: boolean;
  important?: boolean;
  completedAt?: string | null;
}

interface Data {
  lists: List[];
  blocks: Block[];
}

interface BlockChanges {
  type?: BlockType;
  text?: string;
  done?: boolean;
  important?: boolean;
}

interface BlockProps extends BlockChanges {
  id?: string;
  createdAt?: string;
  completedAt?: string | null;
}

const now = () => new Date().toISOString();

const isBlockType = (type: unknown): type is BlockType => BLOCK_TYPES.includes(type as BlockType);

function applyChanges(block: Block, { type, text, done, important }: BlockChanges): Block {
  if (isBlockType(type) && type !== block.type) {
    block.type = type;
    if (type === 'todo') Object.assign(block, { done: false, important: false, completedAt: null });
    else {
      delete block.done;
      delete block.important;
      delete block.completedAt;
    }
  }
  if (typeof text === 'string') block.text = text;
  if (block.type !== 'todo') return block;
  if (typeof done === 'boolean' && done !== block.done) {
    block.done = done;
    block.completedAt = done ? now() : null;
  }
  if (typeof important === 'boolean') block.important = important;
  return block;
}

function newBlock(listId: string, { id, type, text, done = false, important = false }: BlockProps = {}): Block {
  const block: Block = { id: id || crypto.randomUUID(), listId, type: 'text', text: String(text ?? ''), createdAt: now() };
  return applyChanges(block, { type, done, important });
}

function insertIndex(data: Data, listId: string, afterId?: string | null): number {
  if (afterId) {
    const i = data.blocks.findIndex(b => b.id === afterId);
    if (i >= 0) return i + 1;
  }
  const first = data.blocks.findIndex(b => b.listId === listId);
  return afterId || first < 0 ? data.blocks.length : first;
}

function toWhatsApp(blocks: Block[]): string {
  let n = 0;
  return blocks
    .map(b => {
      n = b.type === 'number' ? n + 1 : 0;
      const prefixes: Partial<Record<BlockType, string>> = { todo: b.done ? '✅ ' : '⬜ ', bullet: '- ', number: `${n}. `, quote: '> ' };
      const prefix = prefixes[b.type] || '';
      return (prefix + b.text + (b.type === 'todo' && b.important ? ' ⭐' : '')).trimEnd();
    })
    .join('\n')
    .replace(/^\n+|\n+$/g, '');
}

const LINE_PREFIXES: [RegExp, BlockChanges][] = [
  [/^\s*(?:[-*•]\s*)?(?:⬜|☐|◻️?|\[ ?\])\s*/u, { type: 'todo', done: false }],
  [/^\s*(?:[-*•]\s*)?(?:✅|☑️?|✔️?|\[[xX]\])\s*/u, { type: 'todo', done: true }],
  [/^\s*(?:[-•]|\*(?=\s))\s+/, { type: 'bullet' }],
  [/^\s*\d+[.)]\s+/, { type: 'number' }],
  [/^>\s?/, { type: 'quote' }],
];

function fromWhatsApp(text: string): (BlockChanges & { text: string })[] {
  return text.split('\n').map(line => {
    const hit = LINE_PREFIXES.find(([re]) => re.test(line));
    if (!hit) return { type: 'text', text: line };
    const block = { ...hit[1], text: line.replace(hit[0], '') };
    if (block.type === 'todo' && /\s*⭐$/u.test(block.text)) {
      block.important = true;
      block.text = block.text.replace(/\s*⭐$/u, '');
    }
    return block;
  });
}

export { BLOCK_TYPES, applyChanges, newBlock, insertIndex, toWhatsApp, fromWhatsApp };
export type { BlockType, List, Block, Data, BlockChanges, BlockProps };
