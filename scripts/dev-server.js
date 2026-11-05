#!/usr/bin/env node
/* ===========================================================================
   Local development server.   npm run dev   ->   http://127.0.0.1:4180

   Serves the static site and mounts every function in api/ the way Vercel
   does, backed by an IN-MEMORY Postgres (it forgets everything on restart), so
   the whole backend can be exercised with no accounts and no credentials.

   It also stands in for Wompi: with ASCENT_DEV the checkout URL points at a
   local page with a "Pay" button that sends the same SIGNED event Wompi would,
   so the full path (cart -> code -> pay -> webhook -> paid order -> commission)
   can be walked through by hand. Nothing here ships to production: Vercel only
   runs api/ and never loads scripts/.
   =========================================================================== */

process.env.ASCENT_TEST_DB = 'pglite';
process.env.ASCENT_DEV = '1';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'dev-password-123';
process.env.WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || 'pub_test_localdev';
process.env.WOMPI_INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET || 'dev_integrity_secret';
process.env.WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET || 'dev_events_secret';
delete process.env.DATABASE_URL;

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 4180;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

// simple (non-pattern) rewrites from vercel.json, so /checkout, /admin etc. behave as in production
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const REWRITES = new Map((vercel.rewrites || []).filter(r => !/[:*(]/.test(r.source)).map(r => [r.source, r.destination]));

// response headers from vercel.json (exact paths), so the admin's Content-Security-Policy is tested locally too
const HEADERS = new Map((vercel.headers || []).filter(h => !/[:*(]/.test(h.source)).map(h => [h.source, h.headers]));

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

function wrap(res) {
  res.status = c => { res.statusCode = c; return res; };
  res.send = b => { res.end(b); return res; };
  return res;
}

function readBody(req) {
  return new Promise(resolve => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (/json/.test(req.headers['content-type'] || '') && raw) { try { return resolve(JSON.parse(raw)); } catch (e) { return resolve(undefined); } }
      resolve(raw || undefined);
    });
  });
}

async function runApi(name, req, res, url) {
  if (name.startsWith('_') || name.includes('/') || !fs.existsSync(path.join(ROOT, 'api', `${name}.js`))) {
    res.statusCode = 404; return res.end('not found');
  }
  req.query = Object.fromEntries(url.searchParams);
  req.body = await readBody(req);
  wrap(res);
  // let the local "Wompi" take over the checkout URL
  if (name === 'checkout') {
    const send = res.send;
    res.send = b => send(String(b).replace('https://checkout.wompi.co/p/', '/__dev/wompi'));
  }
  delete require.cache[require.resolve(path.join(ROOT, 'api', `${name}.js`))];
  return require(path.join(ROOT, 'api', `${name}.js`))(req, res);
}

/* The page a buyer would see at Wompi, reduced to its essentials. */
function fakeWompiPage(url) {
  const q = Object.fromEntries(url.searchParams);
  const cents = Number(q['amount-in-cents']);
  const sig = sha256(`${q.reference}${q['amount-in-cents']}${q.currency}${process.env.WOMPI_INTEGRITY_SECRET}`);
  const ok = sig === q['signature:integrity'];
  const e = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html><meta charset=utf-8><title>Wompi (simulado)</title>
<body style="font:16px system-ui;max-width:460px;margin:60px auto;padding:0 20px">
<h2>Wompi · simulación local</h2>
<p>Referencia <b>${e(q.reference)}</b></p>
<p>Monto <b>COP ${(cents / 100).toLocaleString('es-CO')}</b></p>
<p>Firma de integridad: <b style="color:${ok ? '#1f7a4d' : '#b3261e'}">${ok ? 'válida' : 'INVÁLIDA'}</b></p>
<form method="post" action="/__dev/wompi-pay"><input type="hidden" name="ref" value="${e(q.reference)}"><input type="hidden" name="cents" value="${cents}">
<input type="hidden" name="back" value="${e(q['redirect-url'] || '/')}">
<button name="result" value="APPROVED" style="padding:10px 16px">Pagar (aprobado)</button>
<button name="result" value="DECLINED" style="padding:10px 16px">Rechazar</button></form></body>`;
}

async function fakeWompiPay(req, res) {
  const raw = await new Promise(r => { let b = ''; req.on('data', c => (b += c)); req.on('end', () => r(b)); });
  const f = Object.fromEntries(new URLSearchParams(raw));
  const status = f.result === 'DECLINED' ? 'DECLINED' : 'APPROVED';
  const id = `dev-tx-${Date.now()}`;
  const ts = Math.floor(Date.now() / 1000);
  const event = {
    event: 'transaction.updated',
    data: { transaction: { id, status, reference: f.ref, amount_in_cents: Number(f.cents), currency: 'COP' } },
    signature: { properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
      checksum: sha256(`${id}${status}${f.cents}${ts}${process.env.WOMPI_EVENTS_SECRET}`) },
    timestamp: ts,
  };
  // Wompi's webhook arrives a moment after the redirect; mimic that so the order page's polling is exercised
  setTimeout(async () => {
    const handler = require(path.join(ROOT, 'api', 'wompi-webhook.js'));
    const fakeRes = wrap({ setHeader() {}, end() {}, headersSent: false });
    await handler({ method: 'POST', headers: {}, body: event, query: {}, url: '/api/wompi-webhook' }, fakeRes);
  }, 2500);
  const back = f.back ? new URL(f.back, `http://127.0.0.1:${PORT}`) : new URL('/', `http://127.0.0.1:${PORT}`);
  back.searchParams.set('id', id);
  res.writeHead(303, { Location: back.pathname + back.search });
  res.end();
}

