// Grocery list logic, kept free of UI so it can be tested (tests.html).
//
// Item lifecycle:
//   active  - on the list.
//   later   - "got it for now": parks in the "Ready to add back" section at the bottom of the list;
//             one tap puts it back. For staples you buy again and again.
//   history - "bought for good": hidden purchase log, cleared 60 days after checkoff.
// Delete is separate from both: for typos and duplicates, it leaves no history.
//
// Item doc (households/{hid}/groceries/{id}):
//   { name, qty, notes, categoryIds:[], storeIds:[], forIds:[memberId], status, sortOrder,
//     addedBy, notify, checkedBy, checkedAt, purgeAt, createdAt }
// Tag doc (households/{hid}/tags/{id}): { kind:'category'|'store', name, color, createdAt }

export const HISTORY_DAYS = 60;

/** Older items used `done: true` before statuses existed. */
export const statusOf = (g) => g.status || (g.done ? 'later' : 'active');

export const TAG_COLORS = [
  '#C2410C', '#B45309', '#A16207', '#4D7C0F', '#15803D', '#0F766E',
  '#0E7490', '#1D4ED8', '#4338CA', '#7E22CE', '#A21CAF', '#BE185D',
  '#78716C', '#475569',
];

export const SECTIONS = [
  ['none', 'No sections'], ['category', 'By category'], ['store', 'By store'], ['for', 'By person'],
];
export const SORTS = [['manual', 'My order'], ['name', 'Name'], ['recent', 'Recently added']];

const FIELD = { category: 'categoryIds', store: 'storeIds', for: 'forIds' };
export const idsOf = (g, kind) => g[FIELD[kind]] || [];

/** Filters (any-of within a kind, all-of across kinds) and search over name + notes. */
export function applyView(items, view) {
  const q = (view.search || '').trim().toLowerCase();
  const out = items.filter((g) => {
    for (const kind of ['category', 'store', 'for']) {
      const want = view.filters?.[kind] || [];
      if (want.length && !idsOf(g, kind).some((id) => want.includes(id))) return false;
    }
    if (q && !`${g.name} ${g.notes || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
  return sortItems(out, view.sort);
}

export function sortItems(items, sort) {
  const list = [...items];
  if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  else if (sort === 'recent') list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  else list.sort((a, b) => orderOf(a) - orderOf(b));
  return list;
}
const orderOf = (g) => (g.sortOrder ?? g.createdAt ?? 0);

/**
 * Group into sections. An item with several categories/stores/people appears under each of them,
 * then the rest under "Everything else".
 * sectionTags: [{ id, name, color }] in display order.
 */
export function sectionize(items, kind, sectionTags) {
  if (!kind || kind === 'none') return [{ key: 'all', title: null, items }];
  const out = [];
  for (const t of sectionTags) {
    const hit = items.filter((g) => idsOf(g, kind).includes(t.id));
    if (hit.length) out.push({ key: t.id, title: t.name, color: t.color, items: hit });
  }
  const known = new Set(sectionTags.map((t) => t.id));
  const rest = items.filter((g) => !idsOf(g, kind).some((id) => known.has(id)));
  if (rest.length) out.push({ key: 'rest', title: out.length ? 'Everything else' : 'Everything', color: null, items: rest });
  return out;
}

export const nextSortOrder = (items) => items.reduce((m, g) => Math.max(m, orderOf(g)), 0) + 1000;

/** New sortOrder for an item dropped at `to` within `visible` (indexes before the move). */
export function orderAfterMove(visible, from, to) {
  if (from === to) return null;
  const list = [...visible];
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  const prev = list[to - 1], next = list[to + 1];
  if (prev && next) return (orderOf(prev) + orderOf(next)) / 2;
  if (prev) return orderOf(prev) + 1000;
  if (next) return orderOf(next) - 1000;
  return null;
}

/** "Bump the quantity" for a duplicate: add leading numbers when there are any, best effort otherwise. */
export function bumpQty(current, adding) {
  const lead = (s) => { const m = String(s || '').match(/^\s*(\d+)/); return m ? Number(m[1]) : null; };
  const add = lead(adding) ?? 1;
  const cur = String(current || '').trim();
  const n = lead(cur);
  if (n !== null) return `${n + add}${cur.replace(/^\s*\d+/, '')}`;
  if (!cur) return String(1 + add);
  return `${cur} + ${add}`;
}

/** Fields for a status change, with who/when and the history purge date. */
export function statusPatch(status, me, now = Date.now()) {
  if (status === 'active') return { status, done: false, checkedBy: null, checkedAt: null, purgeAt: null };
  return {
    status, done: true, checkedBy: me, checkedAt: now,
    purgeAt: status === 'history' ? now + HISTORY_DAYS * 86400000 : null,
  };
}

/** "2 milk", "milk x2", "eggs" -> { name, qty } */
export function parseEntry(raw) {
  const s = raw.trim();
  const m = s.match(/^(\d+)\s*x?\s+(.+)$/i) || s.match(/^(.+?)\s+x\s*(\d+)$/i);
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  if (!m) return { name: cap(s), qty: '' };
  return /^\d+$/.test(m[1]) ? { name: cap(m[2]), qty: m[1] } : { name: cap(m[1]), qty: m[2] };
}
