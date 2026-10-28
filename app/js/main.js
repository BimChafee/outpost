import { html, render, useEffect, useState, Icon, Toasts, toast } from './ui.js';
import { openStore, session } from './store.js';
import { listenForeground } from './push.js';
import { Home } from './views/home.js';
import { Groceries } from './views/groceries.js';
import { Ledger } from './views/ledger.js';
import { BillEditor } from './views/bill.js';
import { Upkeep } from './views/upkeep.js';
import { Settings } from './views/settings.js';
import { Setup } from './views/setup.js';

const TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'groceries', label: 'Groceries', icon: 'cart' },
  { id: 'ledger', label: 'Bills', icon: 'ledger' },
  { id: 'upkeep', label: 'Upkeep', icon: 'wrench' },
];

const readRoute = () => {
  const [tab, ...rest] = (location.hash.slice(1) || 'home').split('/');
  return { tab, arg: rest.join('/') };
};
export const go = (path) => { location.hash = path; };

function useRoute() {
  const [r, setR] = useState(readRoute());
  useEffect(() => {
    const f = () => { setR(readRoute()); window.scrollTo(0, 0); };
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return r;
}

/** Subscribes to the whole household. Small data set, so everything is kept live in memory. */
function useHousehold(st, hid) {
  const [state, set] = useState({ household: undefined, groceries: [], ledger: [], upkeep: [], liveSchedule: null });
  useEffect(() => {
    if (!hid) return;
    const patch = (k) => (v) => set((s) => ({ ...s, [k]: v }));
    const offs = [
      st.watchHousehold(hid, patch('household')),
      st.watch(hid, 'groceries', patch('groceries')),
      st.watch(hid, 'ledger', patch('ledger')),
      st.watch(hid, 'upkeep', patch('upkeep')),
      st.watchMeta(hid, 'schedule', patch('liveSchedule')),
    ];
    return () => offs.forEach((off) => off && off());
  }, [st, hid]);
  return state;
}

function App({ st, bundledSchedule }) {
  const [hid, setHid] = useState(session.hid);
  const [me, setMe] = useState(session.me);
  const route = useRoute();
  const data = useHousehold(st, hid);

  useEffect(() => { listenForeground(st, (n) => toast(`${n.title || 'Outpost'}: ${n.body || ''}`)); }, [st]);

  const leave = () => { session.hid = null; session.me = null; setHid(null); setMe(null); go('home'); };

  if (!hid || data.household === null) {
    return html`<${Setup} st=${st} missing=${!!hid && data.household === null}
      onDone=${(h, m) => { session.hid = h; session.me = m; setHid(h); setMe(m); go('home'); }}
      onReset=${leave} />`;
  }
  if (data.household === undefined) return html`<div class="boot">Opening the outpost…</div>`;

  const members = data.household.members || [];
  if (!me || !members.some((m) => m.id === me)) {
    return html`<${Setup} st=${st} pickMemberFor=${data.household}
      onDone=${(h, m) => { session.me = m; setMe(m); }} onReset=${leave} />`;
  }

  const ctx = { st, hid, me, members, household: data.household, ...data, bundledSchedule, go };
  const { tab, arg } = route;
  let view;
  if (tab === 'groceries') view = html`<${Groceries} ...${ctx} />`;
  else if (tab === 'ledger') view = html`<${Ledger} ...${ctx} />`;
  else if (tab === 'bill') view = html`<${BillEditor} ...${ctx} billId=${arg} />`;
  else if (tab === 'upkeep') view = html`<${Upkeep} ...${ctx} />`;
  else if (tab === 'settings') view = html`<${Settings} ...${ctx} onLeave=${leave} onSwitchMe=${(m) => { session.me = m; setMe(m); }} />`;
  else view = html`<${Home} ...${ctx} />`;

  const activeTab = tab === 'bill' ? 'ledger' : tab;
  return html`
    <header class="topbar">
      <a class="brand" href="#home" aria-label="Temporary Mining Outpost, home">
        <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><use href="#mark" /></svg>
        <span class="brand-name">Temporary Mining Outpost</span>
      </a>
      <span class=${`sync sync-${st.mode}`} title=${st.mode === 'shared' ? 'Synced with roommates' : 'Saved on this phone only'}>
        <span class="sync-label">${st.mode === 'shared' ? 'Synced' : 'This phone only'}</span>
      </span>
      <a class="icon-btn" href="#settings" aria-label="Settings"><${Icon} name="gear" /></a>
    </header>
    <main class="view" id="main">${view}</main>
    <nav class="tabbar" aria-label="Sections">
      ${TABS.map((t) => html`
        <a href=${'#' + t.id} class=${activeTab === t.id ? 'tab on' : 'tab'} aria-current=${activeTab === t.id ? 'page' : undefined}>
          <${Icon} name=${t.icon} /><span>${t.label}</span>
        </a>`)}
    </nav>
    <${Toasts} />`;
}

async function boot() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW registration failed', e));
  }
  const [st, bundledSchedule] = await Promise.all([
    openStore(),
    fetch('./data/schedule.json').then((r) => r.json()).catch(() => null),
  ]);
  render(html`<${App} st=${st} bundledSchedule=${bundledSchedule} />`, document.getElementById('app'));
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML =
    `<div class="boot">The app failed to start: ${String(e.message || e).replace(/</g, '&lt;')}. Reload to try again.</div>`;
});
