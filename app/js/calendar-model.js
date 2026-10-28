// Shared calendar logic, kept free of UI so it can be tested (tests.html).
//
// Event doc (households/{hid}/events/{id}):
//   { title, owner: memberId | 'house', kind, date: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD',
//     allDay: bool, start: 'HH:MM' | '', end: 'HH:MM' | '', location, notes,
//     repeat: 'none'|'daily'|'weekly'|'biweekly'|'monthly'|'custom', every: days (custom only),
//     until: 'YYYY-MM-DD' | '', skip: ['YYYY-MM-DD'],
//     going: [memberId], notGoing: [memberId], createdBy, createdAt }
// Times are house-local wall-clock times: everyone lives in the same place.

import { parseDay, dayKey, addDays } from './schedule.js';

export const KINDS = {
  work:    { label: 'Work or class', house: false, icon: 'hardhat' },
  away:    { label: 'Away',          house: false, icon: 'bag' },
  plans:   { label: 'Plans',         house: false, icon: 'spark' },
  appt:    { label: 'Appointment',   house: false, icon: 'clip' },
  quiet:   { label: 'Quiet please',  house: false, icon: 'moon' },
  party:   { label: 'Party or event', house: true, icon: 'party' },
  guests:  { label: 'Guests over',   house: true,  icon: 'people' },
  visit:   { label: 'Contractor visit', house: true, icon: 'wrench' },
  meeting: { label: 'House meeting', house: true,  icon: 'chat' },
};
export const kindsFor = (owner) => Object.entries(KINDS).filter(([, k]) => k.house === (owner === 'house')).map(([id, k]) => ({ id, ...k }));

export const REPEATS = [
  ['none', "Doesn't repeat"], ['daily', 'Every day'], ['weekly', 'Every week'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Every month'],
  ['custom', 'Every … days'],
];

const daysApart = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);
export { daysApart };

/** Monday-start week containing `key`. */
export function weekStart(key) {
  const d = parseDay(key);
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  return dayKey(addDays(d, -dow));
}
export const weekDays = (startKey) => Array.from({ length: 7 }, (_, i) => dayKey(addDays(parseDay(startKey), i)));

/** Days shown in a month grid: whole weeks, Monday first. */
export function monthGrid(key) {
  const d = parseDay(key);
  const first = dayKey(new Date(d.getFullYear(), d.getMonth(), 1, 12));
  const last = dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
  const start = weekStart(first);
  const end = dayKey(addDays(parseDay(weekStart(last)), 6));
  return Array.from({ length: daysApart(start, end) + 1 }, (_, i) => dayKey(addDays(parseDay(start), i)));
}

function addMonthsKey(key, n) {
  const d = parseDay(key);
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  if (d.getDate() > lastDay) return null; // no 31st this month: skip, like most calendars
  target.setDate(d.getDate());
  return dayKey(target);
}

/**
 * Every occurrence of the events that touches [from, to] (inclusive date keys).
 * Returns [{ id, ev, date, endDate }] where date/endDate are this occurrence's span.
 */
export function occurrences(events, from, to) {
  const out = [];
  for (const ev of events) {
    if (!ev.date) continue;
    const span = Math.max(0, daysApart(ev.date, ev.endDate || ev.date));
    const until = ev.until || null;
    const skip = new Set(ev.skip || []);
    const push = (d) => {
      const e = dayKey(addDays(parseDay(d), span));
      if (e >= from && d <= to && !skip.has(d)) out.push({ id: `${ev.id}@${d}`, ev, date: d, endDate: e });
    };
    const rep = ev.repeat || 'none';
    if (rep === 'none') { push(ev.date); continue; }
    if (rep === 'monthly') {
      for (let i = 0; i < 600; i++) {
        const d = addMonthsKey(ev.date, i);
        if (d === null) continue;
        if (d > to || (until && d > until)) break;
        push(d);
      }
      continue;
    }
    const step = rep === 'custom' ? everyDays(ev) : rep === 'daily' ? 1 : rep === 'weekly' ? 7 : 14;
    // Jump close to the window instead of walking from the first occurrence.
    const behind = daysApart(ev.date, from) - span;
    let i = behind > 0 ? Math.floor(behind / step) : 0;
    for (; i < 5000; i++) {
      const d = dayKey(addDays(parseDay(ev.date), i * step));
      if (d > to || (until && d > until)) break;
      push(d);
    }
  }
  return out.sort(byWhen);
}

/** All-day and multi-day first, then by start time, then title. */
export function byWhen(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ad = a.ev.allDay ? 0 : 1, bd = b.ev.allDay ? 0 : 1;
  if (ad !== bd) return ad - bd;
  if ((a.ev.start || '') !== (b.ev.start || '')) return (a.ev.start || '') < (b.ev.start || '') ? -1 : 1;
  return (a.ev.title || '').localeCompare(b.ev.title || '');
}

export const onDay = (occ, key) => occ.filter((o) => o.date <= key && o.endDate >= key);

