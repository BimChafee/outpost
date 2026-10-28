// Shared UI bits: Preact + htm (no build step), icons, sheets, toasts, member chips.
export {
  html, render, useState, useEffect, useMemo, useRef, useCallback,
} from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import { html, useEffect, useState } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';

// ---------- icons (24px stroke) ----------
const P = {
  home: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  cart: 'M3 4h2l2.4 11h11.2L21 7H6.2M9 20a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z',
  ledger: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6M9 16h3',
  wrench: 'M14.7 6.3a4 4 0 00-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 005.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-2.2-1.3L14.4 3h-4l-.4 2.5a7.6 7.6 0 00-2.2 1.2l-2.4-.9-2 3.4 2 1.6a7.4 7.4 0 000 2.6l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 002.2 1.3l.4 2.4h4l.4-2.5a7.6 7.6 0 002.2-1.2l2.4.9 2-3.4-2-1.6c.1-.4.1-.8.1-1.3z',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  back: 'M15 5l-7 7 7 7',
  bell: 'M6 16V11a6 6 0 0112 0v5l2 2H4zM10 20a2 2 0 004 0',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  swap: 'M7 7h13l-4-4M17 17H4l4 4',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6',
};
export const Icon = ({ name, size = 22, label }) => html`
  <svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
       aria-hidden=${label ? undefined : 'true'} role=${label ? 'img' : undefined} aria-label=${label}>
    <path d=${P[name]} />
  </svg>`;

// ---------- members ----------
export const MEMBER_COLORS = ['#2F6B62', '#B4532A', '#5B5FA8', '#A0782B', '#7A4E86', '#3F7DA6', '#6E7A2F', '#A6475F'];
export const memberById = (members, id) => members.find((m) => m.id === id);
export const nameOf = (members, id, me) =>
  id === me ? 'You' : memberById(members, id)?.name || 'Someone';
export const Chip = ({ m, small, on, onClick }) => html`
  <button type="button" class=${`chip ${small ? 'chip-sm' : ''} ${on === false ? 'chip-off' : ''}`}
          style=${{ '--c': m?.color || '#777' }} onClick=${onClick} disabled=${!onClick}
          aria-pressed=${on === undefined ? undefined : String(!!on)}>
    <span class="chip-dot">${(m?.name || '?')[0].toUpperCase()}</span>${small ? '' : html`<span>${m?.name || '?'}</span>`}
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
export const toast = (msg) => pushToast(msg);
export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    pushToast = (msg) => {
      const id = Math.random();
      setItems((xs) => [...xs, { id, msg }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3200);
    };
  }, []);
  return html`<div class="toasts" role="status" aria-live="polite">
    ${items.map((t) => html`<div class="toast" key=${t.id}>${t.msg}</div>`)}
  </div>`;
}

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
export const ago = (ts) => {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};
