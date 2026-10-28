// The outpost game: quests pay the house gold and XP, XP sets the house level, gold buys fortifications.
// Kept free of UI so it can be tested (tests.html).
//
// Quest doc (households/{hid}/quests/{id}):
//   { title, kind: 'chore'|'goal', notes, gold, xp, repeat: 'once'|'daily'|'weekly'|'custom', every,
//     assignee: memberId|null, steps: [{ id, title, done, doneBy, doneAt }], lastDone: 'YYYY-MM-DD'|'',
//     lastDoneBy, doneCount, done (once-quests and finished goals), createdBy, createdAt }
// Log doc (households/{hid}/questlog/{id}), the single source of truth for the treasury:
//   { type: 'quest'|'step'|'goal'|'bins'|'upkeep'|'purchase', title, by, gold, xp, at, questId?, itemId?, key? }

import { parseDay, dayKey, addDays, daysBetween } from './schedule.js';

// ---------- levels ----------
/** Total XP needed to reach level L (L1 = 0, L2 = 100, L3 = 300, L4 = 600, ...). */
export const xpForLevel = (L) => 50 * L * (L - 1);
export function levelFromXp(xp) {
  let L = 1;
  while (xpForLevel(L + 1) <= xp) L++;
  const floor = xpForLevel(L), next = xpForLevel(L + 1);
  return { level: L, xp, into: xp - floor, span: next - floor, toNext: next - xp, title: rankTitle(L) };
}
const RANKS = ['Camp', 'Dig site', 'Outpost', 'Settlement', 'Station', 'Garrison', 'Stronghold', 'Fortress', 'Citadel'];
export const rankTitle = (L) => RANKS[Math.min(L, RANKS.length) - 1] + (L > RANKS.length ? ` ${L - RANKS.length + 1}` : '');

/** Gold and XP from the log. Purchases have negative gold and no XP. */
export function treasury(log) {
  let gold = 0, xp = 0;
  for (const e of log) { gold += Number(e.gold) || 0; xp += Math.max(0, Number(e.xp) || 0); }
  return { gold, ...levelFromXp(xp) };
}

/** Gold and quests per member since a date (for the crew ledger). */
export function crewLedger(log, members, sinceTs = 0) {
  const rows = Object.fromEntries(members.map((m) => [m.id, { id: m.id, gold: 0, count: 0 }]));
  for (const e of log) {
    if (e.type === 'purchase' || (e.at || 0) < sinceTs || !rows[e.by]) continue;
    rows[e.by].gold += Number(e.gold) || 0;
    rows[e.by].count += 1;
  }
  return Object.values(rows).sort((a, b) => b.gold - a.gold);
}

// ---------- quests ----------
export const REWARDS = [
  { id: 'small', label: 'Small', gold: 10, xp: 10, hint: 'Ten minutes' },
  { id: 'medium', label: 'Medium', gold: 25, xp: 25, hint: 'Half an hour' },
  { id: 'big', label: 'Big', gold: 50, xp: 50, hint: 'An hour or more' },
  { id: 'epic', label: 'Epic', gold: 150, xp: 150, hint: 'A weekend project' },
];
export const QUEST_REPEATS = [['once', 'Once'], ['daily', 'Every day'], ['weekly', 'Every week'], ['custom', 'Every … days']];
export const STEP_SHARE = 0.2; // each goal step pays this share of the goal's reward; the rest comes on completion

const repeatDays = (q) => (q.repeat === 'daily' ? 1 : q.repeat === 'weekly' ? 7 : q.repeat === 'custom' ? Math.max(1, Math.round(Number(q.every) || 1)) : null);

/** Whether a chore can be done now, and when it's next ready. */
export function choreState(q, today = dayKey(new Date())) {
  if (q.kind === 'goal') return { ready: !q.done, done: !!q.done };
  if (q.repeat === 'once' || !q.repeat) return { ready: !q.done, done: !!q.done };
  if (!q.lastDone) return { ready: true };
  const next = dayKey(addDays(parseDay(q.lastDone), repeatDays(q)));
  return next <= today ? { ready: true, overdueDays: daysBetween(parseDay(next), parseDay(today)) } : { ready: false, next };
}

