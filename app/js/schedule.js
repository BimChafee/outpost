// Curbside collection for 582 Rapids Lane (Region of Peel, Mississauga).
//
// Facts (from Peel's ReCollect calendar, Oct 2026):
//   - Collection day is Monday (shifts later in holiday weeks; the published calendar already reflects that).
//   - Organics every week. Garbage every other week.
//   - Recycling (Circular Materials since Jan 2026, "same schedule") runs on the alternate weeks to garbage,
//     so it is inferred: a pickup day without garbage is a recycling day.
//   - Yard waste is seasonal and is taken from the calendar when published.
// Past the end of the published calendar we extrapolate the Monday rhythm and mark days as estimated.

export const STREAMS = {
  garbage:   { label: 'Garbage',    color: 'var(--bin-garbage)' },
  recycling: { label: 'Recycling',  color: 'var(--bin-recycling)' },
  organics:  { label: 'Organics',   color: 'var(--bin-organics)' },
  yardwaste: { label: 'Yard waste', color: 'var(--bin-yard)' },
};
const ORDER = ['garbage', 'recycling', 'organics', 'yardwaste'];
const GARBAGE_ANCHOR = '2026-11-09'; // a known garbage Monday

export const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const dayKey = (dt) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
export const addDays = (dt, n) => { const r = new Date(dt); r.setDate(r.getDate() + n); return r; };
export const daysBetween = (a, b) => Math.round((parseDay(dayKey(b)) - parseDay(dayKey(a))) / 86400000);

function yardWasteEstimated(dt, garbageWeek) {
  const m = dt.getMonth() + 1, d = dt.getDate();
  if ((m === 3 && d >= 15) || (m >= 4 && m <= 6)) return true;     // spring: weekly
  if (m >= 7 && m <= 9) return garbageWeek;                         // summer: every other week
  if (m === 10 || m === 11 || (m === 12 && d <= 15)) return true;   // fall: weekly
  return false;
}

function normalise(flags) {
  const s = new Set(flags.filter((f) => f !== 'holiday'));
  if (s.size === 0) return null;
  if (!s.has('garbage')) s.add('recycling');
  return ORDER.filter((k) => s.has(k));
}

/** Merge the bundled calendar with the live one (written nightly by the notifier) and list upcoming pickups. */
export function upcomingPickups(bundled, live, from = new Date(), count = 6) {
  const days = { ...(bundled?.days || {}), ...(live?.days || {}) };
  const known = Object.keys(days).sort();
  const lastKnown = known.length ? known[known.length - 1] : null;
  const start = dayKey(from);
  const out = [];

  for (const k of known) {
    if (k < start) continue;
    const streams = normalise(days[k]);
    if (streams) out.push({ date: k, streams, estimated: false });
    if (out.length >= count) return out;
  }

  // Extrapolate Mondays after the published calendar.
  let dt = parseDay(lastKnown && lastKnown >= start ? lastKnown : start);
  dt = addDays(dt, 1);
  while (dt.getDay() !== 1) dt = addDays(dt, 1);
  const anchor = parseDay(GARBAGE_ANCHOR);
  while (out.length < count) {
    const weeks = Math.round((dt - anchor) / (7 * 86400000));
    const garbageWeek = ((weeks % 2) + 2) % 2 === 0;
    const streams = [garbageWeek ? 'garbage' : 'recycling', 'organics'];
    if (yardWasteEstimated(dt, garbageWeek)) streams.push('yardwaste');
    out.push({ date: dayKey(dt), streams, estimated: true });
    dt = addDays(dt, 7);
  }
  return out;
}

/** "Tonight", "Tomorrow", weekday name, or a date, relative to now. */
export function whenLabel(dateStr, now = new Date()) {
  const diff = daysBetween(now, parseDay(dateStr));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 7) return parseDay(dateStr).toLocaleDateString('en-CA', { weekday: 'long' });
  return parseDay(dateStr).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
}
