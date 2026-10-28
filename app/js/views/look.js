// Settings > Look: pick a theme for this phone.
import { html, useState, Icon } from '../ui.js';
import { SKINS, MODES, getLook, setLook } from '../theme.js';

export function LookSettings() {
  const [look, setLookState] = useState(getLook);
  const pick = (p) => setLookState(setLook(p));
  const skin = SKINS.find((s) => s.id === look.skin) || SKINS[0];
  return html`<section class="block" aria-labelledby="look-h">
    <h2 id="look-h">Look</h2>
    <div class="skins" role="radiogroup" aria-label="Theme">
      ${SKINS.map((s) => html`<button role="radio" aria-checked=${String(look.skin === s.id)} class=${`skin-card skin-${s.id} ${look.skin === s.id ? 'on' : ''}`} onClick=${() => pick({ skin: s.id })}>
        <span class="skin-preview" aria-hidden="true">
          <span class="sp-bar"></span>
          <span class="sp-title">${s.id === 'cyber' ? 'OUTPOST_' : 'Outpost'}</span>
          <span class="sp-row"><i></i><i></i></span>
          <span class="sp-btn"></span>
          <span class="sp-swatches">${s.swatch.map((c) => html`<i style=${{ background: c }}></i>`)}</span>
        </span>
        <span class="skin-text"><b>${s.name}</b><small>${s.blurb}</small></span>
        ${look.skin === s.id && html`<span class="skin-check"><${Icon} name="check" size=${16} /></span>`}
      </button>`)}
    </div>
    ${skin.modes ? html`<fieldset><legend>Brightness</legend>
      <div class="seg seg3" role="radiogroup" aria-label="Brightness">
        ${MODES.map(([k, l]) => html`<button role="radio" aria-checked=${String(look.mode === k)} class=${look.mode === k ? 'on' : ''} onClick=${() => pick({ mode: k })}><b>${l}</b></button>`)}
      </div></fieldset>` : html`<p class="hint">${skin.name} is dark only.</p>`}
    <p class="hint">Themes are per phone, so everyone can pick their own.</p>
  </section>`;
}
