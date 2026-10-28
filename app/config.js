// Outpost configuration. Loaded as a classic script by the page AND the service worker.
//
// Leave `firebase` as null to run in single-device mode (everything is stored on this phone only).
// To share between roommates, paste your Firebase web config here (see README.md, "Firebase setup").
self.OUTPOST_CONFIG = {
  firebase: {
    apiKey: "AIzaSyBcO5Wkgn8rY5V__OsmccC6tTLP_6hC9Uw",
    authDomain: "temporaryminingoutpost.firebaseapp.com",
    projectId: "temporaryminingoutpost",
    storageBucket: "temporaryminingoutpost.firebasestorage.app",
    messagingSenderId: "973668674635",
    appId: "1:973668674635:web:d80f71c25d071d387931ce",
  },

  // Web Push certificate key pair (Firebase console > Project settings > Cloud Messaging > Web Push certificates).
  // Needed for bin-night and upkeep notifications sent by the nightly GitHub Action.
  vapidKey: "BAGDmXO2ARkH6-qRN0iCjUEITlg1azHY-t7danZS0CAFmlzP2IqTLQ0Ajpuu59rLONoteDqG7kgKDCV67WSt1vE",

  // Collection address, shown in the app. The schedule itself comes from data/schedule.json
  // (bundled) and is refreshed nightly by notifier/notify.py when Firebase is configured.
  address: "582 Rapids Lane, Mississauga",
};
