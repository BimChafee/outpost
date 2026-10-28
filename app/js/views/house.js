// The house plate: address, postal code and rent, always on Home and Bills.
// Rent and postal code live on the household doc so anyone can update them in Settings;
// config.js holds the starting values.
import { html, useState, toast } from '../ui.js';
import { dayKey, daysBetween } from '../schedule.js';
import { fmt } from '../money.js';

export function rentInfo(household, now = new Date()) {
  const cfg = self.OUTPOST_CONFIG || {};
  const amount = Number(household?.rent?.amount ?? cfg.rent?.amount ?? 0);
  const dueDay = Math.min(28, Math.max(1, Number(household?.rent?.dueDay ?? cfg.rent?.dueDay ?? 1)));
  const y = now.getFullYear(), m = now.getMonth();
  const thisMonth = new Date(y, m, dueDay, 12);
  const next = now.getDate() <= dueDay ? thisMonth : new Date(y, m + 1, dueDay, 12);
  const days = daysBetween(now, next);
  const label = days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`;
  return {
    amount, dueDay, next: dayKey(next), daysLeft: days, label,
    amountText: fmt(Math.round(amount * 100)).replace(/\.00$/, ''),
    nextText: next.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }),
  };
}

export const postalOf = (household) => household?.postalCode || self.OUTPOST_CONFIG?.postalCode || '';

const ordinal = (n) => `${n}${[, 'st', 'nd', 'rd'][(n % 100 >> 3 ^ 1) && n % 10] || 'th'}`;

/** A civic address sign with the rent countdown beside it. */
export function HousePlate({ household, compact }) {
  const r = rentInfo(household);
  const address = household?.address || self.OUTPOST_CONFIG?.address || '';
  const [num, ...street] = address.split(',')[0].split(' ');
  const city = address.split(',').slice(1).join(',').trim();
  const soon = r.daysLeft <= 3;
  return html`<section class=${`plate ${compact ? 'compact' : ''}`} aria-label="House details">
    <div class="plate-sign">
      <b class="plate-num">${num}</b>
      <span class="plate-street">${street.join(' ')}</span>
      <span class="plate-city">${city}${city ? ' ' : ''}<span class="plate-postal">${postalOf(household)}</span></span>
    </div>
    <a class=${`plate-rent ${soon ? 'soon' : ''}`} href="#ledger" aria-label=${`Rent ${r.amountText}, ${r.label.toLowerCase()}, on ${r.nextText}`}>
      <span class="plate-rent-label">Rent</span>
      <b class="money">${r.amountText}</b>
      <span class="plate-rent-due">${r.label}</span>
      <small>${r.nextText}</small>
    </a>
  </section>`;
}

/** Settings section to change rent and postal code. */
export function HouseDetails({ st, hid, household }) {
  const r = rentInfo(household);
  const [amount, setAmount] = useState(String(r.amount));
  const [dueDay, setDueDay] = useState(String(r.dueDay));
  const [postal, setPostal] = useState(postalOf(household));
  const save = async () => {
    const a = Number(amount), d = Number(dueDay);
    if (!(a >= 0)) return toast('Enter the rent as a number');
    if (!(d >= 1 && d <= 28)) return toast('Pick a due day from 1 to 28');
    try {
      await st.updateHousehold(hid, { rent: { amount: a, dueDay: d }, postalCode: postal.trim().toUpperCase() });
      toast('House details saved');
    } catch (e) { toast(`Couldn't save: ${e.message}`); }
  };
  return html`<section class="block">
    <h2>Rent and address</h2>
    <div class="three">
      <label class="field"><span>Monthly rent</span><input class="money-input" type="number" inputmode="decimal" min="0" step="0.01" value=${amount} onInput=${(e) => setAmount(e.target.value)} /></label>
      <label class="field"><span>Due on day</span><input type="number" inputmode="numeric" min="1" max="28" value=${dueDay} onInput=${(e) => setDueDay(e.target.value)} /></label>
      <label class="field"><span>Postal code</span><input value=${postal} onInput=${(e) => setPostal(e.target.value)} autocapitalize="characters" /></label>
    </div>
    <p class="hint">Rent shows on Home and Bills and in the calendar on the ${ordinal(Number(dueDay) || 1)} of each month.</p>
    <button class="btn" onClick=${save}>Save house details</button>
  </section>`;
}
