import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import Groq from 'groq-sdk';
import fs, { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

// ── Firebase / Firestore ──────────────────────────────────────────────────────
let db = null;
if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    }
    db = admin.firestore();
    console.log('✅ Firestore connected');
  } catch (e) {
    console.warn('⚠️  Firebase init failed:', e.message);
  }
}

// ── Order persistence (Firestore or flat JSON fallback) ───────────────────────
const DB_PATH = path.join(__dirname, 'orders.json');

async function loadOrders() {
  if (db) {
    const snap = await db.collection('orders').orderBy('placedAt', 'desc').get();
    return snap.docs.map(d => d.data());
  }
  try {
    if (!fs.existsSync(DB_PATH)) return [];
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch { return []; }
}

async function getOrder(id) {
  if (db) {
    const doc = await db.collection('orders').doc(id).get();
    return doc.exists ? doc.data() : null;
  }
  try {
    const orders = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    return orders.find(o => o.id === id) || null;
  } catch { return null; }
}

async function saveOrder(order) {
  if (db) {
    await db.collection('orders').doc(order.id).set(order);
    return;
  }
  let orders = [];
  try { orders = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch {}
  const idx = orders.findIndex(o => o.id === order.id);
  if (idx >= 0) orders[idx] = order; else orders.push(order);
  fs.writeFileSync(DB_PATH, JSON.stringify(orders, null, 2), 'utf8');
}

async function countTodayOrders() {
  const today = todayNPT();
  if (db) {
    const snap = await db.collection('orders').where('tokenDate', '==', today).get();
    return snap.size;
  }
  try {
    const orders = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    return orders.filter(o => o.tokenDate === today).length;
  } catch { return 0; }
}

// ── Nepal Standard Time helper (UTC+5:45) ─────────────────────────────────────
function todayNPT() {
  const nptOffsetMs = (5 * 60 + 45) * 60 * 1000;
  const nptDate = new Date(Date.now() + nptOffsetMs - new Date().getTimezoneOffset() * 60000);
  return nptDate.toISOString().slice(0, 10);
}

// ── Bikram Sambat conversion ──────────────────────────────────────────────────
const BS_CAL = {
  2079: { ad:[2022,4,14], d:[31,31,32,32,31,30,30,29,30,29,30,30] },
  2080: { ad:[2023,4,14], d:[31,31,32,32,31,30,30,29,30,29,30,30] },
  2081: { ad:[2024,4,13], d:[31,31,32,32,31,30,30,29,30,29,30,30] },
  2082: { ad:[2025,4,14], d:[31,31,32,32,31,30,30,29,30,29,30,30] },
  2083: { ad:[2026,4,14], d:[31,32,31,32,31,30,30,30,29,29,30,30] },
  2084: { ad:[2027,4,14], d:[31,32,31,32,31,30,30,30,29,30,29,31] },
  2085: { ad:[2028,4,13], d:[31,31,32,31,31,31,30,29,30,29,30,30] },
  2086: { ad:[2029,4,14], d:[31,31,32,31,32,30,30,29,30,29,30,30] },
  2087: { ad:[2030,4,14], d:[31,32,31,32,31,30,30,29,30,29,30,30] },
};
const BS_MONTHS = ['Baisakh','Jestha','Ashadh','Shrawan','Bhadra','Ashwin','Kartik','Mangsir','Poush','Magh','Falgun','Chaitra'];

function adToBS(adYear, adMonth, adDay) {
  const years = Object.keys(BS_CAL).map(Number).sort();
  const target = new Date(adYear, adMonth - 1, adDay);
  for (let i = 0; i < years.length; i++) {
    const y = years[i];
    const [sy, sm, sd] = BS_CAL[y].ad;
    const bsStart = new Date(sy, sm - 1, sd);
    const nextEntry = BS_CAL[years[i + 1]];
    const bsEnd = nextEntry ? new Date(nextEntry.ad[0], nextEntry.ad[1] - 1, nextEntry.ad[2]) : new Date(sy + 1, sm - 1, sd);
    if (target >= bsStart && target < bsEnd) {
      let rem = Math.round((target - bsStart) / 86400000);
      for (let m = 0; m < 12; m++) {
        if (rem < BS_CAL[y].d[m]) return { year: y, month: m + 1, day: rem + 1 };
        rem -= BS_CAL[y].d[m];
      }
    }
  }
  return null;
}

function formatBS(isoDate) {
  const d = new Date(isoDate);
  const bs = adToBS(d.getFullYear(), d.getMonth() + 1, d.getDate());
  if (!bs) return isoDate;
  return `${bs.day} ${BS_MONTHS[bs.month - 1]} ${bs.year} BS`;
}

function fmtToken(n) {
  return String(n).padStart(4, '0');
}

// ── WhatsApp message builder ──────────────────────────────────────────────────
function buildWhatsAppMessage(order) {
  const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
  const pw = encodeURIComponent(process.env.ADMIN_PASSWORD || '');
  const id = order.id;
  const isDelivery = order.delivery === 'delivery';

  const lines = [
    `🛒 *New Order — Wagle Electricals & General Suppliers*`,
    `Order ID: ${id}`,
    `Token: #${fmtToken(order.tokenNumber)} (${order.tokenDateBS || order.tokenDate})`,
    ``,
    `*Items:*`,
    ...(order.items || []).map(i =>
      `• ${i.qty}× ${i.name} — NPR ${((i.price || 0) * i.qty).toLocaleString('en-IN')}`
    ),
    ``,
    `Subtotal: NPR ${(order.subtotal || 0).toLocaleString('en-IN')}`,
    `Method: ${isDelivery ? 'Home Delivery (+NPR 150)' : 'Store Pickup'}`,
  ];

  if (order.customer) {
    lines.push(``, `*Delivery Details:*`);
    if (order.customer.name)     lines.push(`Name: ${order.customer.name}`);
    if (order.customer.phone)    lines.push(`Phone: ${order.customer.phone}`);
    if (order.customer.area)     lines.push(`Area: ${order.customer.area}`);
    if (order.customer.landmark) lines.push(`Landmark: ${order.customer.landmark}`);
  }

  lines.push(``, `Please confirm availability and provide quotation. Thank you!`);

  if (siteUrl) {
    const base = `${siteUrl}/api/orders/${id}/quick-action?pw=${pw}&action=`;
    lines.push(
      ``,
      `*── Quick Actions ──*`,
      `✅ Accept: ${base}accept`,
      `❌ Reject: ${base}reject`,
      isDelivery
        ? `🚚 Out for Delivery: ${base}dispatch`
        : `📦 Ready for Pickup: ${base}ready`,
    );
  }

  return lines.join('\n');
}

// ── Product catalogue ─────────────────────────────────────────────────────────
let PRODUCTS = [];
try {
  PRODUCTS = JSON.parse(readFileSync(path.join(__dirname, 'products.json'), 'utf8'));
} catch {
  console.warn('⚠️  products.json not found');
}

const FALLBACK = [
  { id:'p01', name:'Copper Wire Roll 2.5mm²',    brand:'Havells',     cat:'wiring',   price:5800,  stock:'in',  icon:'wire',    ph:'90m flexible · ISI marked',        keys:['copper','wire','2.5','2.5mm','flexible'] },
  { id:'p02', name:'House Wire 1.5mm² 90m',       brand:'Finolex',     cat:'wiring',   price:4200,  stock:'in',  icon:'wire',    ph:'PVC insulated · single core',       keys:['house','wire','1.5','1.5mm'] },
  { id:'p03', name:'4-Core Armoured Cable 30m',   brand:'Polycab',     cat:'wiring',   price:9400,  stock:'low', icon:'wire',    ph:'Outdoor · 30m roll',                keys:['armoured','cable','4 core','outdoor'] },
  { id:'p04', name:'LED Bulb 9W Cool White',      brand:'Philips',     cat:'lighting', price:320,   stock:'in',  icon:'led',     ph:'B22 base · 6500K',                  keys:['led','bulb','9w','9 watt','cool white','b22'] },
  { id:'p05', name:'LED Tube Light 18W',          brand:'Surya',       cat:'lighting', price:480,   stock:'in',  icon:'led',     ph:'4ft · daylight',                    keys:['led','tube','18w','tube light','4ft'] },
  { id:'p06', name:'Recessed Panel Light 12W',    brand:'Wipro',       cat:'lighting', price:850,   stock:'in',  icon:'panel',   ph:'Round · ceiling mount',             keys:['panel','light','12w','recessed','round','ceiling'] },
  { id:'p07', name:'Modular Switch 6A',           brand:'Anchor Roma', cat:'switches', price:140,   stock:'in',  icon:'switch',  ph:'1-way · ivory',                     keys:['modular','switch','6a','1 way'] },
  { id:'p08', name:'3-Pin Socket 16A',            brand:'Legrand',     cat:'switches', price:240,   stock:'in',  icon:'switch',  ph:'Heavy duty · earthed',              keys:['3 pin','socket','16a','3pin'] },
  { id:'p09', name:'Switch Plate 8 Module',       brand:'GM Modular',  cat:'switches', price:380,   stock:'low', icon:'panel',   ph:'Polycarbonate frame',               keys:['switch plate','8 module','plate','frame'] },
  { id:'p10', name:'Solar Panel 165W',            brand:'Luminous',    cat:'solar',    price:9800,  stock:'in',  icon:'solar',   ph:'Polycrystalline · 12V',             keys:['solar','panel','165w','12v','poly'] },
  { id:'p11', name:'Solar Charge Controller 30A', brand:'Microtek',    cat:'solar',    price:3200,  stock:'in',  icon:'panel',   ph:'PWM · 12/24V auto',                 keys:['charge controller','solar','30a','pwm'] },
  { id:'p12', name:'Tubular Battery 150Ah',       brand:'Exide',       cat:'solar',    price:18500, stock:'low', icon:'battery', ph:'Deep cycle · 60-month',             keys:['battery','tubular','150ah','deep cycle'] },
  { id:'p13', name:'Ceiling Fan 48"',             brand:'Crompton',    cat:'fans',     price:5400,  stock:'in',  icon:'fan',     ph:'Brown · 3-blade',                   keys:['ceiling','fan','48','48 inch'] },
  { id:'p14', name:'Table Fan 16"',               brand:'Bajaj',       cat:'fans',     price:3200,  stock:'in',  icon:'fan',     ph:'High speed · oscillating',          keys:['table','fan','16','oscillating'] },
  { id:'p15', name:'Exhaust Fan 8"',              brand:'Usha',        cat:'fans',     price:1850,  stock:'in',  icon:'fan',     ph:'Kitchen / bathroom',                keys:['exhaust','fan','8','kitchen','bathroom'] },
  { id:'p16', name:'MCB Single Pole 16A',         brand:'Schneider',   cat:'safety',   price:340,   stock:'in',  icon:'mcb',     ph:'C-curve · 6kA',                     keys:['mcb','16a','single pole','c-curve','breaker'] },
  { id:'p17', name:'Distribution Box 8-Way',      brand:'Havells',     cat:'safety',   price:1450,  stock:'in',  icon:'mcb',     ph:'Surface mount · double door',       keys:['distribution','db','8 way','box','surface'] },
  { id:'p18', name:'Voltage Stabiliser 4kVA',     brand:'V-Guard',     cat:'safety',   price:7200,  stock:'low', icon:'panel',   ph:'AC / fridge protection',            keys:['stabiliser','stabilizer','voltage','4kva','ac'] },
  { id:'p19', name:'Insulated Pliers 8"',         brand:'Taparia',     cat:'tools',    price:680,   stock:'in',  icon:'tool',    ph:'1000V rated · combination',         keys:['pliers','insulated','tool','8 inch'] },
  { id:'p20', name:'Digital Multimeter',          brand:'Fluke',       cat:'tools',    price:4400,  stock:'in',  icon:'tool',    ph:'AC/DC · auto-ranging',              keys:['multimeter','digital','tester'] },
  { id:'p21', name:'Extension Board 6-Socket',    brand:'GoldMedal',   cat:'extras',   price:880,   stock:'in',  icon:'plug',    ph:'2m cord · individual switch',       keys:['extension','board','6 socket','strip'] },
  { id:'p22', name:'Spike Guard 4-Way',           brand:'Belkin',      cat:'extras',   price:1450,  stock:'in',  icon:'plug',    ph:'Surge protection · USB',            keys:['spike','guard','4 way','surge'] },
];
if (!PRODUCTS.length) PRODUCTS = FALLBACK;

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), db: db ? 'firestore' : 'json' });
});

