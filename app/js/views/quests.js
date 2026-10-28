import { html, useState, useMemo, useEffect, Icon, Chip, Sheet, memberById, nameOf, toast, today } from '../ui.js';
import { upcomingPickups, STREAMS, parseDay } from '../schedule.js';
import { newId } from '../store.js';
import {
  treasury, choreState, repeatLabel, stepReward, goalBounty, goalProgress, normaliseQuest, crewLedger,
  REWARDS, QUEST_REPEATS, STARTER_QUESTS, binQuest, canManageQuests, questMasters,
} from '../outpost-model.js';

const PREF = 'tmo.questsTab';
const coin = html`<svg class="coin" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" /><path d="M8 4.5v7M6 6.2h3.2a1.2 1.2 0 010 2.4H6.8a1.2 1.2 0 000 2.4H10" /></svg>`;
export const Gold = ({ n, sign }) => html`<span class="gold">${coin}<b>${sign && n > 0 ? '+' : ''}${Number(n).toLocaleString('en-CA')}</b></span>`;
const Reward = ({ gold, xp }) => html`<span class="reward"><${Gold} n=${gold} sign /><span class="xp">+${xp} XP</span></span>`;

/** Level, rank, gold and the XP bar. Shared by Quests, Shop and Home. */
export function TreasuryPlate({ t, compact }) {
  return html`<section class=${`treasury ${compact ? 'compact' : ''}`} aria-label="House treasury">
    <div class="tr-level"><small>Level</small><b>${t.level}</b></div>
    <div class="tr-main">
      <div class="tr-top"><span class="tr-rank">${t.title}</span><${Gold} n=${t.gold} /></div>
      <div class="tr-bar" role="meter" aria-label="Experience toward the next level" aria-valuemin="0" aria-valuemax=${t.span} aria-valuenow=${t.into}>
        <i style=${{ width: `${Math.min(100, (t.into / t.span) * 100)}%` }}></i>
      </div>
      <small class="tr-next">${t.toNext.toLocaleString('en-CA')} XP to level ${t.level + 1}</small>
    </div>
  </section>`;
}

/** A one-time celebration the first time this phone sees a new house level. */
export function useLevelUp(hid, level) {
  const key = `tmo.seenLevel.${hid}`;
  const [shown, setShown] = useState(null);
  useEffect(() => {
    let seen = 0;
    try { seen = Number(localStorage.getItem(key) || 0); } catch { /* private mode */ }
    if (!seen) { try { localStorage.setItem(key, String(level)); } catch { /* */ } return; }
    if (level > seen) setShown(level);
  }, [level]);
  const dismiss = () => { try { localStorage.setItem(key, String(level)); } catch { /* */ } setShown(null); };
  return [shown, dismiss];
}
export function LevelUp({ level, title, onClose }) {
  return html`<div class="levelup" role="dialog" aria-modal="true" aria-label=${`The outpost reached level ${level}`} onClick=${onClose}>
    <div class="lu-card">
      <div class="lu-burst" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => html`<i style=${{ '--a': `${i * 30}deg` }}></i>`)}</div>
      <p class="lu-kicker">The outpost reached</p>
      <p class="lu-level">Level ${level}</p>
      <p class="lu-rank">${title}</p>
      <p class="lu-hint">New fortifications may be unlocked in the Shop.</p>
      <button class="btn primary" onClick=${onClose}>Onward</button>
    </div>
  </div>`;
}

const award = (st, hid, entry) => st.add(hid, 'questlog', { ...entry, at: Date.now() });
const burst = (el) => {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = el.getBoundingClientRect();
  const host = document.createElement('div');
  host.className = 'coinburst';
  host.style.left = `${r.left + r.width / 2}px`; host.style.top = `${r.top + r.height / 2}px`;
  for (let i = 0; i < 8; i++) { const c = document.createElement('i'); c.style.setProperty('--a', `${i * 45 + 10}deg`); host.appendChild(c); }
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 800);
};

