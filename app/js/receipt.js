// Receipt photo(s) -> { merchant, date, items:[{name, price}], subtotal, tax, tip, total, check }
//
// Two readers:
//   - On-device OCR with Tesseract.js (free, private). Photos are cleaned up first (greyscale,
//     contrast stretch, sensible size), and the engine is kept warm between scans.
//   - Claude vision (much better on crumpled/long receipts) when an Anthropic API key is saved in Settings.
//     The key is stored only on this phone and requests go straight from the phone to the Anthropic API.

const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
const ANTHROPIC_SDK = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.133.0/+esm';
const CLAUDE_MODEL = 'claude-opus-5-5';

// ---------- images ----------
async function toBitmap(src) {
  if (src instanceof ImageBitmap) return src;
  return createImageBitmap(src, { imageOrientation: 'from-image' });
}

/** Downscale a photo to a JPEG. Returns { dataUrl, base64 }. */
export async function compressImage(src, maxDim = 1600, quality = 0.82) {
  const bmp = await toBitmap(src);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL('image/jpeg', quality);
  return { dataUrl, base64: dataUrl.split(',')[1] };
}

/** OCR-friendly version: greyscale, contrast stretched between the 2nd and 98th percentile, ~2000px tall side. */
export async function prepareForOcr(src) {
  const bmp = await toBitmap(src);
  const target = 2000;
  const scale = Math.min(2, target / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0;
    d[i] = g; hist[g]++;
  }
  const n = d.length / 4;
  let lo = 0, hi = 255, acc = 0;
  for (; lo < 255; lo++) { acc += hist[lo]; if (acc > n * 0.02) break; }
  acc = 0;
  for (; hi > 0; hi--) { acc += hist[hi]; if (acc > n * 0.02) break; }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing && self.Tesseract) return res();
    const s = existing || document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error("The receipt reader didn't download. Check your connection and try again."));
    if (!existing) document.head.appendChild(s);
  });
}

// ---------- text parsing ----------
const PRICE_END = /(?:^|\s)([-~]?\s?\$?\s?\d{1,4}\s?[.,]\s?\d{2})(?:\s*-)?(?:\s+[A-Za-z0-9*]{1,2})?\s*$/;
const PRICE_ONLY = /^[-~]?\s?\$?\s?\d{1,4}\s?[.,]\s?\d{2}(?:\s+[A-Za-z0-9*]{1,2})?$/;
const META = /\b(sub-?\s?total|total|balance|change|cash|visa|master|debit|credit|amex|tend|auth|approved|card|payment|points|saved|savings|rounding|item count|items sold|ref|trans|terminal|account|acct)\b/i;
const TAX = /\b(hst|gst|pst|qst|tax)\b/i;
const TIP = /\b(tip|gratuity)\b/i;
const WEIGHED = /@|\/\s?kg|\/\s?lb|\bkg\b|\blb\b/i;
const num = (s) => {
  const neg = /^[-~]/.test(s.trim());
  const v = Number(s.replace(/[^\d.,]/g, '').replace(',', '.'));
  return neg ? -v : v;
};
const tidy = (s) => s
  .replace(/^\d{4,}\s+/, '')            // SKU / PLU codes
  .replace(/[~_|]+/g, ' ')
  .replace(/\s{2,}/g, ' ')
  .trim()
  .toLowerCase()
  .replace(/^./, (c) => c.toUpperCase())
  .slice(0, 48);

export function parseReceiptText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = { merchant: '', date: '', items: [], subtotal: 0, tax: 0, tip: 0, total: 0 };
  const firstWords = lines.find((l) => /[a-z]{3,}/i.test(l) && !PRICE_END.test(l));
  out.merchant = firstWords ? firstWords.replace(/[^\w&' .-]/g, '').trim().replace(/\b\w+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).slice(0, 40) : '';

  const dm = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/) || text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})\b/);
  if (dm) {
    let [y, m, d] = dm[1].length === 4 ? [dm[1], dm[2], dm[3]] : [dm[3], dm[1], dm[2]];
    if (y.length === 2) y = '20' + y;
    if (Number(m) > 12) [m, d] = [d, m];
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      out.date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  let pendingName = '';
  let afterTotal = false;
  for (const line of lines) {
    const m = line.match(PRICE_END);
    if (!m) {
      // A name on its own line; its price may be on the next line.
      pendingName = /[a-z]{3,}/i.test(line) && !META.test(line) && !WEIGHED.test(line) ? line : '';
      continue;
    }
    let price = num(m[1]);
    if (price > 0 && /\d{2}\s*-/.test(m[0])) price = -price;   // "1.00-" style discounts
    let label = line.slice(0, m.index).replace(/[.\s]+$/, '').trim();
    if (!label && PRICE_ONLY.test(line) && pendingName) label = pendingName;
    pendingName = '';
    if (TAX.test(label)) { out.tax = Math.round((out.tax + price) * 100) / 100; continue; }
    if (TIP.test(label)) { out.tip += price; continue; }
    if (/sub-?\s?total/i.test(label)) { out.subtotal = price; continue; }
    if (/\btotal\b/i.test(label)) { out.total = Math.max(out.total, price); afterTotal = true; continue; }
    if (afterTotal) continue;                      // payment, change, loyalty lines
    // Before the total, a negative line is a discount and always counts, whatever it's called.
    if ((price >= 0 && META.test(label)) || WEIGHED.test(label) || label.replace(/[^a-z]/gi, '').length < 2) continue;
    if (price === 0) continue;
    out.items.push({ name: tidy(label), price });
  }
  return out;
}

