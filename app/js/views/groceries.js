import { html, useState, useEffect, useRef, useMemo, Icon, Chip, Sheet, memberById, toast } from '../ui.js';
import {
  statusOf, applyView, sectionize, orderAfterMove, nextSortOrder, statusPatch, parseEntry, bumpQty,
  SECTIONS, SORTS, idsOf,
} from '../grocery-model.js';
import { ItemEditor, TagManager, TagChip, DuplicateSheet, KIND_LABEL } from './grocery-edit.js';

// View options are per phone, like the friend's app: section, sort, filters.
const VIEW_KEY = 'tmo.groceryView';
const loadView = () => {
  try { return { section: 'none', sort: 'manual', filters: {}, ...JSON.parse(localStorage.getItem(VIEW_KEY) || '{}') }; }
  catch { return { section: 'none', sort: 'manual', filters: {} }; }
};

export function Groceries(props) {
  const { st, hid, me, members, groceries, tags = [] } = props;
  const [view, setViewState] = useState(loadView);
  const [search, setSearch] = useState(null); // null = closed
  const [text, setText] = useState('');
  const [sheet, setSheet] = useState(null);   // { type, ... }
  const [laterOpen, setLaterOpen] = useState(false);
  const setView = (p) => setViewState((v) => {
    const next = { ...v, ...p };
    try { localStorage.setItem(VIEW_KEY, JSON.stringify({ section: next.section, sort: next.sort, filters: next.filters })); } catch { /* private mode */ }
    return next;
  });

  // History entries clear themselves 60 days after checkoff (any phone can do the sweep).
  useEffect(() => {
    const now = Date.now();
    groceries.filter((g) => statusOf(g) === 'history' && g.purgeAt && g.purgeAt < now)
      .forEach((g) => st.remove(hid, 'groceries', g.id).catch(() => {}));
  }, [groceries.length]);

  const tagById = useMemo(() => Object.fromEntries(tags.map((t) => [t.id, t])), [tags]);
  const v = { ...view, search: search || '' };
  const active = applyView(groceries.filter((g) => statusOf(g) === 'active'), v);
  const later = applyView(groceries.filter((g) => statusOf(g) === 'later'), v);
  const allActive = groceries.filter((g) => statusOf(g) === 'active');
  const sectionTags = view.section === 'for'
    ? members.map((m) => ({ id: m.id, name: m.name, color: m.color }))
    : tags.filter((t) => t.kind === view.section).sort((a, b) => a.name.localeCompare(b.name));
  const sections = sectionize(active, view.section, sectionTags);
  const filterCount = Object.values(view.filters || {}).reduce((n, a) => n + (a?.length || 0), 0);
  const manual = view.sort === 'manual';

  // ---------- actions ----------
  const setStatus = async (g, status, msg) => {
    const before = { status: statusOf(g), done: !!g.done, checkedBy: g.checkedBy ?? null, checkedAt: g.checkedAt ?? null, purgeAt: g.purgeAt ?? null };
    try {
      await st.update(hid, 'groceries', g.id, statusPatch(status, me));
      if (msg) toast(msg, { label: 'Undo', run: () => st.update(hid, 'groceries', g.id, before) });
    } catch (e) { toast(`Couldn't update ${g.name}: ${e.message}`); }
  };
  const gotIt = (g, el) => { burst(el); setStatus(g, 'later', `${g.name}: got it for now`); };
  const forGood = (g, el) => { burst(el); setStatus(g, 'history', `${g.name}: bought for good`); };
  const addBack = (g) => setStatus(g, 'active', null);
  const remove = async (g) => {
    const { id, ...data } = g;
    try {
      await st.remove(hid, 'groceries', id);
      toast(`Deleted ${g.name}`, { label: 'Undo', run: () => st.set(hid, 'groceries', id, data) });
    } catch (e) { toast(`Couldn't delete ${g.name}: ${e.message}`); }
  };
  const move = (list, from, to) => {
    const order = orderAfterMove(list, from, to);
    if (order != null) st.update(hid, 'groceries', list[from].id, { sortOrder: order }).catch((e) => toast(e.message));
  };

  // Quick add: "2 milk, eggs". Items matching the current filters get those tags, like adding from a filtered view.
  const quickAdd = async (e) => {
    e.preventDefault();
    const parts = text.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    setText('');
    let order = nextSortOrder(groceries);
    const pre = {
      categoryIds: view.filters?.category || [], storeIds: view.filters?.store || [], forIds: view.filters?.for || [],
    };
    for (const p of parts) {
      const { name, qty } = parseEntry(p);
      const dupe = allActive.find((g) => g.name.trim().toLowerCase() === name.toLowerCase());
      if (dupe) {
        const choice = await new Promise((resolve) => setSheet({ type: 'dupe', name, existing: dupe, resolve }));
        setSheet(null);
        if (choice === 'bump') { await st.update(hid, 'groceries', dupe.id, { qty: bumpQty(dupe.qty, qty) }); continue; }
        if (choice !== 'add') continue;
      }
      // A name that's parked in Ready to add back just comes back to the list.
      const parked = groceries.find((g) => statusOf(g) === 'later' && g.name.trim().toLowerCase() === name.toLowerCase());
      if (parked) { await st.update(hid, 'groceries', parked.id, { ...statusPatch('active', me), ...(qty ? { qty } : {}) }); continue; }
      await st.add(hid, 'groceries', { name, qty, notes: '', ...pre, notify: false, addedBy: me, sortOrder: order, ...statusPatch('active', me) });
      order += 1000;
    }
  };

  const Row = ({ g, greyed, dragProps }) => {
    const who = memberById(members, g.addedBy);
    const chips = [...(g.categoryIds || []), ...(g.storeIds || [])].map((id) => tagById[id]).filter(Boolean);
    const forM = (g.forIds || []).map((id) => memberById(members, id)).filter(Boolean);
    return html`<div class=${`gitem ${greyed ? 'greyed' : ''}`}>
      <button class="gcheck" onClick=${(e) => (greyed ? addBack(g) : gotIt(g, e.currentTarget))}
              aria-label=${greyed ? `Put ${g.name} back on the list` : `Got ${g.name} for now`}>
        <span class="gcircle">${greyed && html`<${Icon} name="check" size=${16} />`}</span>
      </button>
      <button class="gbody" onClick=${() => (greyed ? addBack(g) : setSheet({ type: 'edit', item: g }))}
              aria-label=${greyed ? `Put ${g.name} back on the list` : `Edit ${g.name}`}>
        <span class="gname">${g.name}${g.qty && html`<span class="g-qty">${g.qty}</span>`}</span>
        ${g.notes && html`<span class="gnotes">${g.notes}</span>`}
        <span class="gtags">
          ${chips.map((t) => html`<${TagChip} tag=${t} small />`)}
          ${forM.map((m) => html`<span class="gfor" style=${{ '--c': m.color }}>for ${m.id === me ? 'you' : m.name}</span>`)}
          ${who && html`<span class="gby">added by ${who.id === me ? 'you' : who.name}</span>`}
        </span>
      </button>
      ${!greyed && html`<button class="icon-btn subtle gforgood" onClick=${(e) => forGood(g, e.currentTarget)} aria-label=${`Bought ${g.name} for good`} title="Bought for good">
        <${Icon} name="checks" size=${22} /></button>`}
      <button class="icon-btn subtle" onClick=${() => setSheet({ type: 'menu', item: g })} aria-label=${`More for ${g.name}`}><${Icon} name="dots" size=${20} /></button>
      ${dragProps && html`<span class="ghandle" ...${dragProps} aria-hidden="true"><${Icon} name="grip" size=${20} /></span>`}
    </div>`;
  };

  return html`
    <div class="page-head row-head">
      <div><h1 class="page-title">Groceries</h1>
        <p class="page-sub">${allActive.length ? `${allActive.length} to buy` : 'All stocked up'}</p></div>
      <div class="head-tools">
        <button class=${`icon-btn tool ${search !== null ? 'on' : ''}`} onClick=${() => setSearch(search === null ? '' : null)} aria-label="Search"><${Icon} name=${search === null ? 'search' : 'x'} /></button>
        <button class=${`icon-btn tool ${filterCount || view.section !== 'none' || view.sort !== 'manual' ? 'on' : ''}`} onClick=${() => setSheet({ type: 'view' })} aria-label="View options">
          <${Icon} name="sliders" />${filterCount > 0 && html`<b class="badge">${filterCount}</b>`}</button>
      </div>
    </div>

    ${search !== null && html`<div class="adder"><input value=${search} onInput=${(e) => setSearch(e.target.value)} placeholder="Search names and notes" aria-label="Search groceries" autofocus /></div>`}

    <form class="adder big" onSubmit=${quickAdd}>
      <input value=${text} onInput=${(e) => setText(e.target.value)} placeholder="Add items: 2 milk, eggs"
             aria-label="Add grocery items, separate with commas" enterkeyhint="done" autocomplete="off" />
      <button type="button" class="btn" onClick=${() => { setSheet({ type: 'edit', item: null, initialName: text.split(',')[0]?.trim() || '' }); setText(''); }} aria-label="Add with details"><${Icon} name="edit" /></button>
      <button class="btn primary" aria-label="Add to list"><${Icon} name="plus" size=${24} /></button>
    </form>

    ${(filterCount > 0) && html`<div class="active-filters">
      ${['category', 'store', 'for'].flatMap((k) => (view.filters[k] || []).map((id) => {
        const t = k === 'for' ? (() => { const m = memberById(members, id); return m && { id, name: `For ${m.name}`, color: m.color }; })() : tagById[id];
        return t && html`<${TagChip} tag=${t} on=${true} onClick=${() => setView({ filters: { ...view.filters, [k]: view.filters[k].filter((x) => x !== id) } })} />`;
      }))}
      <button class="link" onClick=${() => setView({ filters: {} })}>Clear filters</button>
    </div>`}

    ${active.length === 0 && later.length === 0 ? html`<div class="empty">
        <p><b>${filterCount || search ? 'Nothing matches this view.' : 'The list is empty.'}</b></p>
        <p>${filterCount || search ? 'Clear the search or filters to see everything.' : 'Add what the house needs. Everyone sees it straight away.'}</p></div>`
      : sections.map((s) => html`<section class="gsection" key=${s.key}>
          ${s.title && html`<h2 class="gsection-title"><i style=${{ background: s.color || 'var(--ink-3)' }}></i>${s.title}<span>${s.items.length}</span></h2>`}
          ${s.items.length > 0 && html`<${Sortable} items=${s.items} enabled=${manual && !search} onMove=${(a, b) => move(s.items, a, b)}
              render=${(g, dragProps) => html`<${Row} g=${g} dragProps=${dragProps} />`} />`}
        </section>`)}
    ${active.length === 0 && later.length > 0 && html`<p class="hint">Everything's bought. Tap something below to put it back on the list.</p>`}

    ${later.length > 0 && html`<section class="later">
      <button class="later-head" onClick=${() => setLaterOpen(!laterOpen)} aria-expanded=${String(laterOpen)}>
        <span>Ready to add back</span><b>${later.length}</b><${Icon} name=${laterOpen ? 'up' : 'down'} size=${18} />
      </button>
      ${laterOpen && html`<div class="glist">${later.map((g) => html`<${Row} key=${g.id} g=${g} greyed />`)}</div>`}
      ${laterOpen && html`<p class="hint">Things you got for now. Tap one to put it back on the list.</p>`}
    </section>`}

    <a class="history-link" href="#groceries/history"><${Icon} name="clock" size=${18} /> Purchase history</a>

    ${sheet?.type === 'edit' && html`<${ItemEditor} ...${props} item=${sheet.item} initialName=${sheet.initialName} onClose=${() => setSheet(null)} />`}
    ${sheet?.type === 'dupe' && html`<${DuplicateSheet} name=${sheet.name} existing=${sheet.existing} onChoose=${sheet.resolve} />`}
    ${sheet?.type === 'tags' && html`<${TagManager} st=${st} hid=${hid} tags=${tags} groceries=${groceries} onClose=${() => setSheet(null)} />`}
    ${sheet?.type === 'view' && html`<${ViewSheet} view=${view} setView=${setView} tags=${tags} members=${members}
      onManage=${() => setSheet({ type: 'tags' })} onClose=${() => setSheet(null)} />`}
    ${sheet?.type === 'menu' && html`<${ItemMenu} g=${sheet.item} onClose=${() => setSheet(null)}
      onEdit=${() => setSheet({ type: 'edit', item: sheet.item })}
      onAddBack=${() => { addBack(sheet.item); setSheet(null); }}
      onForGood=${() => { setStatus(sheet.item, 'history', `${sheet.item.name}: bought for good`); setSheet(null); }}
      onDelete=${() => { remove(sheet.item); setSheet(null); }} />`}`;
}

function ItemMenu({ g, onClose, onEdit, onAddBack, onForGood, onDelete }) {
  const s = statusOf(g);
  return html`<${Sheet} title=${g.name} onClose=${onClose}>
    <div class="menu">
      <button onClick=${onEdit}><${Icon} name="edit" /><span><b>Edit</b><small>Name, quantity, notes, categories, stores, who it's for</small></span></button>
      ${s === 'later' && html`<button onClick=${onAddBack}><${Icon} name="undo" /><span><b>Back on the list</b></span></button>`}
      <button onClick=${onForGood}><${Icon} name="checks" /><span><b>Bought for good</b><small>Moves it to purchase history. Clears itself after 60 days.</small></span></button>
      <button class="danger" onClick=${onDelete}><${Icon} name="trash" /><span><b>Delete</b><small>For typos and duplicates. Leaves no history.</small></span></button>
    </div>
  <//>`;
}

