import { html, useState, Icon, Chip, memberById, toast } from '../ui.js';

const parseEntry = (raw) => {
  const s = raw.trim();
  const m = s.match(/^(\d+)\s*x?\s+(.+)$/i) || s.match(/^(.+?)\s+x\s*(\d+)$/i);
  if (!m) return { name: s, qty: '' };
  return /^\d+$/.test(m[1]) ? { name: m[2], qty: m[1] } : { name: m[1], qty: m[2] };
};

export function Groceries({ st, hid, me, members, groceries }) {
  const [text, setText] = useState('');
  const open = groceries.filter((g) => !g.done);
  const done = groceries.filter((g) => g.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));

  const add = async (e) => {
    e.preventDefault();
    const parts = text.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    setText('');
    for (const p of parts) {
      const { name, qty } = parseEntry(p);
      const dupe = open.find((g) => g.name.toLowerCase() === name.toLowerCase());
      if (dupe) { toast(`${name} is already on the list`); continue; }
      await st.add(hid, 'groceries', { name, qty, addedBy: me, done: false });
    }
  };
  const toggle = (g) => st.update(hid, 'groceries', g.id, g.done
    ? { done: false, doneBy: null, doneAt: null }
    : { done: true, doneBy: me, doneAt: Date.now() });
  const remove = (g) => st.remove(hid, 'groceries', g.id);
  const clearBought = async () => { for (const g of done) await st.remove(hid, 'groceries', g.id); toast('Cleared bought items'); };

  const Row = ({ g }) => html`
    <li class=${`grocery ${g.done ? 'done' : ''}`}>
      <button class="check" onClick=${() => toggle(g)} aria-pressed=${String(!!g.done)}
              aria-label=${g.done ? `Put ${g.name} back on the list` : `Mark ${g.name} bought`}>
        ${g.done && html`<${Icon} name="check" size=${18} />`}
      </button>
      <span class="g-name">${g.name}${g.qty && html`<span class="g-qty">×${g.qty}</span>`}</span>
      <${Chip} m=${memberById(members, g.done ? g.doneBy : g.addedBy)} small />
      <button class="icon-btn subtle" onClick=${() => remove(g)} aria-label=${`Delete ${g.name}`}><${Icon} name="trash" size=${18} /></button>
    </li>`;

  return html`
    <h1 class="page-title">Groceries</h1>
    <form class="adder" onSubmit=${add}>
      <input value=${text} onInput=${(e) => setText(e.target.value)} placeholder="Add items, e.g. 2 milk, eggs"
             aria-label="Add grocery items" enterkeyhint="done" autocomplete="off" />
      <button class="btn primary" aria-label="Add to list"><${Icon} name="plus" /></button>
    </form>
    ${open.length === 0 ? html`<p class="empty">The list is empty. Add what the house needs and everyone sees it straight away.</p>` : html`
      <ul class="glist">${open.map((g) => html`<${Row} key=${g.id} g=${g} />`)}</ul>`}
    ${done.length > 0 && html`
      <div class="block-head"><h2>Bought</h2><button class="link" onClick=${clearBought}>Clear bought</button></div>
      <ul class="glist">${done.map((g) => html`<${Row} key=${g.id} g=${g} />`)}</ul>`}
    <p class="hint">The circle on each row shows who added it, or who bought it.</p>`;
}
