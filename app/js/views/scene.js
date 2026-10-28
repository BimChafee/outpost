// The outpost, drawn from what the house has bought. Colours come from the active skin's tokens
// (see .scene in styles.css), so it reads right in every theme. `fresh` marks the item just bought,
// which builds itself in once.
import { html } from '../ui.js';

const g = (id, fresh, children) => html`<g class=${`sc-${id} ${fresh === id ? 'sc-fresh' : ''}`}>${children}</g>`;

function Walls({ t }) {
  // Front wall in two runs with a gate gap in the middle.
  const runs = [[8, 146], [214, 352]];
  if (t === 1) {
    return runs.map(([a, b]) => html`<path class="sc-line sc-wood" d=${Array.from({ length: Math.floor((b - a) / 7) }, (_, i) => `M${a + i * 7 + 1} 176V160l2.5-4 2.5 4V176z`).join('')} />`);
  }
  if (t === 2) {
    return runs.map(([a, b]) => html`${[0, 1, 2].map((row) => Array.from({ length: Math.floor((b - a) / 12) }, (_, i) => html`
      <rect class="sc-sand" x=${a + i * 12 + (row % 2) * 6} y=${170 - row * 6} width="11" height="6" rx="3" />`))}`);
  }
  return runs.map(([a, b]) => html`
    <rect class=${t === 4 ? 'sc-steel' : 'sc-concrete'} x=${a} y="154" width=${b - a} height="22" />
    ${Array.from({ length: Math.floor((b - a) / 23) }, (_, i) => html`<path class="sc-seam" d=${`M${a + 23 * (i + 1)} 154v22`} />`)}
    ${t === 4 && Array.from({ length: Math.floor((b - a) / 23) + 1 }, (_, i) => html`<circle class="sc-rivet" cx=${a + 4 + 23 * i} cy="158" r="1" /><circle class="sc-rivet" cx=${a + 4 + 23 * i} cy="172" r="1" />`)}
    <path class="sc-line" d=${`M${a} 154h${b - a}`} />`);
}

function Tower({ t }) {
  return html`
    ${t >= 2 && html`<path class="sc-beam" d="M38 92L-20 30L10 18z" />`}
    <path class="sc-line sc-struct" d="M26 176L32 96h16l6 80z" />
    <path class="sc-line" d="M29 150h22M30 126h20M31 110h18M28 176L50 126M52 176L30 126" />
    <rect class="sc-line sc-struct" x="24" y="86" width="32" height="12" />
    <path class="sc-line sc-roof" d="M22 86L40 72L58 86z" />
    ${t >= 2 && html`<circle class="sc-lamp" cx="40" cy="92" r="3" />`}
    ${t >= 3 && html`<rect class="sc-line sc-accentfill" x="46" y="88" width="9" height="6" /><path class="sc-line" d="M55 91h12" />`}`;
}

function Rooms({ t }) {
  const mods = [
    { x: 104, y: 132, w: 36, h: 44 },   // bunkroom, left
    { x: 220, y: 128, w: 40, h: 48 },   // mess hall, right
    { x: 112, y: 106, w: 28, h: 26 },   // workshop, stacked left
    { x: 260, y: 140, w: 26, h: 36 },   // rec room, far right
  ].slice(0, t);
  return mods.map((m, i) => html`<g class=${`sc-room sc-room-${i}`}>
    <rect class="sc-line sc-struct" x=${m.x} y=${m.y} width=${m.w} height=${m.h} />
    <rect class="sc-window" x=${m.x + m.w / 2 - 5} y=${m.y + 8} width="10" height="7" />
    <path class="sc-line" d=${`M${m.x} ${m.y + 3}h${m.w}`} />
  </g>`);
}

function Guards({ t }) {
  const xs = [70, 112, 246, 296].slice(0, t);
  return xs.map((x, i) => html`<g class="sc-guard" style=${{ '--d': `${i * 0.9}s` }}>
    <circle class="sc-line sc-accentfill" cx=${x} cy="144" r="3" />
    <path class="sc-line" d=${`M${x} 147v8M${x - 4} 151h8M${x} 155l-3 5M${x} 155l3 5M${x + 4} 149v-9`} />
  </g>`);
}

