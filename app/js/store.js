// Data layer. One API, two backends:
//   - "shared": Firebase Firestore (live sync between roommates' phones)
//   - "local":  localStorage on this device only (used when config.js has no Firebase config)
//
// Everything lives under one household:  households/{hid}  with sub-collections
//   groceries, ledger, upkeep, devices   and   meta/schedule (written by the notifier).

const FB = 'https://www.gstatic.com/firebasejs/12.19.0';
const HID_KEY = 'tmo.household';
const ME_KEY = 'tmo.me';

export const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function randomCode() {
  // Household codes are the shared secret for joining; no lookalike characters.
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  const buf = crypto.getRandomValues(new Uint8Array(10));
  for (const b of buf) s += abc[b % abc.length];
  return s;
}

const byCreated = (a, b) => (a.createdAt || 0) - (b.createdAt || 0);

// ---------- local backend ----------
function localBackend() {
  const KEY = 'tmo.local';
  const listeners = new Set();
  const load = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || { households: {} }; }
    catch { return { households: {} }; }
  };
  let state = load();
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.error(e); }
    listeners.forEach((fn) => fn());
  };
  const h = (hid) => state.households[hid];
  const coll = (hid, c) => ((h(hid).colls ||= {})[c] ||= {});

  return {
    mode: 'local',
    async ready() {},
    async exists(hid) { return !!h(hid); },
    async createHousehold(hid, data) {
      state.households[hid] = { doc: { ...data, createdAt: Date.now() }, colls: {}, meta: {} };
      save();
    },
    watchHousehold(hid, cb) {
      const fire = () => cb(h(hid) ? { id: hid, ...h(hid).doc } : null);
      listeners.add(fire); fire();
      return () => listeners.delete(fire);
    },
    async updateHousehold(hid, patch) { Object.assign(h(hid).doc, patch); save(); },
    watch(hid, c, cb) {
      const fire = () => {
        if (!h(hid)) return cb([]);
        cb(Object.entries(coll(hid, c)).map(([id, d]) => ({ id, ...d })).sort(byCreated));
      };
      listeners.add(fire); fire();
      return () => listeners.delete(fire);
    },
    watchMeta(hid, name, cb) {
      const fire = () => cb(h(hid)?.meta?.[name] || null);
      listeners.add(fire); fire();
      return () => listeners.delete(fire);
    },
    async add(hid, c, data) {
      const id = newId();
      coll(hid, c)[id] = { ...data, createdAt: Date.now() };
      save();
      return id;
    },
    async set(hid, c, id, data) { coll(hid, c)[id] = { createdAt: Date.now(), ...data }; save(); },
    async update(hid, c, id, patch) {
      const d = coll(hid, c)[id];
      if (d) { Object.assign(d, patch); save(); }
    },
    async remove(hid, c, id) { delete coll(hid, c)[id]; save(); },
  };
}

// ---------- Firebase backend ----------
async function firebaseBackend(cfg) {
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(`${FB}/firebase-app.js`),
    import(`${FB}/firebase-auth.js`),
    import(`${FB}/firebase-firestore.js`),
  ]);
  const app = initializeApp(cfg);
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  });
  const a = auth.getAuth(app);
  const signedIn = new Promise((resolve, reject) => {
    const off = auth.onAuthStateChanged(a, (u) => { if (u) { off(); resolve(u); } });
    auth.signInAnonymously(a).catch(reject);
  });
  const hdoc = (hid) => fs.doc(db, 'households', hid);
  const cref = (hid, c) => fs.collection(db, 'households', hid, c);
  const onErr = (e) => console.error('[store]', e);

  return {
    mode: 'shared',
    app,
    async ready() { await signedIn; },
    async exists(hid) {
      await signedIn;
      return (await fs.getDoc(hdoc(hid))).exists();
    },
    async createHousehold(hid, data) {
      await signedIn;
      await fs.setDoc(hdoc(hid), { ...data, createdAt: Date.now() });
    },
    watchHousehold(hid, cb) {
      return fs.onSnapshot(hdoc(hid), (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null), onErr);
    },
    async updateHousehold(hid, patch) { await fs.updateDoc(hdoc(hid), patch); },
    watch(hid, c, cb) {
      return fs.onSnapshot(cref(hid, c), (snap) => {
        cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byCreated));
      }, onErr);
    },
    watchMeta(hid, name, cb) {
      return fs.onSnapshot(fs.doc(db, 'households', hid, 'meta', name),
        (s) => cb(s.exists() ? s.data() : null), onErr);
    },
    async add(hid, c, data) {
      const id = newId();
      await fs.setDoc(fs.doc(cref(hid, c), id), { ...data, createdAt: Date.now() });
      return id;
    },
    async set(hid, c, id, data) {
      await fs.setDoc(fs.doc(cref(hid, c), id), { createdAt: Date.now(), ...data });
    },
    async update(hid, c, id, patch) { await fs.updateDoc(fs.doc(cref(hid, c), id), patch); },
    async remove(hid, c, id) { await fs.deleteDoc(fs.doc(cref(hid, c), id)); },
  };
}

// ---------- public ----------
let backend;
export async function openStore() {
  const cfg = self.OUTPOST_CONFIG?.firebase;
  if (cfg) {
    try { backend = await firebaseBackend(cfg); }
    catch (e) { console.error('Firebase failed to load, falling back to this-device mode', e); }
  }
  backend ||= localBackend();
  await backend.ready();
  return backend;
}
export const store = () => backend;

export const session = {
  get hid() { return localStorage.getItem(HID_KEY); },
  set hid(v) { v ? localStorage.setItem(HID_KEY, v) : localStorage.removeItem(HID_KEY); },
  get me() { return localStorage.getItem(ME_KEY); },
  set me(v) { v ? localStorage.setItem(ME_KEY, v) : localStorage.removeItem(ME_KEY); },
};
