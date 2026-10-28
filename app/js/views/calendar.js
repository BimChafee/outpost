import { html, useState, useMemo, useRef, Icon, Chip, toast } from '../ui.js';
import { parseDay, dayKey, addDays, upcomingPickups, STREAMS } from '../schedule.js';
import {
  KINDS, occurrences, onDay, packLane, weekStart, weekDays, monthGrid, fmtTimeShort, whenText, awayOn, daysApart, dayTimeLabel,
} from '../calendar-model.js';
import { upkeepStatus } from './upkeep.js';
import { EventEditor, EventDetail } from './event-edit.js';
import { rentInfo } from './house.js';

const PREF = 'tmo.calendar';
const loadPref = () => { try { return { mode: 'week', hidden: [], ...JSON.parse(localStorage.getItem(PREF) || '{}') }; } catch { return { mode: 'week', hidden: [] }; } };
const today = () => dayKey(new Date());
const fmt = (k, o) => parseDay(k).toLocaleDateString('en-CA', o);

/** House-lane items the app already knows about: bin days, rent, upkeep due dates. */
export function autoItems({ bundledSchedule, liveSchedule, upkeep, household }, from, to) {
  const out = [];
  const pickups = upcomingPickups(bundledSchedule, liveSchedule, parseDay(from), 12).filter((p) => p.date <= to);
  for (const p of pickups) {
    out.push({ id: `bins@${p.date}`, date: p.date, endDate: p.date, auto: 'bins',
      ev: { title: p.streams.map((s) => STREAMS[s].label).join(', '), owner: 'house', kind: 'bins', allDay: true, streams: p.streams, estimated: p.estimated } });
  }
  const rent = rentInfo(household);
  for (let d = parseDay(from); dayKey(d) <= to; d = addDays(d, 1)) {
    if (d.getDate() === rent.dueDay) {
      const k = dayKey(d);
      out.push({ id: `rent@${k}`, date: k, endDate: k, auto: 'rent', ev: { title: `Rent ${rent.amountText}`, owner: 'house', kind: 'rent', allDay: true } });
    }
  }
  for (const u of upkeep) {
    const s = upkeepStatus(u);
    if (s.due >= from && s.due <= to) {
      out.push({ id: `upkeep@${u.id}`, date: s.due, endDate: s.due, auto: 'upkeep', ev: { title: u.name, owner: 'house', kind: 'upkeep', allDay: true } });
    }
  }
  return out;
}

const AUTO_ICON = { bins: 'bin', rent: 'ledger', upkeep: 'wrench' };
const iconFor = (ev) => AUTO_ICON[ev.kind] || KINDS[ev.kind]?.icon || 'calendar';