/** How well the items add up against the receipt's own subtotal/total. */
export function reconcile(r) {
  const itemsSum = Math.round(r.items.reduce((s, i) => s + Number(i.price || 0), 0) * 100);
  const sub = Math.round((r.subtotal || 0) * 100);
  const total = Math.round((r.total || 0) * 100);
  const tax = Math.round((r.tax || 0) * 100) + Math.round((r.tip || 0) * 100);
  const target = sub || (total ? total - tax : 0);
  if (!target) return { itemsSum, target: 0, diff: 0, ok: null };
  return { itemsSum, target, diff: target - itemsSum, ok: Math.abs(target - itemsSum) <= 2 };
}

// ---------- Tesseract ----------
let workerP = null;
/** Start loading the on-device reader early (e.g. while the camera is open). */
export function warmUpReader() {
  if (!workerP) {
    workerP = (async () => {
      await loadScript(TESSERACT);
      const w = await self.Tesseract.createWorker('eng', 1, {
        logger: (m) => { if (m.status === 'recognizing text') currentProgress?.(m.progress); },
      });
      await w.setParameters({ tessedit_pageseg_mode: '6' });
      return w;
    })();
    workerP.catch(() => { workerP = null; });
  }
  return workerP;
}
let currentProgress = null;

export async function scanWithTesseract(src, onProgress) {
  const w = await warmUpReader();
  currentProgress = onProgress;
  try {
    const canvas = await prepareForOcr(src);
    const { data } = await w.recognize(canvas);
    return { ...parseReceiptText(data.text), rawText: data.text };
  } finally {
    currentProgress = null;
  }
}

// ---------- Claude vision ----------
const RECEIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['merchant', 'date', 'items', 'subtotal', 'tax', 'tip', 'total'],
  properties: {
    merchant: { type: 'string', description: 'Store name' },
    date: { type: 'string', description: 'Purchase date as YYYY-MM-DD, or empty string if not shown' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'price'],
        properties: {
          name: { type: 'string', description: 'Readable item name in sentence case, expanded from receipt abbreviations where obvious' },
          price: { type: 'number', description: 'Final line price in dollars after any line discount; negative for discounts/coupons' },
        },
      },
    },
    subtotal: { type: 'number' },
    tax: { type: 'number', description: 'All taxes combined (HST/GST/PST); 0 if none' },
    tip: { type: 'number', description: '0 if none' },
    total: { type: 'number', description: 'Grand total charged' },
  },
};

export async function scanWithClaude(images, apiKey) {
  const { default: Anthropic } = await import(ANTHROPIC_SDK);
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const request = {
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    output_config: { format: { type: 'json_schema', schema: RECEIPT_SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        ...images.map((b64) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } })),
        { type: 'text', text:
          (images.length > 1 ? `These ${images.length} photos are parts of one long receipt, top to bottom; don't double-count lines that appear in two photos. ` : '') +
          'Read this receipt for a shared-household bill splitter. List every purchased line item with its final price. ' +
          'Fold deposits, eco fees and per-item discounts into the line they belong to when it is clear, otherwise list them as their own line. ' +
          'Do not list subtotal, tax, tip, total, payment or change lines as items.' },
      ],
    }],
  };
  let res;
  try {
    // Server-side fallback: if the request is declined by a safety classifier, the API retries on a fallback model.
    res = await client.beta.messages.create({ ...request, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  } catch (e) {
    if (e?.status === 400 && /fallback/i.test(e?.message || '')) res = await client.messages.create(request);
    else if (e?.status === 401) throw new Error('The Anthropic API key was rejected. Check it in Settings, or clear it to read receipts on the phone.');
    else if (e?.status === 429) throw new Error('Claude is rate limited right now. Try again in a minute.');
    else throw e;
  }
  if (res.stop_reason === 'refusal') throw new Error('Claude could not read this receipt. Clear the key in Settings to use the on-device reader.');
  const text = res.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('Claude returned no receipt data.');
  return JSON.parse(text);
}

/**
 * Read one or more photos of the same receipt with the best available reader.
 * onStage(stage, progress) reports 'preparing' | 'loading' | 'reading'.
 */
export async function scanReceipt(files, { apiKey, onStage } = {}) {
  const list = Array.isArray(files) ? files : [files];
  onStage?.('preparing', 0);
  const bitmaps = await Promise.all(list.map((f) => toBitmap(f)));
  const thumb = await compressImage(bitmaps[0], 720, 0.6);

  if (apiKey) {
    onStage?.('reading', null);
    const imgs = await Promise.all(bitmaps.map((b) => compressImage(b, 1600)));
    const r = await scanWithClaude(imgs.map((i) => i.base64), apiKey);
    return { ...r, photo: thumb.dataUrl, reader: 'Claude', check: reconcile(r) };
  }

  onStage?.('loading', null);
  await warmUpReader();
  const merged = { merchant: '', date: '', items: [], subtotal: 0, tax: 0, tip: 0, total: 0, rawText: '' };
  for (let i = 0; i < bitmaps.length; i++) {
    const r = await scanWithTesseract(bitmaps[i], (p) => onStage?.('reading', (i + p) / bitmaps.length));
    merged.merchant ||= r.merchant;
    merged.date ||= r.date;
    merged.items.push(...r.items);
    merged.subtotal = r.subtotal || merged.subtotal;
    merged.tax = r.tax || merged.tax;
    merged.tip = r.tip || merged.tip;
    merged.total = r.total || merged.total;
    merged.rawText += (merged.rawText ? '\n' : '') + r.rawText;
  }
  return { ...merged, photo: thumb.dataUrl, reader: 'the on-device reader', check: reconcile(merged) };
}
