// Push notifications (bin night, upkeep due) via Firebase Cloud Messaging.
// The nightly GitHub Action (notifier/notify.py) sends to every token saved under households/{hid}/devices.

const FB = 'https://www.gstatic.com/firebasejs/12.19.0';

export const pushAvailable = () =>
  !!(self.OUTPOST_CONFIG?.firebase && self.OUTPOST_CONFIG?.vapidKey && 'Notification' in self && 'serviceWorker' in navigator);

export const pushPermission = () => ('Notification' in self ? Notification.permission : 'unsupported');

/** Ask permission, get an FCM token and save it for this household member. */
export async function enablePush(st, hid, memberId) {
  if (!pushAvailable()) throw new Error('Notifications need Firebase and a Web Push key in config.js.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications are blocked. Allow them in Android settings for this app.');
  const { getMessaging, getToken, isSupported } = await import(`${FB}/firebase-messaging.js`);
  if (!(await isSupported())) throw new Error('This browser does not support push notifications.');
  const reg = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(st.app), {
    vapidKey: self.OUTPOST_CONFIG.vapidKey,
    serviceWorkerRegistration: reg,
  });
  // Token as doc id so re-enabling on the same phone doesn't duplicate.
  await st.set(hid, 'devices', token.replace(/[/]/g, '_'), { token, memberId, updatedAt: Date.now(), ua: navigator.userAgent.slice(0, 120) });
  return token;
}

/** Show pushes that arrive while the app is open (background ones are shown by sw.js). */
export async function listenForeground(st, onMsg) {
  if (!pushAvailable() || pushPermission() !== 'granted') return;
  const { getMessaging, onMessage } = await import(`${FB}/firebase-messaging.js`);
  onMessage(getMessaging(st.app), (p) => onMsg(p.notification || p.data || {}));
}