function serveStatic(url, res) {
  let p = decodeURIComponent(url.pathname);
  p = REWRITES.get(p) || p;
  let file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.statusCode = 403; return res.end('forbidden'); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(file).pipe(res);
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/__dev/wompi') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(fakeWompiPage(url)); }
    if (url.pathname === '/__dev/wompi-pay' && req.method === 'POST') return await fakeWompiPay(req, res);
    if (url.pathname.startsWith('/api/')) return await runApi(url.pathname.slice(5), req, res, url);
    for (const h of HEADERS.get(url.pathname) || []) res.setHeader(h.key, h.value);
    serveStatic(url, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) { res.statusCode = 500; res.end('dev server error'); }
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Ascent dev server   http://127.0.0.1:${PORT}`);
  console.log(`  Admin panel         http://127.0.0.1:${PORT}/admin   (password: ${process.env.ADMIN_PASSWORD})`);
  console.log('  Database: in memory, reset on every restart. Wompi: simulated locally.');
  if (process.env.ASCENT_DEMO !== '0') {
    seedDemo().then(
      () => console.log('  Demo data loaded (codes MARIA10, CARLOS15; sample orders). Start with ASCENT_DEMO=0 for an empty database.\n'),
      e => console.error('  Demo data failed:', e)
    );
  }
});

/* Sample data so the admin panel is not empty on first look. Goes through the
   same code paths as real traffic (quote -> createOrder -> a signed-style
   transaction), so what appears is what production would produce. */
async function seedDemo() {
  const { query } = require('../api/_lib/db');
  const { quote } = require('../api/_lib/pricing');
  const { createOrder, applyTransaction } = require('../api/_lib/orders');

  await query("INSERT INTO settings (key, value) VALUES ('trm_override', '4000') ON CONFLICT (key) DO NOTHING");
  await query(`INSERT INTO codes (code, affiliate_name, affiliate_contact, discount_pct, commission_pct) VALUES
    ('MARIA10', 'María Gómez', '@maria.fit', 10, 20),
    ('CARLOS15', 'Carlos Ruiz', 'carlos@example.com', 15, 10)
    ON CONFLICT (code) DO NOTHING`);
  await query("INSERT INTO stock_off (key) VALUES ('BPC-157|10mg') ON CONFLICT (key) DO NOTHING");

  const co = { country: 'CO', address: 'Carrera 43A # 1-50', city: 'Medellín', region: 'Antioquia' };
  const us = { country: 'US', address: '1 Main St', city: 'Austin', region: 'TX', postal: '78701' };
  const person = (name, email) => ({ name, email, phone: '3001234567' });
  const sample = [
    { m: 'CO', items: [{ name: 'BPC-157', size: '40mg', qty: 1 }], code: 'MARIA10', who: person('Laura Restrepo', 'laura@example.com'), ship: co, status: 'APPROVED' },
    { m: 'CO', items: [{ name: 'Retatrutide', size: '10mg', qty: 2 }], code: 'MARIA10', who: person('Andrés Mejía', 'andres@example.com'), ship: co, status: 'APPROVED' },
    { m: 'CO', items: [{ name: 'Retatrutide', size: '30mg', qty: 1 }], code: 'CARLOS15', who: person('Sofía Herrera', 'sofia@example.com'), ship: co, status: 'APPROVED' },
    { m: 'US', items: [{ name: 'GHK-Cu', size: '50mg', qty: 2 }], code: 'CARLOS15', who: person('Jake Miller', 'jake@example.com'), ship: us, status: 'APPROVED' },
    { m: 'CO', items: [{ name: 'KLOWUP', size: '80mg', qty: 1 }], code: 'MARIA10', who: person('Pedro Gil', 'pedro@example.com'), ship: co, status: 'PENDING' },
    { m: 'CO', items: [{ name: 'KLOWUP', size: '80mg', qty: 1 }], code: '', who: person('Camila Torres', 'camila@example.com'), ship: co, status: 'APPROVED' },
    { m: 'CO', items: [{ name: 'BPC-157', size: '40mg', qty: 1 }], code: 'CARLOS15', who: person('Daniel Ortiz', 'daniel@example.com'), ship: co, status: 'DECLINED' },
  ];
  let n = 0;
  for (const s of sample) {
    const q = await quote({ market: s.m, items: s.items, code: s.code });
    const reference = await createOrder(q, s.who, s.ship);
    if (s.status !== 'PENDING') {
      await applyTransaction({ id: `demo-tx-${++n}`, status: s.status, reference, amount_in_cents: q.chargeCop * 100, currency: 'COP' });
    }
  }
}
