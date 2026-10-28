// Receipt photo -> { merchant, date, items:[{name, price}], subtotal, tax, tip, total }
//
// Two readers:
//   - On-device OCR with Tesseract.js (free, private, decent on clean receipts).
//   - Claude vision (much better on crumpled/long receipts) when an Anthropic API key is saved in Settings.
//     The key is stored only on this phone and requests go straight from the phone to the Anthropic API.

const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
const ANTHROPIC_SDK = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.133.0/+esm';
const CLAUDE_MODEL = 'claude-opus-5-5';

/** Downscale a photo to a JPEG. Returns { dataUrl, base64 }. */
export async function compressImage(file, maxDim = 1600, quality = 0.82) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL('image/jpeg', quality);
  return { dataUrl, base64: dataUrl.split(',')[1] };
}

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load the receipt reader. Check your connection.'));
    document.head.appendChild(s);
  });
}

// ---------- text parsing (used for Tesseract output) ----------
const PRICE = /(-?\$?\s?\d{1,4}[.,]\d{2})\s*-?\s*[A-Z*]{0,3}\s*$/;
const SKIP = /\b(sub-?total|total|balance|change|cash|visa|master|debit|credit|amex|tend|auth|approved|card|payment|points|saved|savings|you saved|rounding|item count|items sold)\b/i;
const TAX = /\b(hst|gst|pst|tax)\b/i;
const TIP = /\b(tip|gratuity)\b/i;
const num = (s) => Number(String(s).replace(/[$\s]/g, '').replace(',', '.'));

export function parseReceiptText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = { merchant: '', date: '', items: [], subtotal: 0, tax: 0, tip: 0, total: 0 };
  out.merchant = (lines.find((l) => /[a-z]{3,}/i.test(l) && !PRICE.test(l)) || '').slice(0, 40);

  const dm = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/) || text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})\b/);
  if (dm) {
    let [y, m, d] = dm[1].length === 4 ? [dm[1], dm[2], dm[3]] : [dm[3], dm[1], dm[2]];
    if (y.length === 2) y = '20' + y;
    if (Number(m) > 12) [m, d] = [d, m];
    out.date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  for (const line of lines) {
    const m = line.match(PRICE);
    if (!m) continue;
    const price = num(m[1]);
    const label = line.slice(0, m.index).replace(/[.\s]+$/, '').trim();
    if (TAX.test(label)) { out.tax += price; continue; }
    if (TIP.test(label)) { out.tip += price; continue; }
    if (/sub-?total/i.test(label)) { out.subtotal = price; continue; }
    if (/\btotal\b/i.test(label)) { out.total = Math.max(out.total, price); continue; }
    if (SKIP.test(label) || label.length < 2) continue;
    out.items.push({ name: label.replace(/^\d{6,}\s*/, '').slice(0, 48), price });
  }
  out.tax = Math.round(out.tax * 100) / 100;
  return out;
}

export async function scanWithTesseract(file, onProgress) {
  await loadScript(TESSERACT);
  const worker = await self.Tesseract.createWorker('eng', 1, {
    logger: (m) => m.status === 'recognizing text' && onProgress?.(m.progress),
  });
  try {
    const { data } = await worker.recognize(file);
    return parseReceiptText(data.text);
  } finally {
    await worker.terminate();
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
          name: { type: 'string', description: 'Readable item name, expanded from receipt abbreviations where obvious' },
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

export async function scanWithClaude(base64, apiKey) {
  const { default: Anthropic } = await import(ANTHROPIC_SDK);
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const request = {
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    output_config: { format: { type: 'json_schema', schema: RECEIPT_SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
        { type: 'text', text:
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
    else throw e;
  }
  if (res.stop_reason === 'refusal') throw new Error('Claude could not read this receipt. Try the on-device reader.');
  const text = res.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('Claude returned no receipt data.');
  return JSON.parse(text);
}

/** Read a receipt photo with the best available reader. */
export async function scanReceipt(file, { apiKey, onProgress } = {}) {
  const img = await compressImage(file);
  const thumb = await compressImage(file, 640, 0.6);
  const parsed = apiKey ? await scanWithClaude(img.base64, apiKey) : await scanWithTesseract(img.dataUrl, onProgress);
  return { ...parsed, photo: thumb.dataUrl, reader: apiKey ? 'Claude' : 'on-device OCR' };
}
