// Outpost configuration. Loaded as a classic script by the page AND the service worker.
//
// Leave `firebase` as null to run in single-device mode (everything is stored on this phone only).
// To share between roommates, paste your Firebase web config here (see README.md, "Firebase setup").
self.OUTPOST_CONFIG = {
  firebase: null,
  // firebase: {
  //   apiKey: "...",
  //   authDomain: "your-project.firebaseapp.com",
  //   projectId: "your-project",
  //   storageBucket: "your-project.appspot.com",
  //   messagingSenderId: "...",
  //   appId: "...",
  // },

  // Web Push certificate key pair (Firebase console > Project settings > Cloud Messaging > Web Push certificates).
  // Needed for bin-night and upkeep notifications sent by the nightly GitHub Action.
  vapidKey: null,

  // Collection address, shown in the app. The schedule itself comes from data/schedule.json
  // (bundled) and is refreshed nightly by notifier/notify.py when Firebase is configured.
  address: "582 Rapids Lane, Mississauga",
};
