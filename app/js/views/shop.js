import { html, useState, useMemo, Icon, Sheet, toast } from '../ui.js';
import { treasury, owned, shopState, SHOP } from '../outpost-model.js';
import { OutpostScene } from './scene.js';
import { TreasuryPlate, Gold, useLevelUp, LevelUp } from './quests.js';

export function Shop({ st, hid, me, questlog = [] }) {
  const t = useMemo(() => treasury(questlog), [questlog]);
  const own = useMemo(() => owned(questlog), [questlog]);
  const [fresh, setFresh] = useState(null);
  const [buying, setBuying] = useState(null);
  const [lvl, dismissLvl] = useLevelUp(hid, t.level);
  const built = Object.values(own).reduce((a, b) => a + b, 0);

  const buy = async (item) => {
    const s = shopState(item, own[item.id], t.level, t.gold);
    if (!s.affordable) return;
    setBuying(null);
    try {
      const id = await st.add(hid, 'questlog', { type: 'purchase', itemId: item.id, title: s.next, by: me, gold: -s.price, xp: 0, at: Date.now() });
      setFresh(item.id);
      setTimeout(() => setFresh(null), 1600);
      window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      toast(`Built: ${s.next}`, { label: 'Undo', run: () => st.remove(hid, 'questlog', id) });
    } catch (e) { toast(`Couldn't buy it: ${e.message}`); }
  };

  const items = SHOP.map((item) => ({ item, s: shopState(item, own[item.id], t.level, t.gold), n: own[item.id] }));
  const sorted = [
    ...items.filter((x) => !x.s.locked && !x.s.maxed),
    ...items.filter((x) => x.s.locked),
    ...items.filter((x) => x.s.maxed),
  ];

  return html`
    <div class="page-head"><h1 class="page-title">Shop</h1>
      <p class="page-sub">${built ? `${built} upgrade${built === 1 ? '' : 's'} built. Spend quest gold to fortify the outpost.` : 'Spend quest gold to fortify the outpost.'}</p></div>

    <figure class="scene-frame">
      <${OutpostScene} own=${own} fresh=${fresh} level=${t.level} />
      <figcaption>${t.title}, level ${t.level}</figcaption>
    </figure>

    <${TreasuryPlate} t=${t} compact />

    <ul class="shop">
      ${sorted.map(({ item, s, n }) => html`<li class=${`ware ${s.locked ? 'locked' : ''} ${s.maxed ? 'maxed' : ''}`}>
        <span class="ware-icon" aria-hidden="true"><${WareIcon} id=${item.id} /></span>
        <div class="ware-main">
          <div class="ware-head"><b>${item.name}</b>
            <span class="ware-tiers" aria-label=${`${n} of ${item.tiers.length} built`}>${item.tiers.map((_, i) => html`<i class=${i < n ? 'on' : ''}></i>`)}</span></div>
          <span class="ware-next">${s.maxed ? `Fully built: ${s.current}` : s.current ? `${s.current} now. Next: ${s.next}` : s.next}</span>
          <small>${item.blurb}</small>
        </div>
        <div class="ware-buy">
          ${s.maxed ? html`<span class="ware-done"><${Icon} name="check" size=${18} /> Built</span>`
            : s.locked ? html`<span class="ware-lock">Level ${item.unlock}</span>`
            : html`<button class=${`btn small ${s.affordable ? 'primary' : ''}`} disabled=${!s.affordable} onClick=${() => setBuying(item)}
                aria-label=${`Buy ${s.next} for ${s.price} gold`}><${Gold} n=${s.price} /></button>
              ${!s.affordable && html`<small class="ware-short">${s.short} more</small>`}`}
        </div>
      </li>`)}
    </ul>
    <p class="hint">Purchases come out of the house treasury, and everyone sees the outpost grow. Gold comes from finishing quests.</p>

    ${buying && (() => {
      const s = shopState(buying, own[buying.id], t.level, t.gold);
      return html`<${Sheet} title=${`Build ${s.next}?`} onClose=${() => setBuying(null)}
        actions=${html`<button class="btn" onClick=${() => setBuying(null)}>Cancel</button>
          <button class="btn primary" onClick=${() => buy(buying)}>Build for ${s.price} gold</button>`}>
        <p class="lede">${buying.blurb} The house has <b>${t.gold.toLocaleString('en-CA')} gold</b>; this leaves ${(t.gold - s.price).toLocaleString('en-CA')}.</p>
        <div class="scene-frame small"><${OutpostScene} own=${{ ...own, [buying.id]: own[buying.id] + 1 }} fresh=${buying.id} level=${t.level} /></div>
      <//>`;
    })()}
    ${lvl && html`<${LevelUp} level=${lvl} title=${t.title} onClose=${dismissLvl} />`}`;
}

const WARE = {
  walls: 'M3 20V9l3-3 3 3v11M9 20V9l3-3 3 3v11M15 20V9l3-3 3 3v11M2 20h20',
  rooms: 'M3 20V9h8v11M11 20V5h10v15M6 12h2M14 9h4M14 13h4M2 20h20',
  lights: 'M12 21V9M8 5h8l-2 4h-4zM5 3l2 2M19 3l-2 2M12 1v2',
  flag: 'M6 21V3M6 4h11l-3 4 3 4H6',
  tower: 'M8 21l1.5-12h5L16 21M7 9h10V6l-5-3-5 3zM9 15h6',
  guards: 'M12 7a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM12 7v8M8 10h8M12 15l-3 6M12 15l3 6M17 9V3',
  drill: 'M7 21L12 3l5 18M8.5 15h7M10 9h4M5 21h14',
  greenhouse: 'M4 21V12a8 8 0 0116 0v9zM12 4v17M4 14h16M8 6.5V21M16 6.5V21',
  radar: 'M5 15a8 5 30 0115-7zM12 12l-4-5M11 19h4l-2-6',
  moat: 'M2 14q5-3 10 0t10 0M2 19q5-3 10 0t10 0M5 10V5M19 10V5M5 5h14',
  pad: 'M3 16a9 4 0 0018 0 9 4 0 00-18 0M9 14v4M15 14v4M9 16h6M12 4v6M10 6h4',
};
const WareIcon = ({ id }) => html`<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d=${WARE[id]} /></svg>`;
