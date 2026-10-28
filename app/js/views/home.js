import { html, useMemo, nameOf, Sign, Cart, Icon } from '../ui.js';
import { upcomingPickups, whenLabel, STREAMS, parseDay } from '../schedule.js';
import { balances, settleUp, fmt } from '../money.js';
import { upkeepStatus } from './upkeep.js';

const listNames = (keys) => {
  const n = keys.map((k) => STREAMS[k].label.toLowerCase());
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : n[0];
};

function CurbBoard({ pickups }) {
  const next = pickups[0];
  if (!next) return null;
  const label = whenLabel(next.date);
  const tonight = label === 'Tomorrow';
  const isToday = label === 'Today';
  const d = parseDay(next.date);
  const weekday = d.toLocaleDateString('en-CA', { weekday: 'long' });
  const date = d.toLocaleDateString('en-CA', { month: 'long', day: 'numeric' });

  return html`
    <section class=${`curb ${tonight ? 'curb-tonight' : ''} ${isToday ? 'curb-today' : ''}`} aria-labelledby="curb-h">
      ${tonight && html`<div class="curb-alert"><${Sign} kind="warning" size=${26} /><span>Bins out tonight</span></div>`}
      <div class="curb-head">
        <p class="curb-kicker">${tonight ? 'Pickup tomorrow morning' : isToday ? 'Pickup today. Out by 7 a.m.' : 'Next pickup'}</p>
        <h1 id="curb-h" class="curb-day">${isToday ? 'Today' : weekday}<span>${date}</span></h1>
      </div>
      <div class="curb-scene" aria-label=${`Goes out: ${listNames(next.streams)}`}>
        <ul class="curb-carts">
          ${next.streams.map((k, i) => html`<li style=${{ '--i': i }}>
            <${Cart} stream=${k} size=${tonight ? 70 : 60} />
            <span>${STREAMS[k].label}</span>
          </li>`)}
        </ul>
        <div class="curb-line" aria-hidden="true"></div>
      </div>
      ${next.estimated && html`<p class="curb-note">Estimated date. Peel hasn't published it yet.</p>`}
      <ol class="curb-weeks" aria-label="Following pickups">
        ${pickups.slice(1).map((p) => html`<li>
          <span class="cw-date">${parseDay(p.date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</span>
          <span class="cw-carts">${p.streams.map((k) => html`<${Cart} stream=${k} size=${22} />`)}</span>
          <span class="cw-names">${p.streams.includes('garbage') ? 'Garbage week' : 'Recycling week'}${p.estimated ? ', est.' : ''}</span>
        </li>`)}
      </ol>
    </section>`;
}

export function Home({ bundledSchedule, liveSchedule, upkeep, ledger, groceries, members, me }) {
  const pickups = useMemo(() => upcomingPickups(bundledSchedule, liveSchedule, new Date(), 5), [bundledSchedule, liveSchedule]);
  const bal = useMemo(() => balances(ledger, members.map((m) => m.id)), [ledger, members]);
  const transfers = settleUp(bal);
  const open = groceries.filter((g) => (g.status || (g.done ? 'later' : 'active')) === 'active');
  const jobs = upkeep.map((u) => ({ ...u, s: upkeepStatus(u) })).sort((a, b) => a.s.daysLeft - b.s.daysLeft);

  const needs = [];
  for (const t of transfers.filter((t) => t.from === me)) {
    needs.push({ kind: 'owe', title: `Pay ${nameOf(members, t.to, me)} ${fmt(t.amount)}`, detail: 'Send an e-Transfer, then record it in Bills.', href: '#ledger' });
  }
  for (const j of jobs.filter((j) => j.s.daysLeft <= 7)) {
    needs.push({ kind: 'warning', title: `${j.name}: ${j.s.label[0].toLowerCase() + j.s.label.slice(1)}`, detail: 'Tap Done in Upkeep once it’s handled.', href: '#upkeep', overdue: j.s.daysLeft < 0 });
  }
  for (const t of transfers.filter((t) => t.to === me)) {
    needs.push({ kind: 'safe', title: `${nameOf(members, t.from, me)} owes you ${fmt(t.amount)}`, detail: 'Record it in Bills when it arrives.', href: '#ledger' });
  }
  const nextJob = jobs.find((j) => j.s.daysLeft > 7);
  const mineNet = bal[me] || 0;

  return html`
    <${CurbBoard} pickups=${pickups} />

    <section class="block" aria-labelledby="needs-h">
      <h2 id="needs-h" class="block-title">Needs you</h2>
      ${needs.length === 0 ? html`
        <div class="sign-row calm"><${Sign} kind="safe" /><div><b>Nothing right now</b><span>You're square with everyone and nothing is due this week.</span></div></div>` : html`
        <ul class="signs">
          ${needs.map((n) => html`<li><a class=${`sign-row ${n.overdue ? 'overdue' : ''}`} href=${n.href}>
            <${Sign} kind=${n.kind} />
            <div><b>${n.title}</b><span>${n.detail}</span></div>
          </a></li>`)}
        </ul>`}
    </section>

    <section class="block" aria-labelledby="house-h">
      <h2 id="house-h" class="block-title">Around the house</h2>
      <ul class="house">
        <li><a href="#groceries">
          <span class="house-icon"><${Icon} name="cart" /></span>
          <span class="house-main"><b>Groceries</b><span>${open.length ? open.slice(0, 4).map((g) => g.name).join(', ') + (open.length > 4 ? `, and ${open.length - 4} more` : '') : 'Nothing on the list'}</span></span>
          <span class="house-num">${open.length || ''}</span>
        </a></li>
        <li><a href="#ledger">
          <span class="house-icon"><${Icon} name="ledger" /></span>
          <span class="house-main"><b>Your balance</b><span>${mineNet === 0 ? 'Square with everyone' : mineNet > 0 ? 'Others owe you overall' : 'You owe overall'}</span></span>
          <span class=${`house-num money ${mineNet < 0 ? 'neg' : mineNet > 0 ? 'pos' : ''}`}>${mineNet === 0 ? '' : fmt(Math.abs(mineNet))}</span>
        </a></li>
        <li><a href="#upkeep">
          <span class="house-icon"><${Icon} name="wrench" /></span>
          <span class="house-main"><b>Upkeep</b><span>${nextJob ? `Next: ${nextJob.name}, ${nextJob.s.label[0].toLowerCase() + nextJob.s.label.slice(1)}` : jobs.length ? 'See what’s due' : 'Add the air filter and other jobs'}</span></span>
          <span class="house-num"></span>
        </a></li>
      </ul>
    </section>`;
}
