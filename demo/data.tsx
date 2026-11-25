import type { Column } from '../src';

/** One generated demo record. */
export type DemoRow = {
  id: number;
  name: string;
  notes: string;
  amount: number;
  created: Date;
  status: string;
  tags: string[];
  email?: string;
};

const FIRST = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elena', 'Filipe', 'Grace', 'Hugo', 'Inês', 'João', 'Kai', 'Lena', 'Marta', 'Nuno', 'Olga', 'Paulo'];
const LAST = ['Almeida', 'Barros', 'Costa', 'Duarte', 'Esteves', 'Fonseca', 'Gomes', 'Henriques', 'Lopes', 'Moreira', 'Nogueira', 'Pereira'];
const WORDS = (
  'invoice follow up call scheduled customer asked about renewal pricing shipment delayed warehouse ' +
  'address updated contract signed waiting approval escalated to support refund issued ticket closed ' +
  'quarterly review notes migrated from legacy system pending documents verified identity reminder sent'
).split(' ');
const STATUSES = ['Active', 'Pending', 'Archived', 'Blocked'];
const TAGS = ['billing', 'support', 'urgent', 'vip', 'legacy', 'beta'];
const DAY_MS = 86_400_000;
const FIRST_DAY = new Date(2020, 0, 1).getTime();

/** Deterministic pseudo-random numbers in [0, 1) from a seed (mulberry32). */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

/** Text of 5 to 400 characters; cubing the draw makes short notes common and long ones rare. */
function notes(random: () => number): string {
  const target = 5 + Math.floor(random() ** 3 * 395);
  let text = pick(random, WORDS);
  while (text.length < target) text += ` ${pick(random, WORDS)}`;
  return text.slice(0, target);
}

function tags(random: () => number): string[] {
  return TAGS.filter(() => random() < 0.2);
}

function makeRow(random: () => number, id: number): DemoRow {
  const first = pick(random, FIRST);
  const last = pick(random, LAST);
  const row: DemoRow = {
    id,
    name: `${first} ${last}`,
    notes: notes(random),
    amount: Math.round(random() * 1_000_000) / 100,
    created: new Date(FIRST_DAY + Math.floor(random() * 2_520) * DAY_MS),
    status: pick(random, STATUSES),
    tags: tags(random),
  };
  if (random() < 0.6) row.email = `${first}.${last}${id}@example.com`.toLowerCase();
  return row;
}

/** `count` rows, identical for the same `seed`. */
export function generateRows(count: number, seed: number): DemoRow[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, (_, index) => makeRow(random, index + 1));
}

const CURRENCY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const options = (values: readonly string[]) => values.map((value) => ({ value, label: value }));

/** Demo columns, one per filter type. Module-level, so their identity is stable. */
export const COLUMNS: Column<DemoRow>[] = [
  { key: 'id', header: 'ID', width: 70, align: 'right' },
  { key: 'name', header: 'Name', width: 160, filter: { type: 'text', placeholder: 'Contains…' } },
  { key: 'notes', header: 'Notes', minWidth: 220, filter: { type: 'text', op: 'contains' } },
  {
    key: 'amount',
    header: (
      <span>
        Amount <small>(USD)</small>
      </span>
    ),
    headerText: 'Amount (USD)',
    width: 130,
    align: 'right',
    render: ({ value }) => CURRENCY.format(value as number),
    filter: { type: 'number', op: 'range' },
  },
  { key: 'created', header: 'Created', width: 110, filter: { type: 'date', op: 'range' } },
  { key: 'status', header: 'Status', width: 100, align: 'center', filter: { type: 'select', options: options(STATUSES) } },
  {
    key: 'tags',
    header: 'Tags',
    width: 170,
    sortable: false,
    render: ({ row }) => row.tags.map((tag) => <span key={tag} className="demo-tag">{tag}</span>),
    filter: { type: 'multiselect', options: options(TAGS) },
  },
  { key: 'email', header: 'Email', width: 220, filter: { type: 'notEmpty' } },
];