export function Calendar(props) {
  const { st, hid, me, members, events = [] } = props;
  const [pref, setPrefState] = useState(loadPref);
  const [sel, setSel] = useState(today());
  const [sheet, setSheet] = useState(null);
  const setPref = (p) => setPrefState((x) => { const n = { ...x, ...p }; try { localStorage.setItem(PREF, JSON.stringify(n)); } catch { /* private mode */ } return n; });

  const lanes = [{ id: 'house', name: 'House', color: 'var(--warning)' }, ...members];
  const visible = (id) => !pref.hidden.includes(id);
  const toggleLane = (id) => setPref({ hidden: visible(id) ? [...pref.hidden, id] : pref.hidden.filter((x) => x !== id) });
  const justMe = () => setPref({ hidden: lanes.map((l) => l.id).filter((id) => id !== me) });
  const showAll = () => setPref({ hidden: [] });

  // Range for the current mode.
  const mode = pref.mode;
  const days = mode === 'week' ? weekDays(weekStart(sel)) : mode === 'month' ? monthGrid(sel) : Array.from({ length: 30 }, (_, i) => dayKey(addDays(parseDay(today()), i)));
  const from = days[0], to = days[days.length - 1];
  const occ = useMemo(() => [
    ...occurrences(events, from, to),
    ...autoItems(props, from, to),
  ].filter((o) => visible(o.ev.owner)), [events, from, to, pref.hidden, props.upkeep, props.liveSchedule, props.household]);

  const shift = (n) => {
    if (mode === 'week') setSel(dayKey(addDays(parseDay(sel), 7 * n)));
    else { const d = parseDay(sel); setSel(dayKey(new Date(d.getFullYear(), d.getMonth() + n, 1, 12))); }
  };
  const title = mode === 'week'
    ? `${fmt(from, { month: 'short', day: 'numeric' })} to ${fmt(to, from.slice(5, 7) === to.slice(5, 7) ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`
    : mode === 'month' ? fmt(sel, { month: 'long', year: 'numeric' }) : 'Next 30 days';

  const open = (o) => (o.auto ? openAuto(o) : setSheet({ type: 'detail', o }));
  const openAuto = (o) => {
    if (o.auto === 'bins') location.hash = 'home';
    else if (o.auto === 'rent') location.hash = 'ledger';
    else location.hash = 'upkeep';
  };
  const add = (date, owner) => setSheet({ type: 'edit', initial: { date, owner: owner || me } });

  // Swipe the board sideways to change week or month.
  const touch = useRef(null);
  const swipe = {
    onTouchStart: (e) => { touch.current = [e.touches[0].clientX, e.touches[0].clientY]; },
    onTouchEnd: (e) => {
      if (!touch.current) return;
      const dx = e.changedTouches[0].clientX - touch.current[0], dy = e.changedTouches[0].clientY - touch.current[1];
      touch.current = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) shift(dx < 0 ? 1 : -1);
    },
  };

  return html`
    <div class="page-head row-head">
      <div><h1 class="page-title">Calendar</h1>
        <p class="page-sub">Everyone's schedule, and what's on at the house.</p></div>
      <button class="btn primary add-ev" onClick=${() => add(sel)}><${Icon} name="plus" /> Add</button>
    </div>

    <div class="cal-bar">
      <div class="seg cal-modes" role="radiogroup" aria-label="Calendar view">
        ${[['week', 'Week'], ['month', 'Month'], ['list', 'List']].map(([k, l]) => html`
          <button role="radio" aria-checked=${String(mode === k)} class=${mode === k ? 'on' : ''} onClick=${() => setPref({ mode: k })}><b>${l}</b></button>`)}
      </div>
      ${mode !== 'list' && html`<div class="cal-nav">
        <button class="icon-btn tool" onClick=${() => shift(-1)} aria-label=${mode === 'week' ? 'Previous week' : 'Previous month'}><${Icon} name="back" /></button>
        <h2 class="cal-title">${title}</h2>
        <button class="icon-btn tool flip" onClick=${() => shift(1)} aria-label=${mode === 'week' ? 'Next week' : 'Next month'}><${Icon} name="back" /></button>
        ${!days.includes(today()) && html`<button class="btn small" onClick=${() => setSel(today())}>Today</button>`}
      </div>`}
    </div>

    <div class="lane-filters" role="group" aria-label="Whose schedules to show">
      ${lanes.map((l) => html`<button class=${`lane-chip ${visible(l.id) ? 'on' : ''} ${l.id === 'house' ? 'house' : ''}`} style=${{ '--c': l.color }}
          aria-pressed=${String(visible(l.id))} onClick=${() => toggleLane(l.id)}>
        <span class="lane-dot">${l.id === 'house' ? html`<${Icon} name="home" size=${14} />` : l.name[0]}</span>${l.id === me ? 'You' : l.name}</button>`)}
      ${pref.hidden.length ? html`<button class="link" onClick=${showAll}>Show all</button>` : html`<button class="link" onClick=${justMe}>Just me</button>`}
    </div>

    ${mode === 'week' && html`<${WeekBoard} days=${days} lanes=${lanes.filter((l) => visible(l.id))} occ=${occ} sel=${sel} me=${me}
        onSelect=${setSel} onOpen=${open} onAdd=${add} swipe=${swipe} />`}
    ${mode === 'month' && html`<${MonthGrid} days=${days} occ=${occ} sel=${sel} members=${members} onSelect=${setSel} swipe=${swipe} />`}

    ${mode === 'list'
      ? html`<${Agenda} days=${days} occ=${occ} members=${members} me=${me} onOpen=${open} onAdd=${add} />`
      : html`<${DayPanel} day=${sel} occ=${occ} members=${members} me=${me} onOpen=${open} onAdd=${add} hiddenCount=${pref.hidden.length} />`}

    ${sheet?.type === 'edit' && html`<${EventEditor} ...${props} initial=${sheet.initial} event=${sheet.event} onClose=${() => setSheet(null)} />`}
    ${sheet?.type === 'detail' && html`<${EventDetail} ...${props} o=${sheet.o} onClose=${() => setSheet(null)}
        onEdit=${() => setSheet({ type: 'edit', event: sheet.o.ev })} />`}`;
}

