// Themes: a "skin" restyles the whole app (tokens + component treatments in styles.css / theme-*.css),
// and "brightness" picks light/dark for skins that have both. Both are per phone.
// index.html runs applyTheme() inline before first paint, so there's no flash of the wrong theme.

export const SKINS = [
  {
    id: 'outpost', name: 'Outpost', blurb: 'Site-safety signs on shale grey. Light or dark.',
    modes: true, swatch: ['#DCE2DF', '#1C2528', '#1F4FA3', '#F4B400', '#1E7A4C'],
  },
  {
    id: 'cyber', name: 'Cyberpunk', blurb: 'Neon on a night skyline. Glitches included.',
    modes: false, swatch: ['#0A0614', '#FCEE09', '#00F0FF', '#FD3649', '#FF2BD6'],
    fonts: 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap',
    themeColor: '#0A0614',
  },
  {
    id: 'osrs', name: 'Old School', blurb: 'Stone panels, parchment and yellow text. Buying gf.',
    modes: false, swatch: ['#3E3529', '#5D5141', '#FFFF00', '#FF981F', '#D8CCB4'],
    fonts: 'https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600&display=swap',
    themeColor: '#2B241C',
  },
  {
    id: 'wotlk', name: 'Lich King', blurb: 'Frost-lit Northrend nights, gold runes, epic loot colours.',
    modes: false, swatch: ['#070D18', '#7FD4FF', '#FFD100', '#A335EE', '#1EFF00'],
    fonts: 'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Marcellus&display=swap',
    themeColor: '#070D18',
  },
  {
    id: 'persona', name: 'Persona', blurb: 'Red, black and white. Take your time.',
    modes: false, swatch: ['#F4F1EC', '#E60012', '#0B0B0B', '#FFFFFF', '#FFD400'],
    fonts: 'https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@500;700;800&display=swap',
    themeColor: '#E60012', light: true,
  },
  {
    id: 'moonring', name: 'Moonring', blurb: 'Neon line art on black. The moon row follows the real moon.',
    modes: false, swatch: ['#000000', '#7B3CFF', '#FF2BD6', '#FFA51F', '#FFFFFF'],
    fonts: 'https://fonts.googleapis.com/css2?family=Poiret+One&family=Josefin+Sans:wght@400;600&display=swap',
    themeColor: '#000000',
  },
];

// Moonring's backdrop has a row of moon phases; the real current quarter is the one lit.
export const MOONS = ['waning', 'new', 'waxing', 'full'];
export function moonQuarter(date = new Date()) {
  const synodic = 29.530588853;
  const knownNew = Date.UTC(2000, 0, 6, 18, 14);
  const age = ((((date - knownNew) / 86400000) % synodic) + synodic) % synodic;
  return MOONS[Math.floor(((age + synodic / 8) % synodic) / (synodic / 4))];
}
export const MODES = [['auto', 'Match phone'], ['light', 'Light'], ['dark', 'Dark']];

const KEY = 'tmo.look';
export function getLook() {
  try { return { skin: 'outpost', mode: 'auto', ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { skin: 'outpost', mode: 'auto' }; }
}

export function applyTheme(look = getLook()) {
  const root = document.documentElement;
  const skin = SKINS.find((s) => s.id === look.skin) || SKINS[0];
  root.dataset.skin = skin.id;
  if (skin.id === 'moonring') root.dataset.moon = moonQuarter(); else delete root.dataset.moon;
  if (!skin.modes) root.dataset.theme = skin.light ? 'light' : 'dark';
  else if (look.mode === 'light' || look.mode === 'dark') root.dataset.theme = look.mode;
  else delete root.dataset.theme;
  if (skin.fonts && !document.querySelector(`link[data-skin-fonts="${skin.id}"]`)) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = skin.fonts; l.dataset.skinFonts = skin.id;
    document.head.appendChild(l);
  }
  // Status bar colour follows the theme.
  const dark = root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const color = skin.themeColor || (dark ? '#12191B' : '#DCE2DF');
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.setAttribute('content', color); m.removeAttribute('media'); });
}

export function setLook(patch) {
  const look = { ...getLook(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(look)); } catch { /* private mode: applies for this session */ }
  applyTheme(look);
  return look;
}
