// Bill splitting math. All arithmetic is in integer cents.
//
// Ledger entry shapes (collection "ledger"):
//   bill:    { kind:'bill', title, date, paidBy, participants:[memberId], splitMode:'even'|'shares'|'items',
//              shares:{memberId:weight}, items:[{id,name,price,assigned:[memberId]}], total, tax, tip, notes, photo }
//   payment: { kind:'payment', from, to, amount, date, note }

export const toCents = (v) => Math.round((Number(v) || 0) * 100);
export const fmt = (cents, { sign = false } = {}) => {
  const s = (Math.abs(cents) / 100).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });
  if (!sign) return cents < 0 ? `-${s}` : s;
  return cents > 0 ? `+${s}` : cents < 0 ? `-${s}` : s;
};

/** Split `cents` by weights using largest remainder, so the parts always add up exactly. */
export function splitCents(cents, weights) {
  const ids = Object.keys(weights).filter((k) => weights[k] > 0);
  const out = Object.fromEntries(Object.keys(weights).map((k) => [k, 0]));
  if (!ids.length || !cents) return out;
  const W = ids.reduce((s, k) => s + weights[k], 0);
  const sign = cents < 0 ? -1 : 1;
  const abs = Math.abs(cents);
  let used = 0;
  const rems = ids.map((k) => {
    const exact = (abs * weights[k]) / W;
    const base = Math.floor(exact);
    out[k] = base; used += base;
    return [k, exact - base];
  });
  rems.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  for (let i = 0; i < abs - used; i++) out[rems[i % rems.length][0]] += 1;
  for (const k of ids) out[k] *= sign;
  return out;
}

export const itemsSubtotal = (bill) => (bill.items || []).reduce((s, it) => s + toCents(it.price), 0);

/** Total of a bill in cents. Falls back to items + tax + tip when no total was entered. */
export function billTotal(bill) {
  if (bill.total !== undefined && bill.total !== null && bill.total !== '') return toCents(bill.total);
  return itemsSubtotal(bill) + toCents(bill.tax) + toCents(bill.tip);
}

/** What each person's share of a bill is, in cents. Sums exactly to billTotal(bill). */
export function billShares(bill) {
  const people = bill.participants?.length ? bill.participants : [];
  const total = billTotal(bill);
  const zero = Object.fromEntries(people.map((p) => [p, 0]));
  if (!people.length) return zero;

  if (bill.splitMode === 'shares') {
    const w = Object.fromEntries(people.map((p) => [p, Number(bill.shares?.[p] ?? 1)]));
    return splitCents(total, w);
  }
  if (bill.splitMode === 'items' && bill.items?.length) {
    const sub = { ...zero };
    for (const it of bill.items) {
      const who = (it.assigned || []).filter((p) => people.includes(p));
      const part = splitCents(toCents(it.price), Object.fromEntries((who.length ? who : people).map((p) => [p, 1])));
      for (const p in part) sub[p] += part[p];
    }
    // Tax, tip, fees and discounts: whatever separates the item subtotal from the total, prorated.
    const extra = total - itemsSubtotal(bill);
    const prorate = Object.values(sub).some((v) => v > 0)
      ? splitCents(extra, sub)
      : splitCents(extra, Object.fromEntries(people.map((p) => [p, 1])));
    for (const p of people) sub[p] += prorate[p] || 0;
    return sub;
  }
  return splitCents(total, Object.fromEntries(people.map((p) => [p, 1])));
}

/** Net position per member: positive = others owe them, negative = they owe. */
export function balances(entries, memberIds) {
  const bal = Object.fromEntries(memberIds.map((m) => [m, 0]));
  const add = (m, v) => { if (m in bal) bal[m] += v; else bal[m] = v; };
  for (const e of entries) {
    if (e.kind === 'payment') {
      const a = toCents(e.amount);
      add(e.from, a); add(e.to, -a);
    } else if (e.kind === 'bill') {
      const shares = billShares(e);
      const total = Object.values(shares).reduce((s, v) => s + v, 0);
      add(e.paidBy, total);
      for (const p in shares) add(p, -shares[p]);
    }
  }
  return bal;
}

/** Fewest-ish transfers to settle everyone up (greedy largest debtor -> largest creditor). */
export function settleUp(bal) {
  const cred = Object.entries(bal).filter(([, v]) => v > 0).map(([k, v]) => [k, v]);
  const debt = Object.entries(bal).filter(([, v]) => v < 0).map(([k, v]) => [k, -v]);
  const out = [];
  cred.sort((a, b) => b[1] - a[1]); debt.sort((a, b) => b[1] - a[1]);
  let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const amt = Math.min(debt[i][1], cred[j][1]);
    if (amt > 0) out.push({ from: debt[i][0], to: cred[j][0], amount: amt });
    debt[i][1] -= amt; cred[j][1] -= amt;
    if (debt[i][1] === 0) i++;
    if (cred[j][1] === 0) j++;
  }
  return out;
}
