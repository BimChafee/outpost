import { html, useMemo, useState, Icon, Chip, Sheet, memberById, nameOf, shortDate, today, toast } from '../ui.js';
import { balances, settleUp, billShares, billTotal, fmt, toCents } from '../money.js';
import { queueScan } from './bill.js';

export function Ledger({ st, hid, me, members, ledger, go }) {
  const ids = members.map((m) => m.id);
  const bal = useMemo(() => balances(ledger, ids), [ledger, members]);
  const transfers = settleUp(bal);
  const rows = [...ledger].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  const [paying, setPaying] = useState(null);
  const maxAbs = Math.max(1, ...Object.values(bal).map(Math.abs));

  const onPhoto = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) { queueScan(f); go('bill/new'); }
  };

  // Column totals for the sheet: what each person's share of all bills came to.
  const colTotals = Object.fromEntries(ids.map((id) => [id, 0]));
  let grand = 0;
  const cells = rows.map((e) => {
    if (e.kind === 'payment') return { e, shares: null, total: toCents(e.amount) };
    const shares = billShares(e);
    for (const p in shares) if (p in colTotals) colTotals[p] += shares[p];
    const total = billTotal(e);
    grand += total;
    return { e, shares, total };
  });

  return html`
    <h1 class="page-title">Bills</h1>
    <div class="actions">
      <label class="btn primary">
        <${Icon} name="camera" /> Scan a receipt
        <input type="file" accept="image/*" capture="environment" onChange=${onPhoto} hidden />
      </label>
      <a class="btn" href="#bill/new"><${Icon} name="plus" /> Add a bill</a>
    </div>

    <section class="block" aria-labelledby="bal-h">
      <h2 id="bal-h">Balances</h2>
      <ul class="balances">
        ${members.map((m) => {
          const v = bal[m.id] || 0;
          return html`<li>
            <span class="bal-name"><${Chip} m=${m} small />${m.name}</span>
            <span class="bal-track" aria-hidden="true">
              <span class=${`bal-bar ${v < 0 ? 'neg' : 'pos'}`} style=${{ width: `${(Math.abs(v) / maxAbs) * 50}%` }}></span>
            </span>
            <span class=${`amt ${v < 0 ? 'neg' : v > 0 ? 'pos' : ''}`}>${v === 0 ? 'Square' : v > 0 ? `Owed ${fmt(v)}` : `Owes ${fmt(-v)}`}</span>
          </li>`;
        })}
      </ul>
      ${transfers.length > 0 && html`
        <h3>To settle up</h3>
        <ul class="rows">
          ${transfers.map((t) => html`<li class="row">
            <span><b>${nameOf(members, t.from, me)}</b> pay${t.from === me ? '' : 's'} <b>${nameOf(members, t.to, me)}</b> ${fmt(t.amount)}</span>
            <button class="btn small" onClick=${() => setPaying(t)}>Record payment</button>
          </li>`)}
        </ul>`}
    </section>

    <section class="block" aria-labelledby="sheet-h">
      <h2 id="sheet-h">Spreadsheet</h2>
      ${rows.length === 0 ? html`<p class="empty">No bills yet. Scan a receipt or add a bill like rent, hydro or internet.</p>` : html`
        <div class="sheet-scroll" tabindex="0" aria-label="Bills by person, scrolls sideways">
          <table class="sheet-table">
            <thead><tr>
              <th scope="col" class="sticky">Bill</th>
              <th scope="col">Paid by</th>
              <th scope="col" class="num">Total</th>
              ${members.map((m) => html`<th scope="col" class="num"><${Chip} m=${m} small /> <span class="sr">${m.name}</span></th>`)}
            </tr></thead>
            <tbody>
              ${cells.map(({ e, shares, total }) => e.kind === 'payment' ? html`
                <tr class="pay-row">
                  <th scope="row" class="sticky"><span class="t-title">Payment</span><span class="t-date">${shortDate(e.date)}</span></th>
                  <td colspan="2">${nameOf(members, e.from, me)} → ${nameOf(members, e.to, me)}
                    <button class="icon-btn subtle" aria-label="Delete payment" onClick=${() => confirm('Delete this payment?') && st.remove(hid, 'ledger', e.id)}><${Icon} name="trash" size=${16} /></button></td>
                  ${members.map((m) => html`<td class="num">${m.id === e.from ? `+${fmt(total)}` : m.id === e.to ? `−${fmt(total)}` : ''}</td>`)}
                </tr>` : html`
                <tr class="bill-row" onClick=${() => go('bill/' + e.id)}>
                  <th scope="row" class="sticky"><a href=${'#bill/' + e.id} class="t-title">${e.title || 'Untitled bill'}</a><span class="t-date">${shortDate(e.date)}${e.items?.length ? ` · ${e.items.length} items` : ''}</span></th>
                  <td>${nameOf(members, e.paidBy, me)}</td>
                  <td class="num">${fmt(total)}</td>
                  ${members.map((m) => html`<td class=${`num ${m.id === e.paidBy ? 'payer' : ''}`}>${shares[m.id] ? fmt(shares[m.id]) : '–'}</td>`)}
                </tr>`)}
            </tbody>
            <tfoot><tr>
              <th scope="row" class="sticky">Shares</th><td></td><td class="num">${fmt(grand)}</td>
              ${members.map((m) => html`<td class="num">${fmt(colTotals[m.id])}</td>`)}
            </tr></tfoot>
          </table>
        </div>`}
    </section>

    ${paying && html`<${PaymentSheet} t=${paying} members=${members} me=${me}
      onClose=${() => setPaying(null)}
      onSave=${async (p) => { await st.add(hid, 'ledger', { kind: 'payment', ...p }); setPaying(null); toast('Payment recorded'); }} />`}`;
}

function PaymentSheet({ t, members, me, onClose, onSave }) {
  const [amount, setAmount] = useState((t.amount / 100).toFixed(2));
  const [date, setDate] = useState(today());
  return html`<${Sheet} title="Record payment" onClose=${onClose}
    actions=${html`<button class="btn" onClick=${onClose}>Cancel</button>
      <button class="btn primary" onClick=${() => onSave({ from: t.from, to: t.to, amount: Number(amount), date })}>Record payment</button>`}>
    <p class="lede">${nameOf(members, t.from, me)} paid ${nameOf(members, t.to, me)}, by e-Transfer or cash.</p>
    <label class="field"><span>Amount</span><input type="number" inputmode="decimal" step="0.01" min="0" value=${amount} onInput=${(e) => setAmount(e.target.value)} /></label>
    <label class="field"><span>Date</span><input type="date" value=${date} onInput=${(e) => setDate(e.target.value)} /></label>
  <//>`;
}
