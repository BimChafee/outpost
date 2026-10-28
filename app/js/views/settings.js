import { html, useState, useEffect, Icon, Chip, MEMBER_COLORS, toast } from '../ui.js';
import { newId } from '../store.js';
import { enablePush, pushAvailable, pushPermission } from '../push.js';
import { CLAUDE_KEY } from './bill.js';
import { HouseDetails } from './house.js';
import { LookSettings } from './look.js';
import { questMasters, canManageQuests } from '../outpost-model.js';

function QuestMasters({ st, hid, household, members, me }) {
  const ids = questMasters(household, members);
  const can = canManageQuests(household, members, me);
  const toggle = async (id) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    if (!next.length) return toast('Keep at least one person who can create quests');
    try { await st.updateHousehold(hid, { questMasters: next }); } catch (e) { toast(e.message); }
  };
  return html`<section class="block">
    <h2>Who can create quests</h2>
    <div class="chip-row">${members.map((m) => html`<${Chip} m=${m} on=${ids.includes(m.id)} onClick=${can ? () => toggle(m.id) : undefined} />`)}</div>
    <p class="hint">${can ? 'They can add, edit and delete quests. Everyone can complete quests and spend gold in the Shop.' : 'Only they can change this. Everyone can complete quests and spend gold in the Shop.'}</p>
  </section>`;
}

function AppVersion() {
  const [state, setState] = useState('idle');
  const [version, setVersion] = useState('');
  useEffect(() => {
    if (!('caches' in self)) return;
    caches.keys().then((keys) => setVersion((keys.find((k) => k.startsWith('tmo-')) || '').replace('tmo-v', ''))).catch(() => {});
  }, []);
  const check = async () => {
    setState('checking');
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
      if (reg?.installing || reg?.waiting) { setState('updating'); return; } // reloads itself when it takes over
      setState('latest');
    } catch { setState('offline'); }
  };
  return html`<section class="block">
    <h2>App version</h2>
    <p class="quiet">${version ? `Version ${version}.` : ''} ${state === 'latest' ? "You're on the latest version." : state === 'updating' ? 'Updating. The app will reload in a moment.' : state === 'offline' ? "Couldn't reach the server. Check your connection." : 'New versions load automatically when you reopen the app.'}</p>
    <button class="btn" onClick=${check} disabled=${state === 'checking' || state === 'updating'}>${state === 'checking' ? 'Checking…' : 'Check for updates'}</button>
  </section>`;
}