export function Quests(props) {
  const { st, hid, me, members, household, quests = [], questlog = [], bundledSchedule, liveSchedule } = props;
  const t = useMemo(() => treasury(questlog), [questlog]);
  const [tab, setTabState] = useState(() => { try { return localStorage.getItem(PREF) || 'chores'; } catch { return 'chores'; } });
  const setTab = (v) => { setTabState(v); try { localStorage.setItem(PREF, v); } catch { /* */ } };
  const [sheet, setSheet] = useState(null);
  const [lvl, dismissLvl] = useLevelUp(hid, t.level);
  const master = canManageQuests(household, members, me);
  const d = today();

  const pickups = useMemo(() => upcomingPickups(bundledSchedule, liveSchedule, new Date(), 2), [bundledSchedule, liveSchedule]);
  const bins = binQuest(pickups, questlog);
  const chores = quests.filter((q) => q.kind !== 'goal')
    .map((q) => ({ q, s: choreState(q, d) }))
    .sort((a, b) => (b.s.ready - a.s.ready) || ((b.q.assignee === me) - (a.q.assignee === me)) || (b.q.gold - a.q.gold));
  const goals = quests.filter((q) => q.kind === 'goal').sort((a, b) => (a.done - b.done) || (b.createdAt - a.createdAt));
  const readyCount = chores.filter((c) => c.s.ready).length + (bins && !bins.done ? 1 : 0);

  const complete = async (q, el) => {
    burst(el);
    const before = { lastDone: q.lastDone || '', lastDoneBy: q.lastDoneBy || null, doneCount: q.doneCount || 0, done: !!q.done };
    try {
      await st.update(hid, 'quests', q.id, { lastDone: d, lastDoneBy: me, doneCount: (q.doneCount || 0) + 1, done: q.repeat === 'once' });
      const logId = await award(st, hid, { type: 'quest', questId: q.id, title: q.title, by: me, gold: q.gold, xp: q.xp });
      toast(`${q.title}: +${q.gold} gold, +${q.xp} XP`, { label: 'Undo', run: () => { st.remove(hid, 'questlog', logId); st.update(hid, 'quests', q.id, before); } });
    } catch (e) { toast(`Couldn't complete it: ${e.message}`); }
  };
  const doBins = async (el) => {
    burst(el);
    try {
      const id = await award(st, hid, { type: 'bins', key: bins.key, title: 'Bins to the curb', by: me, gold: bins.gold, xp: bins.xp });
      toast(`Bins out: +${bins.gold} gold, +${bins.xp} XP`, { label: 'Undo', run: () => st.remove(hid, 'questlog', id) });
    } catch (e) { toast(e.message); }
  };
  const toggleStep = async (q, step, el) => {
    const key = `step@${q.id}@${step.id}`;
    if (step.done) {
      if (q.done) return toast('This goal is finished. Edit it to change its steps.');
      const entry = questlog.find((e) => e.key === key);
      await st.update(hid, 'quests', q.id, { steps: q.steps.map((s) => (s.id === step.id ? { ...s, done: false, doneBy: null, doneAt: null } : s)) });
      if (entry) await st.remove(hid, 'questlog', entry.id);
      return;
    }
    burst(el);
    const steps = q.steps.map((s) => (s.id === step.id ? { ...s, done: true, doneBy: me, doneAt: Date.now() } : s));
    const finished = steps.every((s) => s.done);
    const r = stepReward(q);
    try {
      await st.update(hid, 'quests', q.id, { steps, ...(finished ? { done: true, lastDone: d, lastDoneBy: me } : {}) });
      await award(st, hid, { type: 'step', key, questId: q.id, title: `${q.title}: ${step.title}`, by: me, gold: r.gold, xp: r.xp });
      if (finished) {
        const b = goalBounty(q);
        await award(st, hid, { type: 'goal', questId: q.id, title: q.title, by: me, gold: b.gold, xp: b.xp });
        toast(`Goal complete: ${q.title}. Bounty +${b.gold} gold, +${b.xp} XP`);
      } else toast(`${step.title}: +${r.gold} gold, +${r.xp} XP`);
    } catch (e) { toast(`Couldn't save it: ${e.message}`); }
  };
  const addStarters = async () => {
    for (const s of STARTER_QUESTS) {
      const { stepTitles, ...q } = s;
      await st.add(hid, 'quests', { ...q, every: q.every || null, assignee: null, notes: q.notes || '', steps: (stepTitles || []).map((title) => ({ id: newId(), title, done: false, doneBy: null, doneAt: null })), lastDone: '', lastDoneBy: null, doneCount: 0, done: false, createdBy: me });
    }
    toast('Starter quests added');
  };

  return html`
    <div class="page-head row-head">
      <div><h1 class="page-title">Quests</h1>
        <p class="page-sub">${readyCount ? `${readyCount} ready to do` : 'Everything is done for now'}</p></div>
      ${master && html`<button class="btn primary" onClick=${() => setSheet({ type: 'edit' })}><${Icon} name="plus" /> New quest</button>`}
    </div>

    <${TreasuryPlate} t=${t} />

    <div class="seg qtabs" role="tablist" aria-label="Quest views">
      ${[['chores', 'Chores'], ['goals', 'Goals'], ['log', 'Chronicle']].map(([k, l]) => html`
        <button role="tab" aria-selected=${String(tab === k)} class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}><b>${l}</b></button>`)}
    </div>

    ${tab === 'chores' && html`<section class="block" aria-label="Chores">
      ${bins && html`<div class=${`quest bins ${bins.done ? 'is-done' : ''}`}>
        <button class="qseal" disabled=${bins.done} onClick=${(e) => doBins(e.currentTarget)} aria-label="Complete Bins to the curb">${bins.done ? html`<${Icon} name="check" size=${20} />` : html`<${Icon} name="bin" size=${20} />`}</button>
        <div class="qbody"><b>Bins to the curb</b>
          <span class="qmeta">${bins.streams.map((s) => STREAMS[s].label).join(', ')} for ${parseDay(bins.date).toLocaleDateString('en-CA', { weekday: 'long' })}. ${bins.done ? 'Done.' : 'Out by 7 a.m.'}</span></div>
        <${Reward} gold=${bins.gold} xp=${bins.xp} />
      </div>`}
      ${chores.length === 0 && !bins ? html`<div class="empty"><p><b>No chores yet.</b></p>
          <p>${master ? 'Add your own, or start with a set of common ones.' : 'Bryan sets the quests. Ask him to add some.'}</p>
          ${master && html`<p><button class="btn primary" onClick=${addStarters}>Add starter quests</button></p>`}</div>` : ''}
      <ul class="qlist">
        ${chores.map(({ q, s }) => {
          const who = memberById(members, q.assignee);
          const last = memberById(members, q.lastDoneBy);
          return html`<li class=${`quest ${s.ready ? '' : 'cooling'} ${q.done ? 'is-done' : ''}`}>
            <button class="qseal" disabled=${!s.ready} onClick=${(e) => complete(q, e.currentTarget)} aria-label=${`Complete ${q.title}`}>
              ${s.ready ? html`<${Icon} name="check" size=${20} />` : html`<${Icon} name="clock" size=${18} />`}</button>
            <button class="qbody" onClick=${() => setSheet({ type: 'view', q })}>
              <b>${q.title}</b>
              <span class="qmeta">${repeatLabel(q)}${s.ready ? (s.overdueDays > 0 ? `, ready for ${s.overdueDays} day${s.overdueDays === 1 ? '' : 's'}` : ', ready now') : q.done ? ', done' : `, ready ${parseDay(s.next).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}`}</span>
              <span class="qmeta">${who ? html`For <${Chip} m=${who} small /> ${who.id === me ? 'you' : who.name}` : 'Anyone'}${last ? html`. Last done by ${last.id === me ? 'you' : last.name}` : ''}</span>
            </button>
            <${Reward} gold=${q.gold} xp=${q.xp} />
          </li>`;
        })}
      </ul>
    </section>`}

    ${tab === 'goals' && html`<section class="block" aria-label="Goals">
      ${goals.length === 0 && html`<div class="empty"><p><b>No long-term goals yet.</b></p><p>${master ? 'Goals are bigger projects split into steps. Each step pays a little; finishing pays a bounty.' : 'Bryan sets the goals.'}</p>
        ${master && html`<p><button class="btn primary" onClick=${() => setSheet({ type: 'edit', initial: { kind: 'goal' } })}>Add a goal</button></p>`}</div>`}
      ${goals.map((q) => {
        const p = goalProgress(q);
        const b = goalBounty(q);
        return html`<article class=${`goal ${q.done ? 'is-done' : ''}`}>
          <header class="goal-head">
            <button class="goal-title" onClick=${() => setSheet({ type: 'view', q })}>${q.title}</button>
            <span class="goal-bounty">${q.done ? 'Complete' : html`Bounty <${Gold} n=${b.gold} />`}</span>
          </header>
          ${q.notes && html`<p class="goal-notes">${q.notes}</p>`}
          <div class="goal-bar" role="meter" aria-label=${`${p.done} of ${p.total} steps done`} aria-valuemin="0" aria-valuemax=${p.total} aria-valuenow=${p.done}>
            ${q.steps.map((s) => html`<i class=${s.done ? 'on' : ''}></i>`)}
          </div>
          <ol class="steps-list">
            ${q.steps.map((s) => {
              const by = memberById(members, s.doneBy);
              return html`<li class=${s.done ? 'on' : ''}>
                <button class="step-check" aria-pressed=${String(!!s.done)} onClick=${(e) => toggleStep(q, s, e.currentTarget)} aria-label=${`${s.done ? 'Undo' : 'Complete'} step: ${s.title}`}>
                  ${s.done && html`<${Icon} name="check" size=${16} />`}</button>
                <span>${s.title}${by ? html`<small> ${by.id === me ? 'you' : by.name}</small>` : ''}</span>
              </li>`;
            })}
          </ol>
        </article>`;
      })}
    </section>`}

    ${tab === 'log' && html`<${Chronicle} log=${questlog} members=${members} me=${me} />`}

    ${!master && tab !== 'log' && html`<p class="hint">Only ${questMasters(household, members).map((id) => nameOf(members, id, null)).join(' and ') || 'Bryan'} can create and edit quests. Anyone can complete them.</p>`}

    ${sheet?.type === 'edit' && html`<${QuestEditor} ...${props} quest=${sheet.q} initial=${sheet.initial} onClose=${() => setSheet(null)} />`}
    ${sheet?.type === 'view' && html`<${QuestDetail} ...${props} q=${sheet.q} master=${master} onClose=${() => setSheet(null)}
        onEdit=${() => setSheet({ type: 'edit', q: sheet.q })} />`}
    ${lvl && html`<${LevelUp} level=${lvl} title=${t.title} onClose=${dismissLvl} />`}`;
}