export function repeatLabel(q) {
  if (q.kind === 'goal') return 'Long-term goal';
  if (q.repeat === 'custom') return `Every ${repeatDays(q)} days`;
  return QUEST_REPEATS.find(([k]) => k === (q.repeat || 'once'))?.[1] || 'Once';
}

export const stepReward = (q) => ({ gold: Math.max(1, Math.round((q.gold || 0) * STEP_SHARE / Math.max(1, (q.steps || []).length))), xp: Math.max(1, Math.round((q.xp || 0) * STEP_SHARE / Math.max(1, (q.steps || []).length))) });
export const goalBounty = (q) => ({ gold: Math.round((q.gold || 0) * (1 - STEP_SHARE)), xp: Math.round((q.xp || 0) * (1 - STEP_SHARE)) });
export const goalProgress = (q) => { const s = q.steps || []; return { done: s.filter((x) => x.done).length, total: s.length }; };

export function normaliseQuest(f) {
  const title = (f.title || '').trim();
  if (!title) return { ok: false, error: 'Name the quest' };
  const gold = Math.round(Number(f.gold)), xp = Math.round(Number(f.xp));
  if (!(gold >= 0 && gold <= 5000) || !(xp >= 0 && xp <= 5000)) return { ok: false, error: 'Rewards go from 0 to 5,000' };
  const steps = (f.steps || []).filter((s) => (s.title || '').trim()).map((s) => ({ ...s, title: s.title.trim(), done: !!s.done, doneBy: s.doneBy || null, doneAt: s.doneAt || null }));
  if (f.kind === 'goal' && steps.length === 0) return { ok: false, error: 'Add at least one step to the goal' };
  const every = Math.round(Number(f.every));
  if (f.kind !== 'goal' && f.repeat === 'custom' && !(every >= 1 && every <= 366)) return { ok: false, error: 'Enter how many days between repeats, from 1 to 366' };
  return {
    ok: true,
    doc: {
      title, kind: f.kind === 'goal' ? 'goal' : 'chore', notes: (f.notes || '').trim(), gold, xp,
      repeat: f.kind === 'goal' ? 'once' : (f.repeat || 'weekly'), every: f.repeat === 'custom' ? every : null,
      assignee: f.assignee || null, steps: f.kind === 'goal' ? steps : [],
    },
  };
}

export const STARTER_QUESTS = [
  { title: 'Clean the kitchen', kind: 'chore', repeat: 'weekly', gold: 25, xp: 25, notes: 'Counters, stove top, sink, floor.' },
  { title: 'Clean the bathroom', kind: 'chore', repeat: 'weekly', gold: 30, xp: 30, notes: 'Toilet, sink, mirror, shower.' },
  { title: 'Vacuum the common areas', kind: 'chore', repeat: 'weekly', gold: 20, xp: 20 },
  { title: 'Empty the recycling inside', kind: 'chore', repeat: 'custom', every: 3, gold: 10, xp: 10 },
  { title: 'Fridge clean-out', kind: 'chore', repeat: 'custom', every: 14, gold: 20, xp: 20, notes: 'Toss anything expired.' },
  { title: 'Clear out the garage', kind: 'goal', gold: 150, xp: 150, notes: 'Make room for bikes and storage.',
    stepTitles: ['Sort everything into keep, donate, trash', 'Drop off donations', 'Book a junk pickup', 'Put up shelving'] },
];