export function Settings({ st, hid, me, members, household, onLeave, onSwitchMe }) {
  const [newName, setNewName] = useState('');
  const [key, setKey] = useState(localStorage.getItem(CLAUDE_KEY) || '');
  const [perm, setPerm] = useState(pushPermission());
  const [busy, setBusy] = useState(false);
  const invite = `${location.origin}${location.pathname}?join=${hid}`;

  const saveMembers = (ms) => st.updateHousehold(hid, { members: ms });
  const rename = (id, name) => saveMembers(members.map((m) => (m.id === id ? { ...m, name } : m)));
  const addMember = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    saveMembers([...members, { id: newId(), name: newName.trim(), color: MEMBER_COLORS[members.length % MEMBER_COLORS.length] }]);
    setNewName('');
  };
  const removeMember = (m) => {
    if (m.id === me) return toast("You can't remove yourself here");
    if (confirm(`Remove ${m.name}? Their past bills stay in the ledger.`)) saveMembers(members.filter((x) => x.id !== m.id));
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Join our house app', text: `Household code: ${hid}`, url: invite });
      else { await navigator.clipboard.writeText(invite); toast('Invite link copied'); }
    } catch { /* share sheet dismissed */ }
  };
  const turnOnPush = async () => {
    setBusy(true);
    try { await enablePush(st, hid, me); setPerm(pushPermission()); toast('Notifications on for this phone'); }
    catch (e) { toast(e.message); setPerm(pushPermission()); }
    setBusy(false);
  };
  const saveKey = () => {
    if (key.trim()) localStorage.setItem(CLAUDE_KEY, key.trim()); else localStorage.removeItem(CLAUDE_KEY);
    toast(key.trim() ? 'Claude will read receipts' : 'Receipts will be read on the phone');
  };

  return html`
    <div class="page-head"><h1 class="page-title">Settings</h1></div>

    <section class="block">
      <h2>This phone belongs to</h2>
      <div class="chip-row">${members.map((m) => html`<${Chip} m=${m} on=${m.id === me} onClick=${() => onSwitchMe(m.id)} />`)}</div>
    </section>

    <section class="block">
      <h2>Roommates</h2>
      <ul class="rows">
        ${members.map((m) => html`<li class="row">
          <${Chip} m=${m} small />
          <input class="inline-input" value=${m.name} aria-label=${`Name for ${m.name}`} onChange=${(e) => e.target.value.trim() && rename(m.id, e.target.value.trim())} />
          <button class="icon-btn subtle" aria-label=${`Remove ${m.name}`} onClick=${() => removeMember(m)}><${Icon} name="trash" size=${18} /></button>
        </li>`)}
      </ul>
      <form class="adder" onSubmit=${addMember}>
        <input value=${newName} onInput=${(e) => setNewName(e.target.value)} placeholder="New roommate's name" aria-label="New roommate's name" />
        <button class="btn" aria-label="Add roommate"><${Icon} name="plus" /></button>
      </form>
    </section>

    <${LookSettings} />

    <${QuestMasters} st=${st} hid=${hid} household=${household} members=${members} me=${me} />

    <${HouseDetails} st=${st} hid=${hid} household=${household} />

    <section class="block">
      <h2>Invite roommates</h2>
      ${st.mode === 'shared' ? html`
        <p>Household code <code class="code">${hid}</code></p>
        <div class="actions">
          <button class="btn primary" onClick=${share}><${Icon} name="share" /> Share invite link</button>
        </div>
        <p class="hint">Anyone with the code can see and edit this household. Only share it with people who live here.</p>` : html`
        <p class="hint">This household is stored on this phone only. To share it, add your Firebase config to config.js and redeploy (see README). You'll then start a fresh shared household.</p>`}
    </section>

    <section class="block">
      <h2>Notifications</h2>
      ${!pushAvailable() ? html`<p class="hint">Bin-night and upkeep reminders need Firebase plus a Web Push key in config.js, and the nightly notifier set up on GitHub (see README).</p>`
        : perm === 'granted' ? html`<p>On for this phone. You'll get a reminder around 8 p.m. the night before collection, and when an upkeep job comes due.</p>
          <button class="link" onClick=${turnOnPush} disabled=${busy}>Re-register this phone</button>`
        : html`<p>Get a reminder the night before collection day and when upkeep is due.</p>
          <button class="btn primary" onClick=${turnOnPush} disabled=${busy}><${Icon} name="bell" /> Turn on notifications</button>`}
    </section>

    <section class="block">
      <h2>Receipt reading</h2>
      <p class="hint">By default receipts are read on the phone. For sharper results, paste an Anthropic API key and Claude will read them instead. The key stays on this phone; each scan costs a few cents.</p>
      <div class="adder">
        <input type="password" value=${key} onInput=${(e) => setKey(e.target.value)} placeholder="sk-ant-…" aria-label="Anthropic API key" autocomplete="off" />
        <button class="btn" onClick=${saveKey}>Save</button>
      </div>
    </section>

    <section class="block">
      <h2>Household</h2>
      <p class="quiet">${household.address}. ${st.mode === 'shared' ? 'Synced through Firebase.' : 'Stored on this phone only.'}</p>
      <button class="btn danger" onClick=${() => confirm('Disconnect this phone from the household? The data stays for your roommates.') && onLeave()}>Disconnect this phone</button>
    </section>

    <${AppVersion} />`;
}
