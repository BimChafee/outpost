// Shared UI: Preact + htm (no build step), icons, safety signs, curbside carts, sheets, toasts, member chips.
export {
  html, render, useState, useEffect, useMemo, useRef, useCallback,
} from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import { html, useEffect, useState } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';

// ---------- icons (24px stroke) ----------
const P = {
  home: 'M3.5 11L12 4l8.5 7M6 9.5V20h4.5v-5.5h3V20H18V9.5',
  cart: 'M3 4h2.2l2.3 10.5h10.8L20.5 7H6.3M9 20.2a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4zm8.5 0a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4z',
  ledger: 'M6 3h12v18l-2.4-1.6L13.2 21 12 20l-1.2 1-2.4-1.6L6 21zM9 8h6M9 11.5h6M9 15h3.5',
  wrench: 'M14.7 6.3a4 4 0 00-5.4 5.2L3.5 17.3V20.5h3.2l5.8-5.8a4 4 0 005.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-2.2-1.3L14.4 3h-4l-.4 2.5a7.6 7.6 0 00-2.2 1.2l-2.4-.9-2 3.4 2 1.6a7.4 7.4 0 000 2.6l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 002.2 1.3l.4 2.4h4l.4-2.5a7.6 7.6 0 002.2-1.2l2.4.9 2-3.4-2-1.6c.1-.4.1-.8.1-1.3z',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  camera: 'M3.5 8h3.3l1.9-2.8h6.6L17.2 8h3.3v11.5h-17zM12 17a3.8 3.8 0 100-7.6 3.8 3.8 0 000 7.6z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  back: 'M15 5l-7 7 7 7',
  bell: 'M6 16v-5a6 6 0 0112 0v5l2 2H4zM10 20.5a2 2 0 004 0',
  share: 'M12 15V3.5M8 7.5l4-4 4 4M5 12v8h14v-8',
  bolt: 'M13 3L5 13.5h6L10 21l8-10.5h-6z',
  image: 'M4 5h16v14H4zM4 15.5l4.5-4.5 4 4 2.5-2.5 5 5M15.5 9.5a1 1 0 100-2 1 1 0 000 2z',
  scan: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 9h8M8 12h8M8 15h5',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11',
  edit: 'M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16zM13.5 6.5l4 4',
  checks: 'M2.5 12.5l4 4L15 8M10.5 15.5l1 1L21 7.5',
  dots: 'M4.6 12a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0M10.6 12a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0M16.6 12a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0',
  grip: 'M7.8 6a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0M13.8 6a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0M7.8 12a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0M13.8 12a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0M7.8 18a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0M13.8 18a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0',
  search: 'M10.5 17a6.5 6.5 0 100-13 6.5 6.5 0 000 13zM15.5 15.5L20 20',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  repeat: 'M17 2.5l3 3-3 3M4 11.5V10a4.5 4.5 0 014.5-4.5H20M7 21.5l-3-3 3-3M20 12.5V14a4.5 4.5 0 01-4.5 4.5H4',
};
export const Icon = ({ name, size = 22, label }) => html`
  <svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
       aria-hidden=${label ? undefined : 'true'} role=${label ? 'img' : undefined} aria-label=${label}>
    <path d=${P[name]} />
  </svg>`;