function Chronicle({ log, members, me }) {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const crew = crewLedger(log, members, monthStart.getTime());
  const top = Math.max(1, ...crew.map((c) => c.gold));
  const entries = [...log].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 60);
  const groups = [];
  for (const e of entries) {
    const k = new Date(e.at || 0).toDateString();
    if (!groups.length || groups[groups.length - 1][0] !== k) groups.push([k, []]);
    groups[groups.length - 1][1].push(e);
  }
  return html`<section class="block" aria-labelledby="crew-h">
    <h2 id="crew-h" class="block-title">Crew ledger, ${monthStart.toLocaleDateString('en-CA', { month: 'long' })}</h2>
    <ul class="crew">
      ${crew.map((c) => {
        const m = memberById(members, c.id);
        return html`<li><span class="bal-name"><${Chip} m=${m} small />${m.id === me ? 'You' : m.name}</span>
          <span class="crew-bar"><i style=${{ width: `${(Math.max(0, c.gold) / top) * 100}%`, background: m.color }}></i></span>
          <span class="crew-n"><${Gold} n=${c.gold} /><small>${c.count} done</small></span></li>`;
      })}
    </ul>
    <h2 class="block-title">Chronicle</h2>
    ${entries.length === 0 ? html`<p class="quiet">Nothing yet. Completed quests and purchases show up here.</p>` : groups.map(([k, list]) => html`
      <div class="chron-day"><h3>${new Date(k).toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
        <ul class="chron">${list.map((e) => html`<li class=${`ch-${e.type}`}>
          <span class="ch-who">${nameOf(members, e.by, me)}</span>
          <span class="ch-what">${e.type === 'purchase' ? `built ${e.title}` : e.type === 'goal' ? `finished ${e.title}` : e.title}</span>
          <${Gold} n=${e.gold} sign />
        </li>`)}</ul></div>`)}
  </section>`;
}

