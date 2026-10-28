import { html, useEffect, useState, Icon, Chip, Sign, Sheet, memberById, toast, today } from '../ui.js';
import { billShares, billTotal, itemsSubtotal, fmt, toCents } from '../money.js';
import { scanReceipt, reconcile } from '../receipt.js';
import { newId } from '../store.js';

// Receipt photos taken from the Scan button wait here until the editor opens.
let pending = null;
export const queueScan = (photos) => { pending = photos; };
export const CLAUDE_KEY = 'tmo.claudeKey';

const blank = (me, members) => ({
  kind: 'bill', title: '', date: today(), paidBy: me, participants: members.map((m) => m.id),
  splitMode: 'even', shares: {}, items: [], total: '', tax: '', tip: '', notes: '',
});

const STAGES = {
  preparing: 'Getting the photo ready',
  loading: 'Loading the receipt reader. The first scan on a phone can take 20 seconds.',
  reading: 'Reading the receipt',
};

export function BillEditor({ st, hid, me, members, ledger, billId, go, openCamera }) {
  const existing = billId !== 'new' && ledger.find((e) => e.id === billId);
  const [bill, setBill] = useState(() => (existing ? structuredClone(existing) : blank(me, members)));
  const [scan, setScan] = useState(null); // { stage, progress } | { error } | { result }
  const [saving, setSaving] = useState(false);
  const [viewPhoto, setViewPhoto] = useState(false);
  const set = (patch) => setBill((b) => ({ ...b, ...patch }));

  useEffect(() => { if (pending) { const p = pending; pending = null; runScan(p); } }, []);

  async function runScan(photos) {
    setScan({ stage: 'preparing', progress: null });
    try {
      const apiKey = localStorage.getItem(CLAUDE_KEY) || '';
      const r = await scanReceipt(photos, { apiKey, onStage: (stage, progress) => setScan({ stage, progress }) });
      setBill((b) => ({
        ...b,
        title: b.title || r.merchant || '',
        date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : b.date,
        items: (r.items || []).map((it) => ({ id: newId(), name: it.name, price: Number(it.price).toFixed(2), assigned: [] })),
        tax: r.tax ? Number(r.tax).toFixed(2) : '',
        tip: r.tip ? Number(r.tip).toFixed(2) : '',
        total: r.total ? Number(r.total).toFixed(2) : '',
        splitMode: r.items?.length ? 'items' : b.splitMode,
        photo: r.photo,
      }));
      setScan({ result: r });
    } catch (e) {
      console.error(e);
      setScan({ error: e.message || String(e) });
    }
  }
  const rescan = () => openCamera((photos) => runScan(photos));

  if (billId !== 'new' && !existing) {
    return html`<div class="empty"><p><b>This bill was deleted.</b></p><p><a href="#ledger">Back to bills</a></p></div>`;
  }

  const people = members.filter((m) => bill.participants.includes(m.id));
  const shares = billShares(bill);
  const total = billTotal(bill);
  const sub = itemsSubtotal(bill);
  const extra = total - sub;
  const busy = scan && scan.stage;
  const check = bill.splitMode === 'items' && bill.items.length ? reconcile({
    items: bill.items, subtotal: 0, total: Number(bill.total) || 0, tax: Number(bill.tax) || 0, tip: Number(bill.tip) || 0,
  }) : null;

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
    if (!bill.title.trim()) return toast('Give the bill a name in step 2');
    if (!total) return toast('Enter a total, or add items');
    if (!bill.participants.length) return toast('Pick who shares this bill');
    setSaving(true);
    const { id, ...data } = bill;
    try {
      if (existing) await st.set(hid, 'ledger', existing.id, data);
      else await st.add(hid, 'ledger', data);
      toast(existing ? 'Bill saved' : 'Bill added');
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
    <div class="page-head with-back">
      <a class="icon-btn" href="#ledger" aria-label="Back to bills"><${Icon} name="back" /></a>
      <h1 class="page-title">${existing ? bill.title || 'Edit bill' : 'New bill'}</h1>
    </div>

    <ol class="steps">
      <li class="step">
        <h2 class="step-title">Receipt</h2>
        ${busy ? html`<div class="scan" role="status">
            <div class="scan-anim" aria-hidden="true"><span></span></div>
            <p><b>${STAGES[scan.stage]}</b></p>
            ${scan.stage === 'reading' && scan.progress != null ? html`<progress max="1" value=${scan.progress}></progress>` : html`<progress></progress>`}
          </div>`
          : scan?.error ? html`<div class="sign-row alert"><${Sign} kind="warning" /><div><b>The receipt couldn't be read</b><span>${scan.error}</span></div></div>
            <button class="btn" onClick=${rescan}><${Icon} name="camera" /> Try another photo</button>`
          : html`
            ${scan?.result && html`<${ScanSummary} r=${scan.result} count=${bill.items.length} />`}
            <div class="receipt-row">
              ${bill.photo ? html`<button class="receipt-thumb" onClick=${() => setViewPhoto(true)} aria-label="View receipt photo"><img src=${bill.photo} alt="" /></button>` : ''}
              <div class="receipt-actions">
                <button class=${`btn ${bill.photo ? '' : 'primary'}`} onClick=${rescan}><${Icon} name="camera" /> ${bill.photo ? 'Scan again' : 'Scan a receipt'}</button>
                ${bill.photo ? html`<button class="link danger-link" onClick=${() => set({ photo: null })}>Remove photo</button>`
                  : html`<p class="hint">Or skip this for rent, hydro and other bills without a receipt.</p>`}
              </div>
            </div>`}
      </li>

      <li class="step">
        <h2 class="step-title">Details</h2>
        <div class="two">
          <label class="field"><span>What was it?</span>
            <input value=${bill.title} onInput=${(e) => set({ title: e.target.value })} placeholder="No Frills, hydro, internet" />
          </label>
          <label class="field narrow"><span>Date</span>
            <input type="date" value=${bill.date} onInput=${(e) => set({ date: e.target.value })} />
          </label>
        </div>
        <fieldset><legend>Who paid?</legend>
          <div class="chip-row">${members.map((m) => html`<${Chip} m=${m} on=${bill.paidBy === m.id} onClick=${() => set({ paidBy: m.id })} />`)}</div>
        </fieldset>
      </li>

      <li class="step">
        <h2 class="step-title">Split</h2>
        <fieldset><legend>Who shares it?</legend>
          <div class="chip-row">${members.map((m) => html`<${Chip} m=${m} on=${bill.participants.includes(m.id)} onClick=${() => toggleParticipant(m.id)} />`)}</div>
        </fieldset>

        <div class="seg" role="radiogroup" aria-label="How to split">
          ${[['even', 'Evenly', 'Same amount each'], ['shares', 'By shares', 'e.g. 1.5 for the big room'], ['items', 'By item', 'Pick who had what']].map(([k, l, d]) => html`
            <button role="radio" aria-checked=${String(bill.splitMode === k)} class=${bill.splitMode === k ? 'on' : ''} onClick=${() => set({ splitMode: k })}>
              <b>${l}</b><small>${d}</small></button>`)}
        </div>

        ${bill.splitMode !== 'items' && html`
          <label class="field"><span>Total</span>
            <input class="money-input" type="number" inputmode="decimal" step="0.01" value=${bill.total} onInput=${(e) => set({ total: e.target.value })} placeholder="0.00" />
          </label>`}

        ${bill.splitMode === 'shares' && html`
          <div class="shares-grid">
            ${people.map((m) => html`<label class="field"><span><${Chip} m=${m} small /> ${m.name}</span>
              <input type="number" inputmode="decimal" min="0" step="0.5" value=${bill.shares?.[m.id] ?? 1}
                     onInput=${(e) => set({ shares: { ...bill.shares, [m.id]: Number(e.target.value) } })} /></label>`)}
          </div>`}

        ${bill.splitMode === 'items' && html`
          ${people.length > 0 && html`<p class="hint">Tap the squares to say who had each item. An item with no one ticked is shared by everyone. Tap a name to give them every item no one has claimed.</p>`}
          <div class="sheet-scroll" tabindex="0" aria-label="Items and who had them">
            <table class="sheet-table items-table">
              <thead><tr>
                <th scope="col" class="sticky">Item</th>
                <th scope="col" class="num">Price</th>
                ${people.map((m) => html`<th scope="col" class="cell-col">
                  <button class="col-btn" onClick=${() => assignColumn(m.id)} aria-label=${`Give ${m.name} every unclaimed item`}>
                    <${Chip} m=${m} small /><span>${m.name}</span></button></th>`)}
                <th scope="col"><span class="sr">Remove</span></th>
              </tr></thead>
              <tbody>
                ${bill.items.map((it) => {
                  const shared = !(it.assigned?.length);
                  return html`<tr key=${it.id} class=${shared ? 'shared-row' : ''}>
                    <th scope="row" class="sticky"><input class="cell-input" value=${it.name} aria-label="Item name" placeholder="Item" onInput=${(e) => setItem(it.id, { name: e.target.value })} /></th>
                    <td class="num"><input class="cell-input num" type="number" inputmode="decimal" step="0.01" value=${it.price} placeholder="0.00" aria-label=${`${it.name} price`} onInput=${(e) => setItem(it.id, { price: e.target.value })} /></td>
                    ${people.map((m) => {
                      const on = it.assigned?.includes(m.id);
                      return html`<td class="cell-col"><button class=${`cell ${on ? 'on' : shared ? 'shared' : ''}`} style=${{ '--c': m.color }}
                        aria-pressed=${String(!!on)} aria-label=${`${it.name || 'Item'} for ${m.name}`} onClick=${() => toggleCell(it, m.id)}>
                        ${on ? html`<${Icon} name="check" size=${18} />` : ''}</button></td>`;
                    })}
                    <td><button class="icon-btn subtle" aria-label=${`Remove ${it.name}`} onClick=${() => set({ items: bill.items.filter((x) => x.id !== it.id) })}><${Icon} name="x" size=${16} /></button></td>
                  </tr>`;
                })}
              </tbody>
            </table>
            <button class="add-row" onClick=${() => set({ items: [...bill.items, { id: newId(), name: '', price: '', assigned: [] }] })}><${Icon} name="plus" size=${18} /> Add an item</button>
          </div>
          <div class="three">
            <label class="field"><span>Tax</span><input class="money-input" type="number" inputmode="decimal" step="0.01" value=${bill.tax} onInput=${(e) => set({ tax: e.target.value })} placeholder="0.00" /></label>
            <label class="field"><span>Tip</span><input class="money-input" type="number" inputmode="decimal" step="0.01" value=${bill.tip} onInput=${(e) => set({ tip: e.target.value })} placeholder="0.00" /></label>
            <label class="field"><span>Receipt total</span><input class="money-input" type="number" inputmode="decimal" step="0.01" value=${bill.total} onInput=${(e) => set({ total: e.target.value })} placeholder=${((sub + toCents(bill.tax) + toCents(bill.tip)) / 100).toFixed(2)} /></label>
          </div>
          ${check && check.ok === false && html`<div class="sign-row alert"><${Sign} kind="warning" size=${28} /><div><b>Items + tax come to ${fmt(sub + toCents(bill.tax) + toCents(bill.tip))}, but the total is ${fmt(total)}</b><span>The difference is shared in proportion to what each person had. If an item is missing or misread, fix it above.</span></div></div>`}
          ${extra !== 0 && check?.ok !== false && html`<p class="hint">Tax, tip and fees (${fmt(extra)}) are shared in proportion to what each person had.</p>`}`}
      </li>

      <li class="step">
        <h2 class="step-title">Shares</h2>
        <div class="result">
          <div class="result-head"><span>Total</span><span class="money big">${fmt(total)}</span></div>
          <ul>
            ${people.map((m) => html`<li>
              <span class="bal-name"><${Chip} m=${m} small />${m.id === me ? 'You' : m.name}</span>
              <span class="result-note">${m.id === bill.paidBy ? 'paid the bill' : `owes ${bill.paidBy === me ? 'you' : memberById(members, bill.paidBy)?.name || ''}`}</span>
              <span class="money">${fmt(shares[m.id] || 0)}</span>
            </li>`)}
          </ul>
        </div>
        <label class="field"><span>Notes</span><textarea rows="2" value=${bill.notes} onInput=${(e) => set({ notes: e.target.value })} placeholder="Optional"></textarea></label>
      </li>
    </ol>

    <div class="save-bar">
      ${existing && html`<button class="btn danger" onClick=${del} aria-label="Delete bill"><${Icon} name="trash" /></button>`}
      <button class="btn primary grow" disabled=${saving || !!busy} onClick=${save}>${existing ? 'Save bill' : 'Add bill'}</button>
    </div>

    ${viewPhoto && bill.photo && html`<${Sheet} title="Receipt photo" onClose=${() => setViewPhoto(false)}>
      <img class="receipt-full" src=${bill.photo} alt="Receipt photo" />
    <//>`}`;
}

function ScanSummary({ r, count }) {
  const c = r.check || {};
  if (!r.items?.length) {
    return html`<div class="sign-row alert"><${Sign} kind="warning" /><div>
      <b>No prices found on this photo</b>
      <span>Retake it flat, in good light, with the whole receipt in the frame. Or type the items in below.</span>
      ${r.rawText && html`<details class="raw"><summary>What the reader saw</summary><pre>${r.rawText}</pre></details>`}
    </div></div>`;
  }
  const where = r.merchant ? ` from ${r.merchant}` : '';
  if (c.ok === true) {
    return html`<div class="sign-row calm"><${Sign} kind="safe" /><div><b>Found ${count} items${where}</b><span>They add up to the receipt's ${fmt(c.target)}. Now pick who had what in step 3.</span></div></div>`;
  }
  if (c.ok === false) {
    return html`<div class="sign-row alert"><${Sign} kind="warning" /><div><b>Found ${count} items${where}, but they're off by ${fmt(Math.abs(c.diff))}</b><span>They add up to ${fmt(c.itemsSum)} and the receipt says ${fmt(c.target)}. Compare the list with the photo: a line may be missing or misread.</span></div></div>`;
  }
  return html`<div class="sign-row"><${Sign} kind="mandatory" /><div><b>Found ${count} items${where}</b><span>No subtotal was found to check them against. Compare the list with the photo before saving.</span></div></div>`;
}