/** The crew roster: one lane per person, days across. */
function WeekBoard({ days, lanes, occ, sel, me, onSelect, onOpen, onAdd, swipe }) {
  const t = today();
  if (!lanes.length) return html`<div class="empty"><p><b>Every schedule is hidden.</b></p><p>Tap a name above to show it.</p></div>`;
  return html`<div class="roster" ...${swipe}>
    <div class="roster-head">
      <span class="lane-label"></span>
      ${days.map((d) => html`<button class=${`rday ${d === t ? 'today' : ''} ${d === sel ? 'sel' : ''}`} onClick=${() => onSelect(d)}
          aria-label=${fmt(d, { weekday: 'long', month: 'long', day: 'numeric' })} aria-pressed=${String(d === sel)}>
        <small>${fmt(d, { weekday: 'short' }).slice(0, 2)}</small><b>${parseDay(d).getDate()}</b></button>`)}
    </div>
    ${lanes.map((l) => {
      const mine = occ.filter((o) => o.ev.owner === l.id);
      const { items, rows } = packLane(mine, days);
      const selCol = days.indexOf(sel);
      return html`<div class=${`lane ${l.id === 'house' ? 'lane-house' : ''}`} style=${{ '--c': l.color }}>
        <span class="lane-label" title=${l.name}>${l.id === 'house' ? html`<${Icon} name="home" size=${16} />` : html`<span class="chip-dot">${l.name[0]}</span>`}</span>
        <div class="lane-grid" style=${{ gridTemplateRows: `repeat(${Math.max(2, rows)}, 26px)` }}>
          ${days.map((d, i) => html`<button class=${`lane-cell ${i === selCol ? 'sel' : ''} ${d === t ? 'today' : ''}`} style=${{ gridColumn: i + 1, gridRow: `1 / span ${Math.max(2, rows)}` }}
              onClick=${() => (d === sel ? onAdd(d, l.id) : onSelect(d))}
              aria-label=${d === sel ? `Add to ${l.id === 'house' ? 'the house' : l.name}'s ${fmt(d, { weekday: 'long' })}` : `Show ${fmt(d, { weekday: 'long' })}`}></button>`)}
          ${items.map((s) => {
            const ev = s.o.ev;
            const timed = !ev.allDay && s.span === 1;
            return html`<button class=${`blk kind-${ev.kind} ${s.o.auto ? 'auto' : ''} ${s.clipStart ? 'cl' : ''} ${s.clipEnd ? 'cr' : ''}`}
                style=${{ gridColumn: `${s.col + 1} / span ${s.span}`, gridRow: s.row + 1 }}
                onClick=${(e) => { e.stopPropagation(); onOpen(s.o); }} aria-label=${`${ev.title}, ${whenText(s.o)}`}>
              <${Icon} name=${iconFor(ev)} size=${13} />
              <span>${timed ? fmtTimeShort(ev.start) : ev.title}</span>
            </button>`;
          })}
        </div>
      </div>`;
    })}
    <p class="roster-hint">Tap a day to see it. Tap the same day in someone's lane to add to it. Swipe for other weeks.</p>
  </div>`;
}

function MonthGrid({ days, occ, sel, members, onSelect, swipe }) {
  const t = today();
  const month = sel.slice(0, 7);
  const colorOf = (owner) => (owner === 'house' ? 'var(--warning)' : members.find((m) => m.id === owner)?.color || 'var(--ink-3)');
  return html`<div class="month" ...${swipe}>
    ${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => html`<span class="mhead">${d}</span>`)}
    ${days.map((d) => {
      const list = onDay(occ, d).filter((o) => !o.auto || o.auto === 'rent');
      return html`<button class=${`mday ${d.slice(0, 7) !== month ? 'out' : ''} ${d === t ? 'today' : ''} ${d === sel ? 'sel' : ''}`}
          onClick=${() => onSelect(d)} aria-label=${`${fmt(d, { weekday: 'long', month: 'long', day: 'numeric' })}, ${list.length} event${list.length === 1 ? '' : 's'}`}>
        <b>${parseDay(d).getDate()}</b>
        <span class="mbars">${list.slice(0, 3).map((o) => html`<i class=${o.ev.owner === 'house' ? 'house' : ''} style=${{ background: colorOf(o.ev.owner) }}></i>`)}</span>
        ${list.length > 3 && html`<small>+${list.length - 3}</small>`}
      </button>`;
    })}
  </div>`;
}

function EventRow({ o, day, members, me, onOpen }) {
  const ev = o.ev;
  const m = members.find((x) => x.id === ev.owner);
  const color = ev.owner === 'house' ? 'var(--warning)' : m?.color || 'var(--ink-3)';
  const who = ev.owner === 'house' ? 'House' : m ? (m.id === me ? 'You' : m.name) : 'Someone';
  const going = ev.owner === 'house' && !o.auto ? (ev.going || []).length : 0;
  const time = ev.allDay || o.date !== o.endDate ? whenText(o, day) : ev.start ? whenText(o, day).replace(' to ', '–') : '';
  return html`<li><button class=${`evrow ${ev.owner === 'house' ? 'house' : ''} ${o.auto ? 'auto' : ''}`} style=${{ '--c': color }} onClick=${() => onOpen(o)}>
    <span class="evtime">${dayTimeLabel(o, day)}</span>
    <span class="evicon"><${Icon} name=${iconFor(ev)} size=${18} /></span>
    <span class="evmain"><b>${ev.title}</b>
      <small>${[who, o.auto ? null : KINDS[ev.kind]?.label, time && !ev.allDay ? time : null, ev.location || null, going ? `${going} going` : null].filter(Boolean).join(', ')}</small></span>
  </button></li>`;
}

function DayPanel({ day, occ, members, me, onOpen, onAdd, hiddenCount }) {
  const list = onDay(occ, day);
  const away = awayOn(occ, day);
  const home = members.filter((m) => !away.includes(m.id));
  const name = (m) => (m.id === me ? 'you' : m.name);
  const t = today();
  const rel = day === t ? 'Today' : day === dayKey(addDays(parseDay(t), 1)) ? 'Tomorrow' : null;
  return html`<section class="daypanel" aria-labelledby="day-h">
    <div class="block-head">
      <h2 id="day-h" class="block-title">${rel ? html`${rel}, ` : ''}${fmt(day, rel ? { month: 'long', day: 'numeric' } : { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
      <button class="btn small" onClick=${() => onAdd(day)}><${Icon} name="plus" size=${18} /> Add</button>
    </div>
    ${away.length > 0 && html`<p class="whos-home"><${Icon} name="home" size=${16} />
      ${home.length ? `Home: ${home.map(name).join(', ')}.` : 'Nobody is home.'} Away: ${away.map((id) => { const m = members.find((x) => x.id === id); return m ? name(m) : ''; }).join(', ')}.</p>`}
    ${list.length === 0 ? html`<p class="quiet">Nothing on${hiddenCount ? ' in the schedules you are showing' : ''}.</p>` : html`
      <ul class="evlist">${list.map((o) => html`<${EventRow} o=${o} day=${day} members=${members} me=${me} onOpen=${onOpen} />`)}</ul>`}
  </section>`;
}

function Agenda({ days, occ, members, me, onOpen, onAdd }) {
  const groups = days.map((d) => [d, onDay(occ, d).filter((o) => o.date === d || d === days[0])]).filter(([, l]) => l.length);
  if (!groups.length) return html`<div class="empty"><p><b>Nothing in the next 30 days.</b></p><p>Add a shift, a trip or a house night.</p>
    <p><button class="btn primary" onClick=${() => onAdd(today())}><${Icon} name="plus" /> Add an event</button></p></div>`;
  return html`<div class="agenda">${groups.map(([d, list]) => html`<section class="aday">
    <h2 class="aday-h"><b>${parseDay(d).getDate()}</b><span>${fmt(d, { weekday: 'long' })}<small>${fmt(d, { month: 'long' })}</small></span></h2>
    <ul class="evlist">${list.map((o) => html`<${EventRow} o=${o} day=${d} members=${members} me=${me} onOpen=${onOpen} />`)}</ul>
  </section>`)}</div>`;
}