function QuestDetail({ st, hid, me, members, q, master, onClose, onEdit }) {
  const del = async () => {
    if (!confirm(`Delete ${q.title}? Gold already earned stays.`)) return;
    const { id, ...data } = q;
    try { await st.remove(hid, 'quests', id); toast(`Deleted ${q.title}`, { label: 'Undo', run: () => st.set(hid, 'quests', id, data) }); onClose(); }
    catch (e) { toast(e.message); }
  };
  const who = memberById(members, q.assignee);
  return html`<${Sheet} title=${q.title} onClose=${onClose}
    actions=${master ? html`<button class="btn" onClick=${onEdit}><${Icon} name="edit" /> Edit</button><button class="btn danger" onClick=${del}><${Icon} name="trash" /> Delete</button>` : null}>
    <ul class="evfacts">
      <li><span>Reward</span><b><${Reward} gold=${q.gold} xp=${q.xp} /></b></li>
      <li><span>Repeats</span><b>${repeatLabel(q)}</b></li>
      <li><span>For</span><b>${who ? html`<${Chip} m=${who} small /> ${who.id === me ? 'You' : who.name}` : 'Anyone'}</b></li>
      <li><span>Done</span><b>${q.doneCount || 0} time${q.doneCount === 1 ? '' : 's'}</b></li>
      ${q.notes && html`<li class="notes"><span>Notes</span><b>${q.notes}</b></li>`}
    </ul>
    ${!master && html`<p class="hint">Only Bryan can edit or delete quests.</p>`}
  <//>`;
}

