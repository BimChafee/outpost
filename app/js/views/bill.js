import { html, useEffect, useMemo, useState, Icon, Chip, memberById, toast, today } from '../ui.js';
import { billShares, billTotal, itemsSubtotal, fmt, toCents } from '../money.js';
import { scanReceipt } from '../receipt.js';
import { newId } from '../store.js';

// A receipt photo picked on the Bills tab waits here until the editor opens.
let pendingFile = null;
export const queueScan = (f) => { pendingFile = f; };
export const CLAUDE_KEY = 'tmo.claudeKey';

const blank = (me, members) => ({
  kind: 'bill', title: '', date: today(), paidBy: me, participants: members.map((m) => m.id),
  splitMode: 'even', shares: {}, items: [], total: '', tax: '', tip: '', notes: '',
});

export function BillEditor({ st, hid, me, members, ledger, billId, go }) {
  const existing = billId !== 'new' && ledger.find((e) => e.id === billId);
  const [bill, setBill] = useState(() => (existing ? structuredClone(existing) : blank(me, members)));
  const [scan, setScan] = useState(null); // { progress, error }
  const [saving, setSaving] = useState(false);
  const set = (patch) => setBill((b) => ({ ...b, ...patch }));

  useEffect(() => { if (pendingFile) { const f = pendingFile; pendingFile = null; runScan(f); } }, []);

  async function runScan(file) {
    setScan({ progress: 0 });
    try {
      const apiKey = localStorage.getItem(CLAUDE_KEY) || '';
      const r = await scanReceipt(file, { apiKey, onProgress: (p) => setScan({ progress: p }) });
      setBill((b) => ({
        ...b,
        title: r.merchant || b.title,
        date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : b.date,
        items: (r.items || []).map((it) => ({ id: newId(), name: it.name, price: Number(it.price).toFixed(2), assigned: [] })),
        tax: r.tax ? Number(r.tax).toFixed(2) : '',
        tip: r.tip ? Number(r.tip).toFixed(2) : '',
        total: r.total ? Number(r.total).toFixed(2) : '',
        splitMode: r.items?.length ? 'items' : b.splitMode,
        photo: r.photo,
      }));
      setScan(null);
      toast(`Read ${r.items?.length || 0} items with ${r.reader}. Check them against the receipt.`);
    } catch (e) {
      console.error(e);
      setScan({ error: e.message || String(e) });
    }
  }

  if (billId !== 'new' && !existing) {
    return html`<p class="empty">This bill was deleted. <a href="#ledger">Back to bills</a></p>`;
  }

  const people = members.filter((m) => bill.participants.includes(m.id));
  const shares = billShares(bill);
  const total = billTotal(bill);
  const sub = itemsSubtotal(bill);
  const extra = total - sub;

  const toggleParticipant = (id) => set({
    participants: bill.participants.includes(id) ? bill.participants.filter((p) => p !== id) : [...bill.participants, id],
  });
  const setItem = (id, patch) => set({ items: bill.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  const toggleCell = (it, pid) => {
    const a = it.assigned || [];
    setItem(it.id, { assigned: a.includes(pid) ? a.filter((x) => x !== pid) : [...a, pid] });
  };
  const assignColumn = (pid) => set({ items: bill.items.map((it) => (it.assigned?.length ? it : { ...it, assigned: [pid] })) });

  const save = async () => {
    if (!bill.title.trim()) return toast('Give the bill a name');
    if (!total) return toast('Enter a total or some items');
    if (!bill.participants.length) return toast('Pick who shares this bill');
    setSaving(true);
    const { id, ...data } = bill;
    try {
      if (existing) await st.set(hid, 'ledger', existing.id, data);
      else await st.add(hid, 'ledger', data);
      toast(existing ? 'Bill updated' : 'Bill saved');
      go('ledger');
    } catch (e) { toast(e.message); setSaving(false); }
  };
  const del = async () => {
    if (!confirm('Delete this bill? Balances will be recalculated.')) return;
    await st.remove(hid, 'ledger', existing.id);
    toast('Bill deleted');
    go('ledger');
  };

  return html`
    <div class="page-head">
      <a class="icon-btn" href="#ledger" aria-label="Back to bills"><${Icon} name="back" /></a>
      <h1 class="page-title">${existing ? 'Edit bill' : 'New bill'}</h1>
    </div>

    ${scan && html`<div class=${`scan ${scan.error ? 'scan-err' : ''}`} role="status">
      ${scan.error ? html`<p>Couldn't read the receipt: ${scan.error}</p><p>Enter the items by hand, or try a sharper, flatter photo.</p>`
        : html`<p>Reading the receipt…</p><progress max="1" value=${scan.progress || undefined}></progress>`}
    </div>`}

    <div class="stack">
      <div class="two">
        <label class="field"><span>What was it?</span>
          <input value=${bill.title} onInput=${(e) => set({ title: e.target.value })} placeholder="No Frills, Hydro, Internet" />
        </label>
        <label class="field narrow"><span>Date</span>
          <input type="date" value=${bill.date} onInput=${(e) => set({ date: e.target.value })} />
        </label>
      </div>

      <fieldset><legend>Paid by</legend>
        <div class="chip-row">${members.map((m) => html`<${Chip} m=${m} on=${bill.paidBy === m.id} onClick=${() => set({ paidBy: m.id })} />`)}</div>
      </fieldset>

      <fieldset><legend>Shared by</legend>
        <div class="chip-row">${members.map((m) => html`<${Chip} m=${m} on=${bill.participants.includes(m.id)} onClick=${() => toggleParticipant(m.id)} />`)}</div>
      </fieldset>

      <div class="seg" role="tablist" aria-label="How to split">
        ${[['even', 'Evenly'], ['shares', 'By shares'], ['items', 'By item']].map(([k, l]) => html`
          <button role="tab" aria-selected=${bill.splitMode === k} class=${bill.splitMode === k ? 'on' : ''} onClick=${() => set({ splitMode: k })}>${l}</button>`)}
      </div>

      ${bill.splitMode !== 'items' && html`
        <label class="field"><span>Total</span>
          <input type="number" inputmode="decimal" step="0.01" value=${bill.total} onInput=${(e) => set({ total: e.target.value })} placeholder="0.00" />
        </label>`}

      ${bill.splitMode === 'shares' && html`
        <div class="shares-grid">
          ${people.map((m) => html`<label class="field"><span>${m.name}'s shares</span>
            <input type="number" inputmode="decimal" min="0" step="0.5" value=${bill.shares?.[m.id] ?? 1}
                   onInput=${(e) => set({ shares: { ...bill.shares, [m.id]: Number(e.target.value) } })} /></label>`)}
        </div>
        <p class="hint">Use shares for uneven splits, e.g. a bigger room pays 1.5 shares of rent.</p>`}

      ${bill.splitMode === 'items' && html`
        <div class="sheet-scroll" tabindex="0" aria-label="Items and who they belong to">
          <table class="sheet-table items-table">
            <thead><tr>
              <th scope="col" class="sticky">Item</th>
              <th scope="col" class="num">Price</th>
              ${people.map((m) => html`<th scope="col" class="cell-col">
                <button class="col-btn" onClick=${() => assignColumn(m.id)} title=${`Give all unassigned items to ${m.name}`}>
                  <${Chip} m=${m} small /><span class="sr">${m.name}</span></button></th>`)}
              <th scope="col"><span class="sr">Remove</span></th>
            </tr></thead>
            <tbody>
              ${bill.items.map((it) => {
                const shared = !(it.assigned?.length);
                return html`<tr key=${it.id}>
                  <th scope="row" class="sticky"><input class="cell-input" value=${it.name} aria-label="Item name" onInput=${(e) => setItem(it.id, { name: e.target.value })} /></th>
                  <td class="num"><input class="cell-input num" type="number" inputmode="decimal" step="0.01" value=${it.price} aria-label=${`${it.name} price`} onInput=${(e) => setItem(it.id, { price: e.target.value })} /></td>
                  ${people.map((m) => {
                    const on = it.assigned?.includes(m.id);
                    return html`<td class="cell-col"><button class=${`cell ${on ? 'on' : shared ? 'shared' : ''}`} style=${{ '--c': m.color }}
                      aria-pressed=${String(!!on)} aria-label=${`${it.name} for ${m.name}`} onClick=${() => toggleCell(it, m.id)}>
                      ${on ? html`<${Icon} name="check" size=${16} />` : ''}</button></td>`;
                  })}
                  <td><button class="icon-btn subtle" aria-label=${`Remove ${it.name}`} onClick=${() => set({ items: bill.items.filter((x) => x.id !== it.id) })}><${Icon} name="x" size=${16} /></button></td>
                </tr>`;
              })}
            </tbody>
          </table>
        </div>
        <button class="link" onClick=${() => set({ items: [...bill.items, { id: newId(), name: '', price: '', assigned: [] }] })}>Add an item</button>
        <p class="hint">Tap a square to put an item on someone. Faded rows are shared by everyone. Tap a person's circle to give them every unassigned item.</p>
        <div class="three">
          <label class="field"><span>Tax</span><input type="number" inputmode="decimal" step="0.01" value=${bill.tax} onInput=${(e) => set({ tax: e.target.value })} placeholder="0.00" /></label>
          <label class="field"><span>Tip</span><input type="number" inputmode="decimal" step="0.01" value=${bill.tip} onInput=${(e) => set({ tip: e.target.value })} placeholder="0.00" /></label>
          <label class="field"><span>Receipt total</span><input type="number" inputmode="decimal" step="0.01" value=${bill.total} onInput=${(e) => set({ total: e.target.value })} placeholder=${((sub + toCents(bill.tax) + toCents(bill.tip)) / 100).toFixed(2)} /></label>
        </div>
        <p class="hint">Items come to ${fmt(sub)}. ${extra !== 0 ? `The other ${fmt(extra)} (tax, tip, fees, discounts) is split in proportion to what each person bought.` : ''}</p>`}

      <section class="result" aria-label="Each person's share">
        <div class="result-head"><span>Total</span><b>${fmt(total)}</b></div>
        <ul>
          ${people.map((m) => html`<li><${Chip} m=${m} />
            <span class="amt">${fmt(shares[m.id] || 0)}</span>
            <span class="result-note">${m.id === bill.paidBy ? 'paid' : `owes ${memberById(members, bill.paidBy)?.name || ''}`}</span></li>`)}
        </ul>
      </section>

      <label class="field"><span>Notes</span><textarea rows="2" value=${bill.notes} onInput=${(e) => set({ notes: e.target.value })}></textarea></label>

      ${bill.photo && html`<figure class="receipt-photo"><img src=${bill.photo} alt="Receipt photo" /><figcaption><button class="link" onClick=${() => set({ photo: null })}>Remove photo</button></figcaption></figure>`}

      <label class="btn">
        <${Icon} name="camera" /> ${bill.photo ? 'Rescan receipt' : 'Fill from a receipt photo'}
        <input type="file" accept="image/*" capture="environment" hidden onChange=${(e) => { const f = e.target.files?.[0]; e.target.value = ''; f && runScan(f); }} />
      </label>

      <div class="actions sticky-actions">
        ${existing && html`<button class="btn danger" onClick=${del}><${Icon} name="trash" /> Delete</button>`}
        <button class="btn primary grow" disabled=${saving || !!(scan && !scan.error)} onClick=${save}>${existing ? 'Save changes' : 'Save bill'}</button>
      </div>
    </div>`;
}
