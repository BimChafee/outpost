// Service worker: offline app shell + background push display.
importScripts('./config.js');

const VERSION = 'tmo-v8';
const SHELL = [
  './', './index.html', './styles.css', './theme-cyber.css', './js/theme.js', './js/views/look.js', './config.js', './manifest.webmanifest',
  './data/schedule.json', './icons/icon-192.png', './icons/icon-512.png',
  './js/main.js', './js/ui.js', './js/store.js', './js/schedule.js', './js/money.js', './js/receipt.js', './js/push.js',
  './js/views/home.js', './js/views/groceries.js', './js/views/ledger.js', './js/views/bill.js',
  './js/views/upkeep.js', './js/views/settings.js', './js/views/setup.js', './js/views/camera.js', './js/views/grocery-edit.js', './js/grocery-model.js', './js/calendar-model.js', './js/views/calendar.js', './js/views/event-edit.js', './js/views/house.js', './js/views/today.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first for our own files (so updates land), cache fallback offline.
// Cache first for pinned CDN files (versioned URLs never change).
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const own = url.origin === self.location.origin;
  const pinnedCdn = /cdn\.jsdelivr\.net|gstatic\.com\/firebasejs|fonts\.(googleapis|gstatic)\.com/.test(url.host + url.pathname);
  if (!own && !pinnedCdn) return; // Firestore, Anthropic API, etc. go straight to the network

  if (own) {
    e.respondWith(fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))));
  } else {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    })));
  }
});

// Firebase Messaging shows `notification` payloads automatically when the app is in the background.
if (self.OUTPOST_CONFIG?.firebase) {
  try {
    importScripts(
      'https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js',
      'https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js',
    );
    firebase.initializeApp(self.OUTPOST_CONFIG.firebase);
    firebase.messaging();
  } catch (err) {
    console.error('[sw] push setup failed', err);
  }
}

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = e.notification.data?.FCM_MSG?.notification?.click_action || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    const w = wins.find((c) => c.url.includes(self.registration.scope));
    return w ? w.focus() : self.clients.openWindow(target);
  }));
});
