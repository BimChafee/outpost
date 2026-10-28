// Home's "Today" section: what's on today across the house, and who's away tonight.
import { html, useMemo, Icon } from '../ui.js';
import { dayKey } from '../schedule.js';
import { occurrences, onDay, awayOn, KINDS, dayTimeLabel } from '../calendar-model.js';

export function TodayCard({ events = [], members, me }) {
  const t = dayKey(new Date());
  const occ = useMemo(() => occurrences(events, t, t), [events, t]);
  const list = onDay(occ, t);
  const away = awayOn(occ, t);
  const name = (id) => { const m = members.find((x) => x.id === id); return m ? (m.id === me ? 'You' : m.name) : 'Someone'; };
  return html`<section class="block" aria-labelledby="today-h">
    <div class="block-head"><h2 id="today-h" class="block-title">Today</h2><a href="#calendar">Calendar</a></div>
    ${list.length === 0 ? html`<a class="sign-row calm" href="#calendar"><${Icon} name="calendar" size=${26} /><div><b>Nothing on today</b><span>Add shifts, trips and house nights to the calendar.</span></div></a>` : html`
      <ul class="today">
        ${list.slice(0, 5).map((o) => {
          const ev = o.ev;
          const house = ev.owner === 'house';
          const color = house ? 'var(--warning)' : members.find((m) => m.id === ev.owner)?.color;
          return html`<li><a href="#calendar" class=${house ? 'house' : ''} style=${{ '--c': color }}>
            <span class="today-time">${dayTimeLabel(o, t)}</span>
            <${Icon} name=${KINDS[ev.kind]?.icon || 'calendar'} size=${18} />
            <span class="today-main"><b>${ev.title}</b><small>${house ? 'House' : name(ev.owner)}</small></span>
          </a></li>`;
        })}
        ${list.length > 5 && html`<li class="more"><a href="#calendar">${list.length - 5} more</a></li>`}
      </ul>`}
    ${away.length > 0 && html`<p class="whos-home"><${Icon} name="bag" size=${16} /> Away tonight: ${away.map(name).join(', ')}.</p>`}
  </section>`;
}