export function OutpostScene({ own, fresh, level }) {
  return html`<svg class=${`scene lvl-${Math.min(level, 10)}`} viewBox="0 0 360 210" role="img"
      aria-label=${describe(own)} preserveAspectRatio="xMidYMax meet">
    <rect class="sc-sky" x="0" y="0" width="360" height="210" />
    ${[[22, 20], [70, 38], [128, 14], [190, 30], [236, 12], [300, 26], [338, 48], [160, 52], [96, 64]].map(([x, y], i) => html`<circle class="sc-star" cx=${x} cy=${y} r=${i % 3 ? 0.8 : 1.3} />`)}
    <path class="sc-moon" d="M318 22a12 12 0 1 0 10 18a9 9 0 1 1 -10 -18z" />
    <path class="sc-hill" d="M0 150q60-30 120-8t120-10t120 6V210H0z" />
    <rect class="sc-ground" x="0" y="176" width="360" height="34" />

    ${own.pad > 0 && g('pad', fresh, html`<ellipse class="sc-line sc-struct" cx="326" cy="182" rx="28" ry="5" /><path class="sc-line sc-accent" d="M320 180v4M332 180v4M320 182h12" /><circle class="sc-blink" cx="350" cy="179" r="1.6" />`)}
    ${own.drill > 0 && g('drill', fresh, html`
      <path class="sc-line" d=${own.drill >= 2 ? 'M302 176L316 84L330 176M306 150h20M309 124h14M312 104h8M304 176L326 124M328 176L306 124' : 'M308 176l8-40l8 40M310 160h12'} />
      ${own.drill >= 3 && html`<path class="sc-line" d="M316 84v-18" /><circle class="sc-blink" cx="316" cy="64" r="2" />`}
      <rect class="sc-line sc-struct" x="296" y="168" width="40" height="8" />
      <path class="sc-drillbit" d="M316 176v10" />`)}
    ${own.tower > 0 && g('tower', fresh, html`<${Tower} t=${own.tower} />`)}
    ${own.greenhouse > 0 && g('greenhouse', fresh, html`
      <path class="sc-line sc-glass" d=${own.greenhouse >= 2 ? 'M62 176V150a18 18 0 0 1 36 0v26z' : 'M66 176v-14h26v14z'} />
      ${own.greenhouse >= 2 ? html`<path class="sc-line" d="M80 132v44M62 160h36M70 136v40M90 136v40" />` : html`<path class="sc-line" d="M66 162l26 0M79 162v14" />`}
      <path class="sc-leaf" d="M70 176q2-8 6-9M86 176q-1-7 4-10" />`)}

    <g class="sc-cabin">
      <rect class="sc-line sc-struct" x="140" y="118" width="80" height="58" />
      <path class="sc-line sc-roof" d="M134 120L180 90L226 120z" />
      <rect class="sc-window" x="150" y="132" width="14" height="10" />
      <rect class="sc-window" x="196" y="132" width="14" height="10" />
      <rect class="sc-line sc-door" x="172" y="148" width="16" height="28" />
      <path class="sc-line" d="M204 100v-8h6v12" />
    </g>
    ${own.rooms > 0 && g('rooms', fresh, html`<${Rooms} t=${own.rooms} />`)}
    ${own.radar > 0 && g('radar', fresh, html`<g class="sc-radar"><path class="sc-line sc-struct" d="M150 100a12 7 30 0 1 18 12z" /><path class="sc-line" d="M158 106l-4-6M160 112v-6" /></g>`)}
    ${own.flag > 0 && g('flag', fresh, html`<path class="sc-line" d="M180 90V62" /><path class="sc-flag" d="M180 62l18 5l-18 5z" />`)}
    ${own.lights > 0 && g('lights', fresh, html`
      ${[58, 302].map((x) => html`
        ${own.lights >= 2 && html`<path class="sc-cone" d=${`M${x} 128L${x - 26} 176H${x + 26}z`} />`}
        <path class="sc-line" d=${`M${x} 176V${own.lights >= 2 ? 124 : 140}`} />
        <circle class="sc-lamp" cx=${x} cy=${own.lights >= 2 ? 124 : 140} r=${own.lights >= 2 ? 4 : 2.6} />`)}`)}
    ${own.walls > 0 && g('walls', fresh, html`<${Walls} t=${own.walls} />`)}
    ${own.guards > 0 && g('guards', fresh, html`<${Guards} t=${own.guards} />`)}
    ${own.moat > 0 && g('moat', fresh, html`<path class=${own.moat >= 2 ? 'sc-water' : 'sc-trench'} d="M0 186q90 -4 180 0t180 0v8q-90 4 -180 0t-180 0z" />`)}
  </svg>`;
}

function describe(own) {
  const bits = [];
  if (own.walls) bits.push('walls');
  if (own.tower) bits.push('a watchtower');
  if (own.guards) bits.push(`${own.guards} guard${own.guards === 1 ? '' : 's'}`);
  if (own.rooms) bits.push(`${own.rooms} extra room${own.rooms === 1 ? '' : 's'}`);
  if (own.drill) bits.push('a drill rig');
  return `The outpost at night: a cabin${bits.length ? ' with ' + bits.join(', ') : ''}.`;
}
