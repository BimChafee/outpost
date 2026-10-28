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
];
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
  if (!skin.modes) root.dataset.theme = 'dark';
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
