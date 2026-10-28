import { html, useState, Icon, Sheet, Chip, memberById, shortDate, today, toast } from '../ui.js';
import { parseDay, addDays, dayKey, daysBetween } from '../schedule.js';

const SUGGESTIONS = [
  { name: 'Furnace air filter', intervalDays: 90 },
  { name: 'Fridge water filter', intervalDays: 180 },
  { name: 'Test smoke and CO alarms', intervalDays: 30 },
  { name: 'Clean dryer vent', intervalDays: 180 },
  { name: 'Descale kettle', intervalDays: 60 },
  { name: 'Fridge clean-out', intervalDays: 14 },
];

/** Due date and a human label for an upkeep job. */
export function upkeepStatus(u, now = new Date()) {
  const due = addDays(parseDay(u.lastDone || today()), Number(u.intervalDays) || 30);
  const daysLeft = daysBetween(now, due);
  const interval = Number(u.intervalDays) || 30;
  let label;
  if (daysLeft < 0) label = `Overdue ${-daysLeft} day${daysLeft === -1 ? '' : 's'}`;
  else if (daysLeft === 0) label = 'Due today';
  else if (daysLeft === 1) label = 'Due tomorrow';
  else if (daysLeft <= 21) label = `Due in ${daysLeft} days`;
  else label = `Due ${shortDate(dayKey(due))}`;
  const tone = daysLeft <= 0 ? 'bad' : daysLeft <= Math.max(3, interval * 0.1) ? 'warn' : 'ok';
  const used = Math.min(1, Math.max(0, 1 - daysLeft / interval));
  return { due: dayKey(due), daysLeft, label, tone, used };
}

export function Upkeep({ st, hid, me, members, upkeep }) {
  const [editing, setEditing] = useState(null);
  const jobs = upkeep.map((u) => ({ ...u, s: upkeepStatus(u) })).sort((a, b) => a.s.daysLeft - b.s.daysLeft);
  const unused = SUGGESTIONS.filter((s) => !upkeep.some((u) => u.name.toLowerCase() === s.name.toLowerCase()));

  const markDone = async (u) => {
    const history = [{ date: today(), by: me }, ...(u.history || [])].slice(0, 12);
    await st.update(hid, 'upkeep', u.id, { lastDone: today(), lastDoneBy: me, history });
    toast(`${u.name}: next due ${shortDate(upkeepStatus({ ...u, lastDone: today() }).due)}`);
  };

  return html`
    <h1 class="page-title">Upkeep</h1>
    <p class="lede">Recurring house jobs. Mark one done and the timer restarts. Everyone gets a reminder the night before it's due.</p>
    ${jobs.length === 0 && html`<p class="empty">No jobs yet. Add the air filter or another job below.</p>`}
    <ul class="jobs">
      ${jobs.map((u) => html`<li class="job" key=${u.id}>
        <div class="job-main">
          <button class="job-name" onClick=${() => setEditing(u)}>${u.name}</button>
          <span class=${`due ${u.s.tone}`}>${u.s.label}</span>
        </div>
        <div class="gauge" role="meter" aria-label=${`${u.name} interval used`} aria-valuemin="0" aria-valuemax="100" aria-valuenow=${Math.round(u.s.used * 100)}>
          <span class=${`gauge-fill ${u.s.tone}`} style=${{ width: `${u.s.used * 100}%` }}></span>
        </div>
        <div class="job-foot">
          <span class="quiet">Every ${u.intervalDays} days · last done ${shortDate(u.lastDone)}${u.lastDoneBy ? html` by <${Chip} m=${memberById(members, u.lastDoneBy)} small />` : ''}</span>
          <button class="btn small" onClick=${() => markDone(u)}><${Icon} name="check" size=${18} /> Done today</button>
        </div>
        ${u.notes && html`<p class="job-notes">${u.notes}</p>`}
      </li>`)}
    </ul>
    <div class="actions"><button class="btn" onClick=${() => setEditing({ name: '', intervalDays: 30, lastDone: today(), notes: '' })}><${Icon} name="plus" /> Add a job</button></div>
    ${unused.length > 0 && html`
      <h2 class="sub">Common jobs</h2>
      <div class="chip-row">${unused.map((s) => html`<button class="pill" onClick=${() => setEditing({ ...s, lastDone: today(), notes: '' })}>${s.name}</button>`)}</div>`}

    ${editing && html`<${JobSheet} job=${editing} onClose=${() => setEditing(null)}
      onDelete=${editing.id && (async () => { if (confirm(`Delete ${editing.name}?`)) { await st.remove(hid, 'upkeep', editing.id); setEditing(null); } })}
      onSave=${async (j) => {
        const { id, s, ...data } = j;
        if (id) await st.update(hid, 'upkeep', id, data); else await st.add(hid, 'upkeep', data);
        setEditing(null);
      }} />`}`;
}

function JobSheet({ job, onClose, onSave, onDelete }) {
  const [j, setJ] = useState(job);
  const set = (p) => setJ({ ...j, ...p });
  return html`<${Sheet} title=${job.id ? 'Edit job' : 'New job'} onClose=${onClose}
    actions=${html`
      ${onDelete && html`<button class="btn danger" onClick=${onDelete}>Delete</button>`}
      <button class="btn primary grow" onClick=${() => j.name.trim() ? onSave({ ...j, intervalDays: Math.max(1, Number(j.intervalDays) || 1) }) : toast('Name the job')}>Save job</button>`}>
    <label class="field"><span>Job</span><input value=${j.name} onInput=${(e) => set({ name: e.target.value })} placeholder="Furnace air filter" /></label>
    <div class="two">
      <label class="field"><span>Repeat every (days)</span><input type="number" inputmode="numeric" min="1" value=${j.intervalDays} onInput=${(e) => set({ intervalDays: e.target.value })} /></label>
      <label class="field"><span>Last done</span><input type="date" value=${j.lastDone} onInput=${(e) => set({ lastDone: e.target.value })} /></label>
    </div>
    <label class="field"><span>Notes</span><textarea rows="2" value=${j.notes} onInput=${(e) => set({ notes: e.target.value })} placeholder="Filter size, where it's kept"></textarea></label>
  <//>`;
}