// ---------- shop ----------
/** Fortifications. Each purchase adds a tier; price grows by `mult` per tier owned. */
export const SHOP = [
  { id: 'walls', name: 'Walls', unlock: 1, base: 80, mult: 1.8, tiers: ['Timber palisade', 'Sandbag line', 'Concrete barrier', 'Plate-steel wall'], blurb: 'A ring around the outpost.' },
  { id: 'rooms', name: 'Rooms', unlock: 1, base: 60, mult: 1.6, tiers: ['Bunkroom', 'Mess hall', 'Workshop', 'Rec room'], blurb: 'Modules bolted onto the cabin.' },
  { id: 'lights', name: 'Floodlights', unlock: 1, base: 40, mult: 2, tiers: ['Work lamps', 'Stadium floods'], blurb: 'Light the yard at night.' },
  { id: 'flag', name: 'Banner', unlock: 1, base: 30, mult: 1, tiers: ['House banner'], blurb: 'Fly the outpost colours.' },
  { id: 'tower', name: 'Watchtower', unlock: 2, base: 120, mult: 1.8, tiers: ['Lookout', 'Searchlight', 'Auto-turret'], blurb: 'See trouble coming.' },
  { id: 'guards', name: 'Guards', unlock: 3, base: 100, mult: 1.5, tiers: ['First guard', 'Second guard', 'Third guard', 'Fourth guard'], blurb: 'Someone to walk the wall.' },
  { id: 'drill', name: 'Drill rig', unlock: 4, base: 200, mult: 1.8, tiers: ['Hand drill', 'Derrick', 'Deep-core rig'], blurb: "It's a mining outpost, after all." },
  { id: 'greenhouse', name: 'Greenhouse', unlock: 5, base: 180, mult: 1.8, tiers: ['Cold frame', 'Glasshouse'], blurb: 'Grow your own greens.' },
  { id: 'radar', name: 'Radar dish', unlock: 6, base: 300, mult: 1, tiers: ['Radar dish'], blurb: 'Track every incoming pizza.' },
  { id: 'moat', name: 'Trench', unlock: 7, base: 250, mult: 1.8, tiers: ['Trench', 'Moat'], blurb: 'Dig in. Then flood it.' },
  { id: 'pad', name: 'Landing pad', unlock: 9, base: 600, mult: 1, tiers: ['Landing pad'], blurb: 'For the eventual airlift out.' },
];

/** How many tiers of each item the house owns, from purchase log entries. */
export function owned(log) {
  const out = Object.fromEntries(SHOP.map((s) => [s.id, 0]));
  for (const e of log) if (e.type === 'purchase' && e.itemId in out) out[e.itemId] += 1;
  for (const s of SHOP) out[s.id] = Math.min(out[s.id], s.tiers.length);
  return out;
}

export function priceOf(item, tiersOwned) {
  return Math.round((item.base * item.mult ** tiersOwned) / 5) * 5;
}

/** Everything the shop needs to show one item. */
export function shopState(item, tiersOwned, level, gold) {
  const maxed = tiersOwned >= item.tiers.length;
  const price = maxed ? null : priceOf(item, tiersOwned);
  const locked = level < item.unlock;
  return {
    maxed, price, locked, next: maxed ? null : item.tiers[tiersOwned], current: tiersOwned ? item.tiers[tiersOwned - 1] : null,
    affordable: !maxed && !locked && gold >= price, short: !maxed && !locked ? Math.max(0, price - gold) : 0,
  };
}

// ---------- bin night ----------
export const BIN_REWARD = { gold: 15, xp: 15 };
export const UPKEEP_REWARD = { gold: 20, xp: 20 };
/** The automatic "bins to the curb" quest is up from the evening before pickup until pickup day ends. */
export function binQuest(pickups, log, now = new Date()) {
  const today = dayKey(now), tomorrow = dayKey(addDays(now, 1));
  const p = pickups.find((x) => x.date === tomorrow || x.date === today);
  if (!p) return null;
  const key = `bins@${p.date}`;
  return { key, date: p.date, streams: p.streams, done: log.some((e) => e.key === key), ...BIN_REWARD };
}

// ---------- who can create quests ----------
/** Quest masters can create, edit and delete quests. Defaults to members named Bryan until the household sets its own list. */
export function questMasters(household, members) {
  if (Array.isArray(household?.questMasters) && household.questMasters.length) return household.questMasters;
  return members.filter((m) => m.name.trim().toLowerCase() === 'bryan').map((m) => m.id);
}
export const canManageQuests = (household, members, me) => questMasters(household, members).includes(me);