app.get('/api/products', (_req, res) => res.json(PRODUCTS));

app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.json(PRODUCTS);
  const results = PRODUCTS.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.brand.toLowerCase().includes(q) ||
    p.cat.includes(q) ||
    (p.keys || []).some(k => k.includes(q))
  );
  res.json(results);
});

app.post('/api/orders', async (req, res) => {
  try {
    const today = todayNPT();
    const tokenNumber = (await countTodayOrders()) + 1;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const suffix = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

    const order = {
      id: 'WG-' + suffix,
      tokenNumber,
      tokenDate: today,
      tokenDateBS: formatBS(today),
      items: req.body.items || [],
      subtotal: req.body.subtotal || 0,
      delivery: req.body.delivery || 'pickup',
      customer: req.body.customer || null,
      stage: 1,
      status: 'submitted',
      placedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveOrder(order);

    const waMsg = buildWhatsAppMessage(order);
    const whatsappUrl = `https://wa.me/${process.env.SHOP_WHATSAPP || '9779748434921'}?text=${encodeURIComponent(waMsg)}`;

    res.status(201).json({
      orderId: order.id,
      tokenNumber,
      tokenFormatted: fmtToken(tokenNumber),
      tokenDate: today,
      whatsappUrl,
    });
  } catch (err) {
    console.error('POST /api/orders:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/orders/:id/status', async (req, res) => {
  const { stage, status, adminPassword } = req.body;
  if (!process.env.ADMIN_PASSWORD || adminPassword !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (stage === undefined || stage === null) {
    return res.status(400).json({ error: 'stage is required' });
  }
  try {
    const order = await getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const updated = { ...order, stage, status, updatedAt: new Date().toISOString() };
    await saveOrder(updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders/:id/received', async (req, res) => {
  try {
    const order = await getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.stage === 6) return res.json({ already: true, message: 'Already marked as received.' });
    const updated = { ...order, stage: 6, status: 'delivered', updatedAt: new Date().toISOString() };
    await saveOrder(updated);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/:id/quick-action', async (req, res) => {
  const { action, pw } = req.query;
  if (!process.env.ADMIN_PASSWORD || pw !== process.env.ADMIN_PASSWORD) {
    return res.status(401).send(actionPage('❌', 'Unauthorized', 'Invalid or missing password.', '#c0392b'));
  }
  try {
    const order = await getOrder(req.params.id);
    if (!order) return res.status(404).send(actionPage('🔍', 'Not Found', `Order ${req.params.id} does not exist.`, '#c0392b'));

    const ACTION_MAP = {
      accept:   { stage: 2, status: 'accepted',  emoji: '✅', label: 'Accepted' },
      reject:   { stage: 0, status: 'rejected',  emoji: '❌', label: 'Rejected' },
      ready:    { stage: 4, status: 'ready',      emoji: '📦', label: 'Ready for Pickup' },
      dispatch: { stage: 5, status: 'enroute',    emoji: '🚚', label: 'Out for Delivery' },
      delivered:{ stage: 6, status: 'delivered',  emoji: '🎉', label: 'Delivered' },
    };
    const entry = ACTION_MAP[action];
    if (!entry) return res.status(400).send(actionPage('⚠️', 'Unknown Action', `Action "${action}" is not valid.`, '#c0392b'));

    const updated = { ...order, stage: entry.stage, status: entry.status, updatedAt: new Date().toISOString() };
    await saveOrder(updated);
    res.send(actionPage(entry.emoji, entry.label, `Order ${req.params.id} has been marked as <strong>${entry.label}</strong>.`, '#0f3527'));
  } catch (err) {
    res.status(500).send(actionPage('⚠️', 'Error', err.message, '#c0392b'));
  }
});

function actionPage(icon, title, body, color) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Wagle & Co.</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#f6efd9;color:#0f3527;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.card{background:#fff;border-radius:18px;padding:40px 32px;text-align:center;max-width:360px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,.12)}
.icon{font-size:56px;margin-bottom:16px}.title{font-size:24px;font-weight:700;color:${color};margin-bottom:10px}
.body{font-size:15px;color:#555;line-height:1.6}.brand{margin-top:28px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#aaa}
</style></head><body><div class="card"><div class="icon">${icon}</div><div class="title">${title}</div>
<div class="body">${body}</div><div class="brand">Wagle Electricals &amp; General Suppliers · Damauli</div></div></body></html>`;
}

app.get('/api/admin/orders', async (req, res) => {
  const pw = req.query.adminPassword;
  if (!process.env.ADMIN_PASSWORD || pw !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const orders = await loadOrders();
    res.json(orders.sort((a, b) => new Date(b.placedAt) - new Date(a.placedAt)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/scan-estimate', async (req, res) => {
  if (!groq) {
    return res.status(503).json({ error: 'GROQ_API_KEY not configured in .env' });
  }

  const PROMPT = `This is a hardware or electrical materials estimate from Nepal.
Extract every line item and return ONLY a valid JSON array — no markdown, no explanation:
[{"raw":"original line text","item":"clean item name","qty":1,"unit":"pieces"}]
Rules:
- qty must be a positive integer (default 1 if not clear)
- unit: pieces / rolls / meters / sets / boxes etc.
- Keep original Nepali or English text in "raw"`;

  try {
    let messages;
    if (req.body.imageBase64) {
      const base64 = req.body.imageBase64;
      const mediaType = req.body.mimeType || 'image/jpeg';
      messages = [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
          { type: 'text', text: PROMPT },
        ],
      }];
    } else if (req.body.text) {
      messages = [{ role: 'user', content: `${PROMPT}\n\nEstimate text:\n${req.body.text}` }];
    } else {
      return res.status(400).json({ error: 'Provide an image file or text in the request body' });
    }

    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages,
      max_tokens: 1024,
      temperature: 0.1,
    });

    const raw = completion.choices[0].message.content.trim();
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return res.status(422).json({ error: 'Could not parse AI response', raw });
    res.json({ items: JSON.parse(match[0]) });
  } catch (err) {
    console.error('scan-estimate:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Static files — local dev only (Vercel serves these from CDN) ──────────────
if (!process.env.VERCEL) {
  const STATIC_DIR = path.join(__dirname, '..');
  app.use(express.static(STATIC_DIR, { index: 'index.html' }));
  app.get('/admin', (_req, res) => res.sendFile(path.join(STATIC_DIR, 'admin.html')));
  app.get('*', (_req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));
}

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));

// ── Start (local dev only) ────────────────────────────────────────────────────
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`\n🚀 Wagle backend    → http://localhost:${PORT}`);
    console.log(`   DB: ${db ? 'Firestore' : 'orders.json (local)'}`);
    if (!groq)                      console.warn('⚠️  GROQ_API_KEY not set');
    if (!process.env.ADMIN_PASSWORD) console.warn('⚠️  ADMIN_PASSWORD not set');
  });
}

export default app;