function ViewSheet({ view, setView, tags, members, onManage, onClose }) {
  const toggle = (kind, id) => {
    const cur = view.filters?.[kind] || [];
    setView({ filters: { ...view.filters, [kind]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] } });
  };
  const filterGroup = (kind, list, label) => list.length > 0 && html`<fieldset><legend>${label}</legend>
    <div class="chip-row">${list.map((t) => html`<${TagChip} tag=${t} on=${(view.filters?.[kind] || []).includes(t.id)} onClick=${() => toggle(kind, t.id)} />`)}</div></fieldset>`;
  const hasFilters = Object.values(view.filters || {}).some((a) => a?.length);
  return html`<${Sheet} title="View options" onClose=${onClose}
    actions=${html`${hasFilters && html`<button class="btn" onClick=${() => setView({ filters: {} })}>Clear filters</button>`}<button class="btn primary" onClick=${onClose}>Done</button>`}>
    <fieldset><legend>Sections</legend>
      <div class="chip-row">${SECTIONS.map(([k, l]) => html`<button type="button" class=${`pill choice ${view.section === k ? 'on' : ''}`} aria-pressed=${String(view.section === k)} onClick=${() => setView({ section: k })}>${l}</button>`)}</div>
    </fieldset>
    <fieldset><legend>Sort</legend>
      <div class="chip-row">${SORTS.map(([k, l]) => html`<button type="button" class=${`pill choice ${view.sort === k ? 'on' : ''}`} aria-pressed=${String(view.sort === k)} onClick=${() => setView({ sort: k })}>${l}</button>`)}</div>
      ${view.sort === 'manual' && html`<p class="hint">Drag the handle on the right of an item to reorder. Everyone shares the same order.</p>`}
    </fieldset>
    <p class="sheet-sub">Show only</p>
    ${filterGroup('category', tags.filter((t) => t.kind === 'category'), 'Categories')}
    ${filterGroup('store', tags.filter((t) => t.kind === 'store'), 'Stores')}
    ${filterGroup('for', members.map((m) => ({ id: m.id, name: m.name, color: m.color })), "Who it's for")}
    ${!tags.length && html`<p class="hint">No categories or stores yet. Add some to sort and filter by them.</p>`}
    <button class="btn" onClick=${onManage}><${Icon} name="edit" /> Manage categories and stores</button>
  <//>`;
}

