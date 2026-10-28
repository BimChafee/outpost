import { html, useMemo, nameOf } from '../ui.js';
import { upcomingPickups, whenLabel, STREAMS, parseDay } from '../schedule.js';
import { balances, settleUp, fmt } from '../money.js';
import { upkeepStatus } from './upkeep.js';

export function Home({ bundledSchedule, liveSchedule, upkeep, ledger, groceries, members, me, household }) {
  const pickups = useMemo(() => upcomingPickups(bundledSchedule, liveSchedule, new Date(), 5), [bundledSchedule, liveSchedule]);
  const next = pickups[0];
  const later = pickups.slice(1);
  const label = next && whenLabel(next.date);
  const binNight = label === 'Tomorrow';

  const bal = useMemo(() => balances(ledger, members.map((m) => m.id)), [ledger, members]);
  const mine = settleUp(bal).filter((t) => t.from === me || t.to === me);
  const open = groceries.filter((g) => !g.done);
  const jobs = upkeep.map((u) => ({ ...u, s: upkeepStatus(u) })).sort((a, b) => a.s.daysLeft - b.s.daysLeft);

  return html`
    ${next && html`
      <section class=${`pickup ${binNight ? 'pickup-tonight' : ''}`} aria-labelledby="pickup-h">
        <p class="pickup-when">
          ${binNight ? 'Bins out tonight' : label === 'Today' ? 'Collection today, out by 7 a.m.' : 'Next collection'}
        </p>
        <h1 id="pickup-h" class="pickup-day">
          ${label === 'Tomorrow' || label === 'Today' ? parseDay(next.date).toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' }) : label}
        </h1>
        <ul class="bins">
          ${next.streams.map((k) => html`<li class="bin" style=${{ '--bin': STREAMS[k].color }}><span class="bin-can" aria-hidden="true"></span>${STREAMS[k].label}</li>`)}
        </ul>
        ${next.estimated && html`<p class="pickup-note">Estimated. Peel hasn't published this date yet.</p>`}
        <ol class="pickup-later" aria-label="Following collections">
          ${later.map((p) => html`<li>
            <span class="pl-date">${parseDay(p.date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</span>
            <span class="pl-dots">${p.streams.map((k) => html`<i style=${{ background: STREAMS[k].color }} title=${STREAMS[k].label}></i>`)}</span>
            <span class="pl-names">${p.streams.map((k) => STREAMS[k].label).join(', ')}${p.estimated ? ' (est.)' : ''}</span>
          </li>`)}
        </ol>
      </section>`}

    <section class="block" aria-labelledby="money-h">
      <div class="block-head"><h2 id="money-h">Money</h2><a href="#ledger">Bills</a></div>
      ${mine.length === 0 ? html`<p class="quiet">You're square with everyone.</p>` : html`
        <ul class="rows">
          ${mine.map((t) => html`<li class="row">
            <span>${t.from === me ? html`You owe <b>${nameOf(members, t.to, me)}</b>` : html`<b>${nameOf(members, t.from, me)}</b> owes you`}</span>
            <span class=${`amt ${t.from === me ? 'neg' : 'pos'}`}>${fmt(t.amount)}</span>
          </li>`)}
        </ul>`}
    </section>

    <section class="block" aria-labelledby="up-h">
      <div class="block-head"><h2 id="up-h">Upkeep</h2><a href="#upkeep">All jobs</a></div>
      ${jobs.length === 0 ? html`<p class="quiet">No upkeep jobs yet. <a href="#upkeep">Add one</a>.</p>` : html`
        <ul class="rows">
          ${jobs.slice(0, 3).map((j) => html`<li class="row">
            <span>${j.name}</span>
            <span class=${`due ${j.s.tone}`}>${j.s.label}</span>
          </li>`)}
        </ul>`}
    </section>

    <section class="block" aria-labelledby="gr-h">
      <div class="block-head"><h2 id="gr-h">Groceries</h2><a href="#groceries">${open.length ? `${open.length} to buy` : 'Open list'}</a></div>
      ${open.length === 0 ? html`<p class="quiet">Nothing on the list.</p>` : html`
        <p class="inline-list">${open.slice(0, 6).map((g) => g.name).join(' · ')}${open.length > 6 ? ` and ${open.length - 6} more` : ''}</p>`}
    </section>
    <p class="footnote">${household.address || ''}</p>`;
}
