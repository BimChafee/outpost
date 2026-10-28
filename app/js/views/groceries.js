import { html, useState, Icon, Chip, memberById, toast } from '../ui.js';

const parseEntry = (raw) => {
  const s = raw.trim();
  const m = s.match(/^(\d+)\s*x?\s+(.+)$/i) || s.match(/^(.+?)\s+x\s*(\d+)$/i);
  if (!m) return { name: cap(s), qty: '' };
  return /^\d+$/.test(m[1]) ? { name: cap(m[2]), qty: m[1] } : { name: cap(m[1]), qty: m[2] };
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function Groceries({ st, hid, me, members, groceries, household }) {
  const [text, setText] = useState('');
  const open = groceries.filter((g) => !g.done);
  const done = groceries.filter((g) => g.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const onList = new Set(open.map((g) => g.name.toLowerCase()));
  const again = (household.recentGroceries || []).filter((n) => !onList.has(n.toLowerCase())).slice(0, 12);

  const addNames = async (entries) => {
    for (const { name, qty } of entries) {
      if (onList.has(name.toLowerCase())) { toast(`${name} is already on the list`); continue; }
      onList.add(name.toLowerCase());
      await st.add(hid, 'groceries', { name, qty, addedBy: me, done: false });
    }
  };
  const add = (e) => {
    e.preventDefault();
    const parts = text.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    setText('');
    addNames(parts.map(parseEntry));
  };
  const toggle = (g) => st.update(hid, 'groceries', g.id, g.done
    ? { done: false, doneBy: null, doneAt: null }
    : { done: true, doneBy: me, doneAt: Date.now() });
  const remove = async (g) => {
    const { id, ...data } = g;
    await st.remove(hid, 'groceries', id);
    toast(`Removed ${g.name}`, { label: 'Undo', run: () => st.set(hid, 'groceries', id, data) });
  };
  const clearBought = async () => {
    const names = done.map((g) => g.name);
    const recent = [...names, ...(household.recentGroceries || []).filter((n) => !names.some((x) => x.toLowerCase() === n.toLowerCase()))].slice(0, 30);
    await st.updateHousehold(hid, { recentGroceries: recent });
    for (const g of done) await st.remove(hid, 'groceries', g.id);
    toast(`Cleared ${names.length} bought item${names.length === 1 ? '' : 's'}`);
  };

  const Row = ({ g }) => {
    const who = memberById(members, g.done ? g.doneBy : g.addedBy);
    return html`
      <li class=${`grocery ${g.done ? 'done' : ''}`}>
        <button class="tick" onClick=${() => toggle(g)} aria-pressed=${String(!!g.done)}
                aria-label=${g.done ? `Put ${g.name} back on the list` : `Mark ${g.name} bought`}>
          <span class="tick-box">${g.done && html`<${Icon} name="check" size=${18} />`}</span>
          <span class="g-name">${g.name}${g.qty && html`<span class="g-qty">${g.qty}</span>`}</span>
        </button>
        <span class="g-who" title=${g.done ? `Bought by ${who?.name}` : `Added by ${who?.name}`}><${Chip} m=${who} small label=${g.done ? `Bought by ${who?.name}` : `Added by ${who?.name}`} /></span>
        <button class="icon-btn subtle" onClick=${() => remove(g)} aria-label=${`Remove ${g.name}`}><${Icon} name="x" size=${18} /></button>
      </li>`;
  };

  return html`
    <div class="page-head"><h1 class="page-title">Groceries</h1>
      <p class="page-sub">${open.length ? `${open.length} to buy` : 'All stocked up'}</p></div>
    <form class="adder big" onSubmit=${add}>
      <input value=${text} onInput=${(e) => setText(e.target.value)} placeholder="Add items: 2 milk, eggs"
             aria-label="Add grocery items, separate with commas" enterkeyhint="done" autocomplete="off" />
      <button class="btn primary" aria-label="Add to list"><${Icon} name="plus" size=${24} /></button>
    </form>

    ${again.length > 0 && html`
      <div class="again">
        <p class="again-label">Add again</p>
        <div class="again-row">${again.map((n) => html`<button class="pill" onClick=${() => addNames([{ name: n, qty: '' }])}><${Icon} name="plus" size=${16} />${n}</button>`)}</div>
      </div>`}

    ${open.length === 0 ? html`<div class="empty"><p><b>The list is empty.</b></p><p>Add what the house needs. Everyone sees it straight away.</p></div>` : html`
      <ul class="glist">${open.map((g) => html`<${Row} key=${g.id} g=${g} />`)}</ul>`}

    ${done.length > 0 && html`
      <section class="block">
        <div class="block-head"><h2 class="block-title">In the cart</h2><button class="btn small" onClick=${clearBought}>Clear ${done.length}</button></div>
        <ul class="glist">${done.map((g) => html`<${Row} key=${g.id} g=${g} />`)}</ul>
        <p class="hint">Cleared items show up under Add again next time.</p>
      </section>`}`;
}