export function History({ st, hid, me, members, groceries }) {
  const items = groceries.filter((g) => statusOf(g) === 'history').sort((a, b) => (b.checkedAt || 0) - (a.checkedAt || 0));
  const when = (ts) => {
    if (!ts) return '';
    const d = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / 86400000);
    if (d <= 0) return 'today';
    if (d === 1) return 'yesterday';
    if (d < 7) return `${d} days ago`;
    return new Date(ts).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  };
  const addBack = async (g) => {
    try { await st.update(hid, 'groceries', g.id, statusPatch('active', me)); toast(`${g.name} is back on the list`); }
    catch (e) { toast(e.message); }
  };
  return html`
    <div class="page-head with-back">
      <a class="icon-btn" href="#groceries" aria-label="Back to groceries"><${Icon} name="back" /></a>
      <h1 class="page-title">Purchase history</h1>
    </div>
    <p class="page-sub">Things the house actually bought. Each entry clears itself 60 days after it was checked off.</p>
    ${items.length === 0 ? html`<div class="empty"><p><b>Nothing here yet.</b></p><p>Use the double tick on an item to mark it bought for good.</p></div>` : html`
      <ul class="rows">
        ${items.map((g) => {
          const by = memberById(members, g.checkedBy);
          return html`<li class="row">
            <span class="hist-main"><b>${g.name}${g.qty ? html`<span class="g-qty">${g.qty}</span>` : ''}</b>
              <small>${by ? (by.id === me ? 'You' : by.name) : 'Someone'}, ${when(g.checkedAt)}</small></span>
            <button class="btn small" onClick=${() => addBack(g)}>Add back</button>
          </li>`;
        })}
      </ul>`}`;
}

