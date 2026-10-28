import { html, useState, Chip, MEMBER_COLORS, today } from '../ui.js';
import { newId, randomCode } from '../store.js';

export function Setup({ st, onDone, onReset, pickMemberFor, missing }) {
  const linkCode = new URLSearchParams(location.search).get('join') || '';
  const [mode, setMode] = useState(linkCode ? 'join' : 'start');
  const [names, setNames] = useState(['', '', '']);
  const [mine, setMine] = useState(0);
  const [code, setCode] = useState(linkCode);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (pickMemberFor) {
    return html`<div class="setup">
      <${Mark} />
      <h1>Which roommate are you?</h1>
      <p class="lede">This phone will add things in your name.</p>
      <div class="chip-row big">
        ${(pickMemberFor.members || []).map((m) => html`<${Chip} m=${m} onClick=${() => onDone(pickMemberFor.id, m.id)} />`)}
      </div>
      <button class="link" onClick=${onReset}>Use a different household</button>
    </div>`;
  }

  if (missing) {
    return html`<div class="setup">
      <${Mark} />
      <h1>That household is gone</h1>
      <p class="lede">The saved household code doesn't match anything. Start a new one or join with a fresh code.</p>
      <button class="btn primary" onClick=${onReset}>Start over</button>
    </div>`;
  }

  const create = async (e) => {
    e.preventDefault();
    const clean = names.map((n) => n.trim()).filter(Boolean);
    if (!clean.length) return setErr('Add at least one roommate.');
    setBusy(true); setErr('');
    try {
      const members = clean.map((name, i) => ({ id: newId(), name, color: MEMBER_COLORS[i % MEMBER_COLORS.length] }));
      const hid = randomCode();
      await st.createHousehold(hid, { name: 'Temporary Mining Outpost', members, address: self.OUTPOST_CONFIG.address });
      await st.add(hid, 'upkeep', { name: 'Furnace air filter', intervalDays: 90, lastDone: today(), notes: 'Check the size printed on the old filter before buying.' });
      const idx = Math.min(mine, members.length - 1);
      onDone(hid, members[idx].id);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };

  const join = async (e) => {
    e.preventDefault();
    const c = code.trim().toLowerCase();
    if (!c) return setErr('Enter the household code.');
    setBusy(true); setErr('');
    try {
      if (!(await st.exists(c))) throw new Error('No household with that code. Check it with your roommate.');
      history.replaceState(null, '', location.pathname + location.hash);
      onDone(c, null);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };

  return html`<div class="setup">
    <${Mark} />
    <h1>Temporary Mining Outpost</h1>
    <p class="lede">Groceries, bills and house upkeep for the people at ${self.OUTPOST_CONFIG.address}.</p>

    <div class="seg" role="tablist">
      <button role="tab" aria-selected=${mode === 'start'} class=${mode === 'start' ? 'on' : ''} onClick=${() => { setMode('start'); setErr(''); }}>Start a household</button>
      <button role="tab" aria-selected=${mode === 'join'} class=${mode === 'join' ? 'on' : ''} onClick=${() => { setMode('join'); setErr(''); }}>Join roommates</button>
    </div>

    ${mode === 'start' ? html`
      <form onSubmit=${create} class="stack">
        <fieldset class="stack">
          <legend>Who lives here? Tap the circle next to your own name.</legend>
          ${names.map((n, i) => html`
            <div class="name-row">
              <button type="button" class=${`radio ${mine === i ? 'on' : ''}`} aria-label=${`That's me (row ${i + 1})`}
                      aria-pressed=${String(mine === i)} onClick=${() => setMine(i)}
                      style=${{ '--c': MEMBER_COLORS[i % MEMBER_COLORS.length] }}></button>
              <input value=${n} placeholder=${i === 0 ? 'Your name' : 'Roommate'} aria-label=${`Roommate ${i + 1} name`}
                     onInput=${(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))} />
            </div>`)}
          <button type="button" class="link" onClick=${() => setNames([...names, ''])}>Add another roommate</button>
        </fieldset>
        ${err && html`<p class="error">${err}</p>`}
        <button class="btn primary" disabled=${busy}>${busy ? 'Setting up…' : 'Start household'}</button>
        ${st.mode === 'local' && html`<p class="hint">Firebase isn't set up yet, so this household lives on this phone only. Add Firebase to config.js to share it (see README).</p>`}
      </form>` : html`
      <form onSubmit=${join} class="stack">
        ${st.mode === 'local' ? html`<p class="hint">Joining needs the shared version. Add your Firebase config to config.js first (see README).</p>` : html`
          <label class="field"><span>Household code</span>
            <input value=${code} onInput=${(e) => setCode(e.target.value)} autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="10 letters and numbers" />
          </label>
          ${err && html`<p class="error">${err}</p>`}
          <button class="btn primary" disabled=${busy}>${busy ? 'Checking…' : 'Join household'}</button>
          <p class="hint">Ask a roommate for the code or invite link. It's under Settings in their app.</p>`}
      </form>`}
  </div>`;
}

const Mark = () => html`<svg class="setup-mark" viewBox="0 0 32 32" aria-hidden="true"><use href="#mark" /></svg>`;