// ---------- safety signs (ISO 7010 vocabulary) ----------
// mandatory = blue circle (you need to do this), warning = yellow triangle (coming up / overdue),
// safe = green square (all good), owe = red circle (money you owe).
const GLYPH = {
  mandatory: 'M12 7v6M12 16.5v.5',
  owe: 'M12 6.5v11M15 9a2.6 2.3 0 00-3-1.6c-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.3 2.3-3 2.3a3.2 2.6 0 01-3.2-1.8',
  warning: 'M12 10v4M12 16.8v.2',
  safe: 'M8 12.3l2.7 2.7L16 9.6',
};
export function Sign({ kind = 'mandatory', size = 34, glyph }) {
  const shape = kind === 'warning'
    ? html`<path d="M12 2.6L22.4 20.6H1.6z" class="sign-shape" stroke-linejoin="round" />`
    : kind === 'safe'
      ? html`<rect x="2" y="2" width="20" height="20" rx="2.5" class="sign-shape" />`
      : html`<circle cx="12" cy="12" r="10.5" class="sign-shape" />`;
  return html`<svg class=${`sign sign-${kind}`} width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true">
    ${shape}
    <path d=${glyph ? P[glyph] : GLYPH[kind]} class="sign-glyph" transform=${glyph ? 'translate(5.4 5.6) scale(.55)' : (kind === 'warning' ? 'translate(0 1.2)' : undefined)}
          fill="none" stroke-width=${glyph ? 3.2 : 2.4} stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;
}

// ---------- curbside carts ----------
export function Cart({ stream, size = 56 }) {
  if (stream === 'yardwaste') {
    return html`<svg class="cart cart-bag" width=${size * 0.82} height=${size} viewBox="0 0 40 50" aria-hidden="true">
      <path d="M6 10h28l2 38H4z" fill="var(--bin-yard)" />
      <path d="M6 10l3-6h22l3 6" fill="none" stroke="var(--bin-yard-dark)" stroke-width="2" stroke-linejoin="round" />
      <path d="M10 18c4 2 6 6 4 12M26 16c-3 4-2 9 2 13M18 24c2 3 2 7 0 10" fill="none" stroke="var(--bin-yard-dark)" stroke-width="1.6" stroke-linecap="round" opacity=".7" />
    </svg>`;
  }
  const body = `var(--bin-${stream})`;
  return html`<svg class=${`cart cart-${stream}`} width=${size * 0.78} height=${size} viewBox="0 0 39 50" aria-hidden="true">
    <path d="M4 9.5h31l-3 34.5H7z" fill=${body} />
    <path d="M2.5 6.2h34a1.2 1.2 0 011.2 1.2v2.8H1.3V7.4a1.2 1.2 0 011.2-1.2z" fill=${body} class="cart-lid" />
    <path d="M28 6.2V3.2a1.4 1.4 0 011.4-1.4h5.2" fill="none" stroke=${body} stroke-width="2.2" stroke-linecap="round" class="cart-handle" />
    <path d="M10 15h19M10.6 21h17.8" stroke="rgba(255,255,255,.22)" stroke-width="1.6" stroke-linecap="round" />
    ${stream === 'recycling' && html`<path d="M15.5 33.5l2.4-4 2.4 4M23.5 31l-1.2 4.4h-4.6M15.2 35.4l-1.1-4.2" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />`}
    ${stream === 'organics' && html`<path d="M19.5 37c-4-2-5-6-3-10 4 0 6 3 6 7M19.5 37c1-3 3-5 6-6" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="1.5" stroke-linecap="round" />`}
    <circle cx="9.5" cy="45.5" r="3.6" class="cart-wheel" />
    <circle cx="29.5" cy="45.5" r="3.6" class="cart-wheel" />
  </svg>`;
}

// ---------- members ----------
export const MEMBER_COLORS = ['#1F4FA3', '#B8561D', '#1E7A4C', '#7A3E9D', '#A0782B', '#2F7D8F', '#A6475F', '#5D6B2F'];
export const memberById = (members, id) => members.find((m) => m.id === id);
export const nameOf = (members, id, me) =>
  id === me ? 'You' : memberById(members, id)?.name || 'Someone';
export const Chip = ({ m, small, on, onClick, label }) => html`
  <button type="button" class=${`chip ${small ? 'chip-sm' : ''} ${on === false ? 'chip-off' : ''} ${on ? 'chip-on' : ''}`}
          style=${{ '--c': m?.color || '#777' }} onClick=${onClick} disabled=${!onClick}
          aria-pressed=${on === undefined ? undefined : String(!!on)} aria-label=${small ? (label || m?.name) : undefined}>
    <span class="chip-dot" aria-hidden=${small ? 'true' : undefined}>${(m?.name || '?')[0].toUpperCase()}</span>${small ? '' : html`<span class="chip-name">${m?.name || '?'}</span>`}
  </button>`;

// ---------- sheet (modal bottom sheet) ----------
export function Sheet({ title, onClose, children, actions }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  return html`
    <div class="sheet-backdrop" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label=${title}>
        <div class="sheet-grip" aria-hidden="true"></div>
        <div class="sheet-head">
          <h2>${title}</h2>
          <button class="icon-btn" onClick=${onClose} aria-label="Close"><${Icon} name="x" /></button>
        </div>
        <div class="sheet-body">${children}</div>
        ${actions && html`<div class="sheet-actions">${actions}</div>`}
      </div>
    </div>`;
}

// ---------- toast ----------
let pushToast = () => {};
export const toast = (msg, action) => pushToast(msg, action);
export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    pushToast = (msg, action) => {
      const id = Math.random();
      setItems((xs) => [...xs, { id, msg, action }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), action ? 5000 : 3200);
    };
  }, []);
  return html`<div class="toasts" role="status" aria-live="polite">
    ${items.map((t) => html`<div class="toast" key=${t.id}><span>${t.msg}</span>
      ${t.action && html`<button onClick=${() => { t.action.run(); setItems((xs) => xs.filter((x) => x.id !== t.id)); }}>${t.action.label}</button>`}</div>`)}
  </div>`;
}

// ---------- dates ----------
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const shortDate = (s) => {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const sameYear = y === new Date().getFullYear();
  return dt.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
};
