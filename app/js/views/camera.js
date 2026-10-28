// In-app receipt camera. Keeps the scan inside the app: opening Android's camera app can unload
// an installed web app, and the photo is lost when it reloads.
import { html, useEffect, useRef, useState, Icon } from '../ui.js';
import { warmUpReader } from '../receipt.js';

export function ReceiptCamera({ onDone, onClose }) {
  const video = useRef(null);
  const stream = useRef(null);
  const [state, setState] = useState('starting'); // starting | live | denied | unsupported
  const [shots, setShots] = useState([]);         // [{ blob, url }]
  const [torch, setTorch] = useState(null);       // null = not available
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('tmo.claudeKey')) warmUpReader().catch(() => {});
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setState('unsupported');
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        video.current.srcObject = s;
        await video.current.play().catch(() => {});
        const caps = s.getVideoTracks()[0].getCapabilities?.() || {};
        if (caps.torch) setTorch(false);
        setState('live');
      } catch (e) {
        setState(e?.name === 'NotAllowedError' ? 'denied' : 'unsupported');
      }
    })();
    return () => { cancelled = true; stream.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  useEffect(() => () => shots.forEach((s) => URL.revokeObjectURL(s.url)), []);

  const toggleTorch = async () => {
    const t = stream.current?.getVideoTracks()[0];
    try { await t.applyConstraints({ advanced: [{ torch: !torch }] }); setTorch(!torch); } catch { setTorch(null); }
  };

  const snap = async () => {
    const track = stream.current?.getVideoTracks()[0];
    let blob = null;
    try {
      if ('ImageCapture' in self && track) blob = await new ImageCapture(track).takePhoto();
    } catch { /* fall back to a video frame */ }
    if (!blob) {
      const v = video.current;
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
    }
    setFlash(true); setTimeout(() => setFlash(false), 160);
    setShots((xs) => [...xs, { blob, url: URL.createObjectURL(blob) }]);
  };

  const fromGallery = (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (files.length) onDone([...shots.map((s) => s.blob), ...files]);
  };

  const finish = () => onDone(shots.map((s) => s.blob));

  return html`
    <div class="cam" role="dialog" aria-modal="true" aria-label="Photograph a receipt">
      <video ref=${video} class="cam-video" playsinline muted autoplay></video>
      ${flash && html`<div class="cam-flash"></div>`}

      <div class="cam-top">
        <button class="cam-round" onClick=${onClose} aria-label="Close camera"><${Icon} name="x" /></button>
        <p class="cam-hint">
          ${state === 'live' ? (shots.length ? 'Long receipt? Shoot the next part, then tap Use.' : 'Lay the receipt flat in good light and fill the frame.')
            : state === 'starting' ? 'Starting the camera…'
            : state === 'denied' ? 'Camera access is off for this app. Choose a photo instead, or allow the camera in Android settings.'
            : "This phone's browser can't open the camera here. Choose a photo instead."}
        </p>
        ${torch !== null ? html`<button class=${`cam-round ${torch ? 'on' : ''}`} onClick=${toggleTorch} aria-pressed=${String(torch)} aria-label="Flashlight"><${Icon} name="bolt" /></button>` : html`<span class="cam-round ghost"></span>`}
      </div>

      ${state === 'live' && html`<div class="cam-frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>`}

      <div class="cam-bottom">
        <label class="cam-side">
          <${Icon} name="image" />
          <span>Choose photo</span>
          <input type="file" accept="image/*" multiple hidden onChange=${fromGallery} />
        </label>
        <button class="cam-shutter" onClick=${snap} disabled=${state !== 'live'} aria-label=${shots.length ? 'Take the next part' : 'Take photo'}>
          <span></span>
        </button>
        ${shots.length ? html`
          <button class="cam-side cam-use" onClick=${finish}>
            <span class="cam-stack">
              ${shots.slice(-2).map((s) => html`<img src=${s.url} alt="" />`)}
              <b>${shots.length}</b>
            </span>
            <span>Use ${shots.length === 1 ? 'photo' : `${shots.length} photos`}</span>
          </button>` : html`<span class="cam-side ghost"></span>`}
      </div>
    </div>`;
}
