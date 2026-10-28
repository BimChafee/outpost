import { html, useMemo, useState, Icon, Chip, Sheet, Sign, nameOf, shortDate, today, toast } from '../ui.js';
import { balances, settleUp, billShares, billTotal, fmt, toCents } from '../money.js';
import { HousePlate } from './house.js';

export function Ledger({ st, hid, me, members, ledger, go, openCamera, household }) {
  const ids = members.map((m) => m.id);
  const bal = useMemo(() => balances(ledger, ids), [ledger, members]);
  const transfers = settleUp(bal).sort((a, b) => (b.from === me) - (a.from === me) || (b.to === me) - (a.to === me));
  const rows = [...ledger].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  const [paying, setPaying] = useState(null);
  const maxAbs = Math.max(1, ...Object.values(bal).map(Math.abs));
  const bills = rows.filter((e) => e.kind === 'bill');

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
    <div class="page-head"><h1 class="page-title">Bills</h1>
      <p class="page-sub">${bills.length ? `${bills.length} bill${bills.length === 1 ? '' : 's'}, ${fmt(grand)} in total` : 'Nothing logged yet'}</p></div>

    <${HousePlate} household=${household} compact />

    <div class="actions">
      <button class="btn primary" onClick=${() => openCamera()}><${Icon} name="camera" /> Scan a receipt</button>
      <a class="btn" href="#bill/new"><${Icon} name="plus" /> Add a bill</a>
    </div>

    <section class="block" aria-labelledby="settle-h">
      <h2 id="settle-h" class="block-title">Settle up</h2>
      ${transfers.length === 0 ? html`
        <div class="sign-row calm"><${Sign} kind="safe" /><div><b>Everyone's square</b><span>No one owes anyone right now.</span></div></div>` : html`
        <ul class="signs">
          ${transfers.map((t) => html`<li class="sign-row settle">
            <${Sign} kind=${t.from === me ? 'owe' : t.to === me ? 'safe' : 'mandatory'} glyph=${t.from === me || t.to === me ? undefined : 'share'} />
            <div><b>${t.from === me ? html`You pay ${nameOf(members, t.to, me)}` : t.to === me ? html`${nameOf(members, t.from, me)} pays you` : html`${nameOf(members, t.from, me)} pays ${nameOf(members, t.to, me)}`}</b>
              <span class="money big">${fmt(t.amount)}</span></div>
            <button class="btn small" onClick=${() => setPaying(t)}>Mark paid</button>
          </li>`)}
        </ul>
        <p class="hint">This is the fewest e-Transfers that clears every balance. Mark one paid after the money is sent.</p>`}
    </section>

    <section class="block" aria-labelledby="bal-h">
      <h2 id="bal-h" class="block-title">Balances</h2>
      <ul class="balances">
        ${members.map((m) => {
          const v = bal[m.id] || 0;
          return html`<li>
            <span class="bal-name"><${Chip} m=${m} small />${m.id === me ? 'You' : m.name}</span>
            <span class="bal-track" aria-hidden="true">
              <span class=${`bal-bar ${v < 0 ? 'neg' : 'pos'}`} style=${{ width: `${(Math.abs(v) / maxAbs) * 50}%` }}></span>
            </span>
            <span class=${`bal-amt ${v < 0 ? 'neg' : v > 0 ? 'pos' : ''}`}>
              <span class="money">${v === 0 ? 'Square' : fmt(Math.abs(v))}</span>
              ${v !== 0 && html`<small>${v > 0 ? 'is owed' : 'owes'}</small>`}
            </span>
          </li>`;
        })}
      </ul>
    </section>

    <section class="block" aria-labelledby="sheet-h">
      <div class="block-head"><h2 id="sheet-h" class="block-title">Every bill</h2><span class="hint">Tap a bill to edit it</span></div>
      ${rows.length === 0 ? html`<div class="empty"><p><b>No bills yet.</b></p><p>Scan a grocery receipt, or add rent, hydro and internet as bills split by shares.</p></div>` : html`
        <div class="sheet-scroll" tabindex="0" aria-label="Every bill and each person's share. Scrolls sideways.">
          <table class="sheet-table">
            <thead><tr>
              <th scope="col" class="sticky">Bill</th>
              <th scope="col" class="num">Total</th>
              ${members.map((m) => html`<th scope="col" class="num person"><${Chip} m=${m} small /><span>${m.id === me ? 'You' : m.name}</span></th>`)}
            </tr></thead>
            <tbody>
              ${cells.map(({ e, shares, total }) => e.kind === 'payment' ? html`
                <tr class="pay-row">
                  <th scope="row" class="sticky"><span class="t-title">${nameOf(members, e.from, me)} paid ${nameOf(members, e.to, me).toLowerCase() === 'you' ? 'you' : nameOf(members, e.to, me)}</span>
                    <span class="t-meta">${shortDate(e.date)} <button class="link danger-link" onClick=${() => confirm('Delete this payment?') && st.remove(hid, 'ledger', e.id)}>Delete</button></span></th>
                  <td class="num">${fmt(total)}</td>
                  ${members.map((m) => html`<td class="num">${m.id === e.from ? html`<span class="pos">+${fmt(total)}</span>` : m.id === e.to ? html`<span class="neg">−${fmt(total)}</span>` : ''}</td>`)}
                </tr>` : html`
                <tr class="bill-row" onClick=${() => go('bill/' + e.id)}>
                  <th scope="row" class="sticky"><a href=${'#bill/' + e.id} class="t-title">${e.title || 'Untitled bill'}</a>
                    <span class="t-meta">${shortDate(e.date)}, paid by ${nameOf(members, e.paidBy, me).toLowerCase() === 'you' ? 'you' : nameOf(members, e.paidBy, me)}</span></th>
                  <td class="num strong">${fmt(total)}</td>
                  ${members.map((m) => html`<td class=${`num ${m.id === e.paidBy ? 'payer' : ''}`}>${shares[m.id] ? fmt(shares[m.id]) : html`<span class="nil">–</span>`}</td>`)}
                </tr>`)}
            </tbody>
            <tfoot><tr>
              <th scope="row" class="sticky">Each person's share</th><td class="num">${fmt(grand)}</td>
              ${members.map((m) => html`<td class="num">${fmt(colTotals[m.id])}</td>`)}
            </tr></tfoot>
          </table>
        </div>
        <p class="hint">Highlighted cells are the person who paid that bill.</p>`}
    </section>

    ${paying && html`<${PaymentSheet} t=${paying} members=${members} me=${me}
      onClose=${() => setPaying(null)}
      onSave=${async (p) => { await st.add(hid, 'ledger', { kind: 'payment', ...p }); setPaying(null); toast('Payment recorded'); }} />`}`;
}

function PaymentSheet({ t, members, me, onClose, onSave }) {
  const [amount, setAmount] = useState((t.amount / 100).toFixed(2));
  const [date, setDate] = useState(today());
  return html`<${Sheet} title="Record a payment" onClose=${onClose}
    actions=${html`<button class="btn" onClick=${onClose}>Cancel</button>
      <button class="btn primary" onClick=${() => onSave({ from: t.from, to: t.to, amount: Number(amount), date })}>Record payment</button>`}>
    <p class="lede"><b>${nameOf(members, t.from, me)}</b> sent <b>${nameOf(members, t.to, me).toLowerCase() === 'you' ? 'you' : nameOf(members, t.to, me)}</b> money by e-Transfer or cash.</p>
    <label class="field"><span>Amount</span><input class="money-input" type="number" inputmode="decimal" step="0.01" min="0" value=${amount} onInput=${(e) => setAmount(e.target.value)} /></label>
    <label class="field"><span>Date</span><input type="date" value=${date} onInput=${(e) => setDate(e.target.value)} /></label>
  <//>`;
}