/** Drag-to-reorder by a handle. Works with touch and mouse via pointer events. */
function Sortable({ items, enabled, onMove, render }) {
  const listRef = useRef(null);
  const [drag, setDrag] = useState(null); // { from, to, dy }
  const startDrag = (index) => (e) => {
    if (!enabled) return;
    e.preventDefault();
    const rows = [...listRef.current.children];
    const rects = rows.map((r) => r.getBoundingClientRect());
    const startY = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
    let state = { from: index, to: index, dy: 0 };
    setDrag(state);
    const onMoveEv = (ev) => {
      const dy = ev.clientY - startY;
      const mid = rects[index].top + rects[index].height / 2 + dy;
      let to = index;
      rects.forEach((r, i) => { if (i < index && mid < r.top + r.height / 2) to = Math.min(to, i); if (i > index && mid > r.top + r.height / 2) to = Math.max(to, i); });
      state = { from: index, to, dy };
      setDrag(state);
    };
    const end = () => {
      removeEventListener('pointermove', onMoveEv);
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', end);
      setDrag(null);
      if (state.to !== state.from) onMove(state.from, state.to);
    };
    addEventListener('pointermove', onMoveEv);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
  };
  const shift = (i) => {
    if (!drag) return 0;
    if (i === drag.from) return drag.dy;
    const h = listRef.current?.children[drag.from]?.offsetHeight || 0;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -h;
    if (drag.from > drag.to && i >= drag.to && i < drag.from) return h;
    return 0;
  };
  return html`<div class="glist" ref=${listRef}>
    ${items.map((g, i) => html`<div key=${g.id} class=${`gwrap ${drag?.from === i ? 'dragging' : ''}`}
        style=${{ transform: drag ? `translateY(${shift(i)}px)` : undefined, transition: drag && drag.from !== i ? 'transform .15s' : 'none' }}>
      ${render(g, enabled ? { onPointerDown: startDrag(i), role: 'button', 'aria-label': `Drag ${g.name}` } : null)}
    </div>`)}
  </div>`;
}

/** A small celebratory burst where an item was checked off. */
function burst(el) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = el.getBoundingClientRect();
  const host = document.createElement('div');
  host.className = 'burst';
  host.style.left = `${r.left + r.width / 2}px`;
  host.style.top = `${r.top + r.height / 2}px`;
  const colors = ['var(--warning)', 'var(--safe)', 'var(--mandatory)', 'var(--owe)'];
  for (let i = 0; i < 10; i++) {
    const p = document.createElement('i');
    const a = (i / 10) * Math.PI * 2;
    p.style.setProperty('--x', `${Math.cos(a) * 34}px`);
    p.style.setProperty('--y', `${Math.sin(a) * 34}px`);
    p.style.background = colors[i % colors.length];
    host.appendChild(p);
  }
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 600);
}