/**
 * Lay one lane's occurrences out on a 7-day strip: each gets a column span and a row so
 * that nothing overlaps. Returns { items: [{ o, col, span, row, clipStart, clipEnd }], rows }.
 */
export function packLane(occ, days) {
  const first = days[0], last = days[days.length - 1];
  const segs = occ
    .filter((o) => o.endDate >= first && o.date <= last)
    .map((o) => {
      const s = o.date < first ? first : o.date;
      const e = o.endDate > last ? last : o.endDate;
      return { o, col: daysApart(first, s), span: daysApart(s, e) + 1, clipStart: o.date < first, clipEnd: o.endDate > last };
    })
    .sort((a, b) => a.col - b.col || b.span - a.span || byWhen(a.o, b.o));
  const rowEnds = [];
  for (const s of segs) {
    let r = rowEnds.findIndex((end) => end < s.col);
    if (r === -1) { r = rowEnds.length; rowEnds.push(-1); }
    rowEnds[r] = s.col + s.span - 1;
    s.row = r;
  }
  return { items: segs, rows: rowEnds.length };
}

/** "9:00 a.m." style, from "09:00". */
export function fmtTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h < 12 ? 'a.m.' : 'p.m.';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ap}` : `${h12} ${ap}`;
}
/** Compact "9a", "5:30p" for tight roster blocks. */
export function fmtTimeShort(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'a' : 'p'}`;
}

/** The short time shown beside an event on a given day: start time, "til 6a" for the tail of an overnight event, or All day. */
export function dayTimeLabel(o, day) {
  const ev = o.ev;
  if (ev.allDay) return 'All day';
  if (o.date === o.endDate || day === o.date) return fmtTimeShort(ev.start);
  if (day === o.endDate) return ev.end ? `til ${fmtTimeShort(ev.end)}` : 'All day';
  return 'All day';
}

/** Human description of when an occurrence happens, relative to a given day. */
export function whenText(o, dayKeyShown) {
  const ev = o.ev;
  const multi = o.date !== o.endDate;
  const short = (k) => parseDay(k).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
  if (ev.allDay) return multi ? `${short(o.date)} to ${short(o.endDate)}` : 'All day';
  if (multi) {
    if (dayKeyShown && dayKeyShown !== o.date && dayKeyShown !== o.endDate) return 'All day (continues)';
    if (dayKeyShown === o.endDate && dayKeyShown !== o.date) return `Until ${fmtTime(ev.end)}`;
    return `${fmtTime(ev.start)} to ${short(o.endDate)}, ${fmtTime(ev.end)}`;
  }
  return ev.end ? `${fmtTime(ev.start)} to ${fmtTime(ev.end)}` : fmtTime(ev.start);
}

/** Days between repeats for a custom repeat (rotations like "every 8 days"). */
export const everyDays = (ev) => Math.max(1, Math.round(Number(ev.every) || 1));

export function repeatText(ev) {
  const r = ev.repeat === 'custom' ? `Every ${everyDays(ev)} days` : REPEATS.find(([k]) => k === (ev.repeat || 'none'))?.[1] || '';
  if (!ev.repeat || ev.repeat === 'none') return '';
  return ev.until ? `${r}, until ${parseDay(ev.until).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}` : r;
}

/** Who is away (an "away" event) on a given day. */
export function awayOn(occ, key) {
  return [...new Set(onDay(occ, key).filter((o) => o.ev.kind === 'away' && o.ev.owner !== 'house').map((o) => o.ev.owner))];
}

/** Validate and normalise editor input into an event doc. Returns { ok, error, doc }. */
export function normaliseEvent(f) {
  const title = (f.title || '').trim();
  if (!title) return { ok: false, error: 'Give it a name' };
  if (!f.date) return { ok: false, error: 'Pick a date' };
  const endDate = f.endDate && f.endDate >= f.date ? f.endDate : f.date;
  if (!f.allDay && !f.start) return { ok: false, error: 'Pick a start time, or make it all day' };
  const every = Math.round(Number(f.every));
  if (f.repeat === 'custom' && !(every >= 1 && every <= 366)) return { ok: false, error: 'Enter how many days between repeats, from 1 to 366' };
  if (!f.allDay && f.end && endDate === f.date && f.end <= f.start) {
    return { ok: false, error: 'It ends before it starts. For an overnight shift, set the end date to the next day.' };
  }
  return {
    ok: true,
    doc: {
      title, owner: f.owner, kind: f.kind, date: f.date, endDate, allDay: !!f.allDay,
      start: f.allDay ? '' : f.start, end: f.allDay ? '' : (f.end || ''),
      location: (f.location || '').trim(), notes: (f.notes || '').trim(),
      repeat: f.repeat || 'none', until: f.repeat && f.repeat !== 'none' ? (f.until || '') : '',
      every: f.repeat === 'custom' ? every : null,
      skip: f.skip || [], going: f.going || [], notGoing: f.notGoing || [],
    },
  };
}