function QuestEditor({ st, hid, me, members, quest, initial, onClose }) {
  const isEdit = !!quest?.id;
  const base = quest || initial || {};
  const [f, setF] = useState(() => ({
    title: base.title || '', kind: base.kind || 'chore', notes: base.notes || '',
    gold: base.gold ?? 25, xp: base.xp ?? 25, repeat: base.repeat || 'weekly', every: base.every || 3,
    assignee: base.assignee || null, steps: base.steps?.length ? base.steps : [{ id: newId(), title: '' }],
  }));
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const preset = REWARDS.find((r) => r.gold === Number(f.gold) && r.xp === Number(f.xp))?.id;
  const save = async () => {
    const r = normaliseQuest(f);
    if (!r.ok) return toast(r.error);
    try {
      if (isEdit) await st.update(hid, 'quests', quest.id, r.doc);
      else await st.add(hid, 'quests', { ...r.doc, lastDone: '', lastDoneBy: null, doneCount: 0, done: false, createdBy: me });
      toast(isEdit ? 'Quest saved' : 'Quest added');
      onClose();
    } catch (e) { toast(`Couldn't save: ${e.message}`); }
  };
  const setStep = (id, title) => set({ steps: f.steps.map((s) => (s.id === id ? { ...s, title } : s)) });
  return html`<${Sheet} title=${isEdit ? 'Edit quest' : 'New quest'} onClose=${onClose}
    actions=${html`<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" onClick=${save}>${isEdit ? 'Save quest' : 'Add quest'}</button>`}>
    ${!isEdit && html`<div class="seg seg2" role="radiogroup" aria-label="Quest type">
      ${[['chore', 'Chore', 'Repeats, like cleaning'], ['goal', 'Long-term goal', 'A project in steps']].map(([k, l, d]) => html`
        <button role="radio" aria-checked=${String(f.kind === k)} class=${f.kind === k ? 'on' : ''} onClick=${() => set({ kind: k })}><b>${l}</b><small>${d}</small></button>`)}
    </div>`}
    <label class="field"><span>Quest</span><input value=${f.title} onInput=${(e) => set({ title: e.target.value })} placeholder=${f.kind === 'goal' ? 'Clear out the garage' : 'Clean the kitchen'} autofocus=${!isEdit} /></label>
    <fieldset><legend>Reward</legend>
      <div class="kind-grid">${REWARDS.map((r) => html`<button type="button" class=${`kind-opt reward-opt ${preset === r.id ? 'on' : ''}`} aria-pressed=${String(preset === r.id)} onClick=${() => set({ gold: r.gold, xp: r.xp })}>
        <span><b>${r.label}</b><small>${r.gold} gold, ${r.hint.toLowerCase()}</small></span></button>`)}</div>
      <div class="two"><label class="field"><span>Gold</span><input type="number" inputmode="numeric" min="0" value=${f.gold} onInput=${(e) => set({ gold: e.target.value })} /></label>
        <label class="field narrow"><span>XP</span><input type="number" inputmode="numeric" min="0" value=${f.xp} onInput=${(e) => set({ xp: e.target.value })} /></label></div>
      ${f.kind === 'goal' && html`<p class="hint">Steps share ${Math.round(0.2 * 100)}% of the reward as they're done; the rest is the bounty for finishing.</p>`}
    </fieldset>
    ${f.kind === 'chore' ? html`
      <div class="two"><label class="field"><span>Repeats</span><select value=${f.repeat} onChange=${(e) => set({ repeat: e.target.value })}>
        ${QUEST_REPEATS.map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></label>
        ${f.repeat === 'custom' && html`<label class="field narrow"><span>Every (days)</span><input type="number" inputmode="numeric" min="1" max="366" value=${f.every} onInput=${(e) => set({ every: e.target.value })} /></label>`}</div>
      <fieldset><legend>Who's it for?</legend><div class="chip-row">
        <button type="button" class=${`pill choice ${!f.assignee ? 'on' : ''}`} aria-pressed=${String(!f.assignee)} onClick=${() => set({ assignee: null })}>Anyone</button>
        ${members.map((m) => html`<${Chip} m=${m} on=${f.assignee === m.id} onClick=${() => set({ assignee: m.id })} />`)}</div></fieldset>` : html`
      <fieldset><legend>Steps, in order</legend>
        <ol class="step-edit">${f.steps.map((s, i) => html`<li>
          <input value=${s.title} onInput=${(e) => setStep(s.id, e.target.value)} placeholder=${`Step ${i + 1}`} aria-label=${`Step ${i + 1}`} />
          <button class="icon-btn subtle" aria-label=${`Remove step ${i + 1}`} onClick=${() => set({ steps: f.steps.filter((x) => x.id !== s.id) })}><${Icon} name="x" size=${16} /></button>
        </li>`)}</ol>
        <button class="link" onClick=${() => set({ steps: [...f.steps, { id: newId(), title: '' }] })}>Add a step</button>
      </fieldset>`}
    <label class="field"><span>Notes</span><textarea rows="2" value=${f.notes} onInput=${(e) => set({ notes: e.target.value })} placeholder="What counts as done"></textarea></label>
  <//>`;
}
