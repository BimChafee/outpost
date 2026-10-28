import { html, useState, Icon, Chip, Sheet, toast } from '../ui.js';
import { parseDay } from '../schedule.js';
import { KINDS, kindsFor, REPEATS, normaliseEvent, whenText, repeatText, occurrences } from '../calendar-model.js';

const longDate = (k) => parseDay(k).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });

export function EventEditor({ st, hid, me, members, event, initial, onClose }) {
  const isEdit = !!event?.id;
  const base = event || {};
  const [f, setF] = useState(() => ({
    title: base.title || '', owner: base.owner || initial?.owner || me,
    kind: base.kind || (initial?.owner === 'house' ? 'party' : 'plans'),
    date: base.date || initial?.date, endDate: base.endDate || base.date || initial?.date,
    allDay: base.allDay ?? false, start: base.start || '18:00', end: base.end || '',
    location: base.location || '', notes: base.notes || '',
    repeat: base.repeat || 'none', until: base.until || '', skip: base.skip || [], every: base.every || 8,
    going: base.going || [], notGoing: base.notGoing || [],
  }));
  const [saving, setSaving] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const setOwner = (owner) => {
    const kinds = kindsFor(owner);
    set({ owner, kind: kinds.some((k) => k.id === f.kind) ? f.kind : kinds[0].id });
  };
  const setDate = (date) => {
    // Keep the length of a multi-day event when its start moves.
    const len = f.endDate && f.date ? Math.round((parseDay(f.endDate) - parseDay(f.date)) / 86400000) : 0;
    const end = new Date(parseDay(date)); end.setDate(end.getDate() + Math.max(0, len));
    set({ date, endDate: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}` });
  };

  const save = async () => {
    const r = normaliseEvent(f);
    if (!r.ok) return toast(r.error);
    setSaving(true);
    try {
      if (isEdit) await st.update(hid, 'events', event.id, r.doc);
      else await st.add(hid, 'events', { ...r.doc, createdBy: me });
      toast(isEdit ? 'Event saved' : 'Event added');
      onClose();
    } catch (e) { toast(`Couldn't save: ${e.message}`); setSaving(false); }
  };

  const lanes = [{ id: 'house', name: 'House', color: 'var(--warning)' }, ...members];
  return html`<${Sheet} title=${isEdit ? 'Edit event' : 'Add an event'} onClose=${onClose}
    actions=${html`<button class="btn" onClick=${onClose}>Cancel</button>
      <button class="btn primary" disabled=${saving} onClick=${save}>${isEdit ? 'Save event' : 'Add event'}</button>`}>
    <fieldset><legend>Whose calendar?</legend>
      <div class="chip-row">${lanes.map((l) => html`<button type="button" class=${`lane-chip ${f.owner === l.id ? 'on' : ''} ${l.id === 'house' ? 'house' : ''}`} style=${{ '--c': l.color }}
          aria-pressed=${String(f.owner === l.id)} onClick=${() => setOwner(l.id)}>
        <span class="lane-dot">${l.id === 'house' ? html`<${Icon} name="home" size=${14} />` : l.name[0]}</span>${l.id === 'house' ? 'The house' : l.id === me ? 'Me' : l.name}</button>`)}</div>
    </fieldset>
    <label class="field"><span>What's on?</span><input value=${f.title} onInput=${(e) => set({ title: e.target.value })}
      placeholder=${f.owner === 'house' ? 'Halloween party' : 'Shift at work'} autofocus=${!isEdit} /></label>
    <fieldset><legend>Type</legend>
      <div class="kind-grid">${kindsFor(f.owner).map((k) => html`<button type="button" class=${`kind-opt ${f.kind === k.id ? 'on' : ''}`} aria-pressed=${String(f.kind === k.id)} onClick=${() => set({ kind: k.id })}>
        <${Icon} name=${k.icon} size=${20} /><span>${k.label}</span></button>`)}</div>
    </fieldset>
    <label class="switch-row"><span><b>All day</b><small>No set times. Good for trips and birthdays.</small></span>
      <input type="checkbox" role="switch" checked=${f.allDay} onChange=${(e) => set({ allDay: e.target.checked })} /></label>
    <div class="when-grid">
      <label class="field"><span>Starts</span><input type="date" value=${f.date} onInput=${(e) => setDate(e.target.value)} /></label>
      ${!f.allDay && html`<label class="field"><span>at</span><input type="time" value=${f.start} onInput=${(e) => set({ start: e.target.value })} /></label>`}
      <label class="field"><span>Ends</span><input type="date" value=${f.endDate} min=${f.date} onInput=${(e) => set({ endDate: e.target.value })} /></label>
      ${!f.allDay && html`<label class="field"><span>at</span><input type="time" value=${f.end} onInput=${(e) => set({ end: e.target.value })} /></label>`}
    </div>
    <div class="two">
      <label class="field"><span>Repeats</span>
        <select value=${f.repeat} onChange=${(e) => set({ repeat: e.target.value })}>
          ${REPEATS.map(([k, l]) => html`<option value=${k}>${l}</option>`)}
        </select></label>
      ${f.repeat !== 'none' && html`<label class="field narrow"><span>Until (optional)</span><input type="date" value=${f.until} min=${f.date} onInput=${(e) => set({ until: e.target.value })} /></label>`}
    </div>
    ${f.repeat === 'custom' && html`<div class="every-row">
      <label class="field"><span>Repeat every</span>
        <span class="every-input"><input type="number" inputmode="numeric" min="1" max="366" step="1" value=${f.every}
          onInput=${(e) => set({ every: e.target.value })} aria-label="Number of days between repeats" /><b>days</b></span></label>
      <${NextDates} f=${f} />
    </div>`}
    <label class="field"><span>Where</span><input value=${f.location} onInput=${(e) => set({ location: e.target.value })} placeholder=${f.owner === 'house' ? 'Backyard' : 'Optional'} /></label>
    <label class="field"><span>Notes</span><textarea rows="2" value=${f.notes} onInput=${(e) => set({ notes: e.target.value })} placeholder=${f.owner === 'house' ? 'Bring a dish, music off by 1 a.m.' : 'Optional'}></textarea></label>
  <//>`;
}

/** The next few dates a repeating event lands on, so a rotation can be checked before saving. */
function NextDates({ f }) {
  const n = Math.round(Number(f.every));
  if (!f.date || !(n >= 1 && n <= 366)) return null;
  const end = new Date(parseDay(f.date)); end.setDate(end.getDate() + n * 3);
  const to = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  const next = occurrences([{ ...f, id: 'preview', repeat: 'custom', every: n, endDate: f.date }], f.date, to).slice(0, 4);
  const fmt = (k) => { const d = parseDay(k); return `${d.toLocaleDateString('en-CA', { weekday: 'short' })} ${d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`; };
  return html`<p class="hint every-next">Lands on ${next.map((o) => fmt(o.date)).join(', ')}${next.length ? ', and so on.' : ''}</p>`;
}

export function EventDetail({ st, hid, me, members, o, onClose, onEdit }) {
  const ev = o.ev;
  const owner = members.find((m) => m.id === ev.owner);
  const house = ev.owner === 'house';
  const kind = KINDS[ev.kind];
  const repeating = ev.repeat && ev.repeat !== 'none';
  const going = ev.going || [], notGoing = ev.notGoing || [];
  const myAnswer = going.includes(me) ? 'going' : notGoing.includes(me) ? 'no' : null;

  const rsvp = async (answer) => {
    const g = going.filter((x) => x !== me), n = notGoing.filter((x) => x !== me);
    if (answer === 'going') g.push(me); else if (answer === 'no') n.push(me);
    try { await st.update(hid, 'events', ev.id, { going: g, notGoing: n }); onClose(); toast(answer === 'going' ? "You're going" : "Marked as can't make it"); }
    catch (e) { toast(e.message); }
  };
  const del = async (all) => {
    if (!confirm(all ? `Delete ${ev.title}${repeating ? ' and every repeat' : ''}?` : `Skip ${ev.title} on ${longDate(o.date)}?`)) return;
    try {
      if (all) {
        const { id, ...data } = ev;
        await st.remove(hid, 'events', id);
        toast(`Deleted ${ev.title}`, { label: 'Undo', run: () => st.set(hid, 'events', id, data) });
      } else {
        await st.update(hid, 'events', ev.id, { skip: [...(ev.skip || []), o.date] });
        toast(`Skipped ${longDate(o.date)}`, { label: 'Undo', run: () => st.update(hid, 'events', ev.id, { skip: ev.skip || [] }) });
      }
      onClose();
    } catch (e) { toast(`Couldn't delete: ${e.message}`); }
  };
  const names = (ids) => ids.map((id) => members.find((m) => m.id === id)).filter(Boolean);

  return html`<${Sheet} title=${ev.title} onClose=${onClose}
    actions=${html`<button class="btn" onClick=${onEdit}><${Icon} name="edit" /> Edit</button>
      <button class="btn danger" onClick=${() => del(true)}><${Icon} name="trash" /> ${repeating ? 'Delete all' : 'Delete'}</button>`}>
    <div class=${`evhero ${house ? 'house' : ''}`} style=${{ '--c': house ? 'var(--warning)' : owner?.color }}>
      <span class="evhero-icon"><${Icon} name=${kind?.icon || 'calendar'} size=${26} /></span>
      <div><b>${longDate(o.date)}</b><span>${whenText(o)}</span>
        ${repeating && html`<span class="evrepeat"><${Icon} name="repeat" size=${15} /> ${repeatText(ev)}</span>`}</div>
    </div>
    <ul class="evfacts">
      <li><span>Calendar</span><b>${house ? 'The house' : owner ? html`<${Chip} m=${owner} small /> ${owner.id === me ? 'You' : owner.name}` : 'Someone'}</b></li>
      <li><span>Type</span><b>${kind?.label || 'Event'}</b></li>
      ${ev.location && html`<li><span>Where</span><b>${ev.location}</b></li>`}
      ${ev.notes && html`<li class="notes"><span>Notes</span><b>${ev.notes}</b></li>`}
    </ul>
    ${house && html`<div class="rsvp">
      <p><b>Are you in?</b> ${going.length ? `Going: ${names(going).map((m) => (m.id === me ? 'you' : m.name)).join(', ')}.` : 'Nobody has said yet.'}
        ${notGoing.length ? ` Can't make it: ${names(notGoing).map((m) => (m.id === me ? 'you' : m.name)).join(', ')}.` : ''}</p>
      <div class="rsvp-btns">
        <button class=${`btn ${myAnswer === 'going' ? 'primary' : ''}`} aria-pressed=${String(myAnswer === 'going')} onClick=${() => rsvp(myAnswer === 'going' ? null : 'going')}><${Icon} name="check" /> Going</button>
        <button class=${`btn ${myAnswer === 'no' ? 'primary' : ''}`} aria-pressed=${String(myAnswer === 'no')} onClick=${() => rsvp(myAnswer === 'no' ? null : 'no')}><${Icon} name="x" /> Can't make it</button>
      </div>
    </div>`}
    ${repeating && html`<button class="link danger-link" onClick=${() => del(false)}>Skip just ${longDate(o.date)}</button>`}
  <//>`;
}
