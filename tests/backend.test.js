const { call, wompiEvent, sha256 } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');

const store = require('../api/store');
const checkout = require('../api/checkout');
const webhook = require('../api/wompi-webhook');
const admin = require('../api/admin');
const { query } = require('../api/_lib/db');

/* Fixed exchange rate, so every peso figure below is deterministic:
   toCop(usd) = round(usd * 4000 * 1.02 / 100) * 100 */
const TRM = 4000;

let cookie = '';
const asAdmin = (extra = {}) => ({ headers: { cookie, ...(extra.headers || {}) }, ...extra });
const adminGet = (a, query = {}) => call(admin, { query: { a, ...query }, headers: { cookie } });
const adminPost = (a, body) => call(admin, { method: 'POST', query: { a }, body, headers: { cookie } });

const CUSTOMER = { name: 'Ana Pérez', email: 'ana@example.com', phone: '3001234567' };
const CO_SHIP = { country: 'CO', address: 'Calle 1 # 2-3', city: 'Medellín', region: 'Antioquia' };
const US_SHIP = { country: 'US', address: '1 Main St', city: 'Austin', region: 'TX', postal: '78701' };

const CO_ITEM = [{ name: 'BPC-157', size: '10mg', qty: 1 }];          // COP 664,000, pinned
const US_ITEM = [{ name: 'GHK-Cu', size: '50mg', qty: 2 }];            // USD 50 each, on the US shelf

test.before(async () => {
  const login = await call(admin, { method: 'POST', query: { a: 'login' }, body: { password: process.env.ADMIN_PASSWORD } });
  assert.equal(login.status, 200);
  cookie = login.headers['Set-Cookie'].split(';')[0];
  const set = await adminPost('settings_set', { trm_override: TRM });
  assert.equal(set.status, 200);
});

/* ------------------------------------------------------------ admin auth */

test('admin: endpoints refuse a request with no session', async () => {
  for (const a of ['products', 'affiliates', 'orders', 'settings']) {
    assert.equal((await call(admin, { query: { a } })).status, 401, a);
  }
});

test('admin: a forged session cookie is rejected', async () => {
  const r = await call(admin, { query: { a: 'products' }, headers: { cookie: `ascent_admin=${Date.now() + 99999999}.deadbeef` } });
  assert.equal(r.status, 401);
});

test('admin: wrong password is refused, and the sixth-plus misses lock the address out', async () => {
  const ip = { 'x-forwarded-for': '9.9.9.9' };
  for (let i = 0; i < 8; i++) {
    const r = await call(admin, { method: 'POST', query: { a: 'login' }, body: { password: 'nope' }, headers: ip });
    assert.equal(r.status, 401);
  }
  const locked = await call(admin, { method: 'POST', query: { a: 'login' }, body: { password: process.env.ADMIN_PASSWORD }, headers: ip });
  assert.equal(locked.status, 429, 'even the right password is refused while locked');
  // another address is unaffected
  const other = await call(admin, { method: 'POST', query: { a: 'login' }, body: { password: process.env.ADMIN_PASSWORD }, headers: { 'x-forwarded-for': '8.8.8.8' } });
  assert.equal(other.status, 200);
});

test('admin: a cross-origin POST is rejected', async () => {
  const r = await call(admin, { method: 'POST', query: { a: 'stock_set' }, body: {}, headers: { cookie, origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
});

test('admin: session cookie is HttpOnly and SameSite=Strict', async () => {
  const r = await call(admin, { method: 'POST', query: { a: 'login' }, body: { password: process.env.ADMIN_PASSWORD }, headers: { 'x-forwarded-proto': 'https' } });
  const c = r.headers['Set-Cookie'];
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Strict/);
  assert.match(c, /Secure/);
});

/* -------------------------------------------------------------- pricing */

test('quote: a Colombian order is priced from the pinned peso list', async () => {
  const r = await call(store, { method: 'POST', query: { a: 'quote' }, body: { market: 'CO', items: CO_ITEM } });
  assert.equal(r.status, 200);
  assert.equal(r.json.currency, 'COP');
  assert.equal(r.json.subtotal, 664000);
  assert.equal(r.json.total, 664000);
  assert.equal(r.json.chargeCop, 664000);
});

test('quote: a US order is priced in USD and charged in pesos at TRM * 1.02', async () => {
  const r = await call(store, { method: 'POST', query: { a: 'quote' }, body: { market: 'US', items: US_ITEM } });
  assert.equal(r.status, 200);
  assert.equal(r.json.currency, 'USD');
  assert.equal(r.json.total, 100);
  assert.equal(r.json.chargeCop, 408000);       // round(100 * 4000 * 1.02 / 100) * 100
});

test('quote: prices, totals and discounts sent by the browser are ignored', async () => {
  const r = await call(store, {
    method: 'POST', query: { a: 'quote' },
    body: { market: 'CO', price: 1, total: 1, discountPct: 99, items: [{ name: 'BPC-157', size: '10mg', qty: 1, price: 1, unit: 1, line: 1 }] },
  });
  assert.equal(r.json.total, 664000);
  assert.equal(r.json.discountPct, 0);
});

test('quote: rejects unknown products, bad quantities and empty orders', async () => {
  const q = items => call(store, { method: 'POST', query: { a: 'quote' }, body: { market: 'CO', items } });
  assert.equal((await q([{ name: 'Nope', size: '1mg', qty: 1 }])).json.error, 'bad_line');
  assert.equal((await q([{ name: 'BPC-157', size: '10mg', qty: 0 }])).json.error, 'bad_line');
  assert.equal((await q([{ name: 'BPC-157', size: '10mg', qty: 1.5 }])).json.error, 'bad_line');
  assert.equal((await q([{ name: 'BPC-157', size: '10mg', qty: 100 }])).json.error, 'bad_line');
  assert.equal((await q([])).json.error, 'empty_order');
  assert.equal((await call(store, { method: 'POST', query: { a: 'quote' }, body: { market: 'ZZ', items: CO_ITEM } })).json.error, 'bad_market');
});

test('quote: a product the market does not carry is refused with the reason', async () => {
  const r = await call(store, { method: 'POST', query: { a: 'quote' }, body: { market: 'CO', items: [{ name: 'Tesamorelin', size: '5mg', qty: 1 }] } });
  assert.equal(r.status, 409);
  assert.equal(r.json.detail[0].reason, 'not_carried');
});

test('quote: a product off the static shelf is refused', async () => {
  // BPC-157 10mg is not on the US shelf
  const r = await call(store, { method: 'POST', query: { a: 'quote' }, body: { market: 'US', items: [{ name: 'BPC-157', size: '10mg', qty: 1 }] } });
  assert.equal(r.status, 409);
  assert.equal(r.json.detail[0].reason, 'out_of_stock');
});

/* ---------------------------------------------------------------- stock */

test('stock: switching a product off stops it being sold, and back on restores it', async () => {
  const off = await adminPost('stock_set', { key: 'BPC-157|10mg', available: false });
  assert.equal(off.status, 200);

  assert.deepEqual((await call(store, { query: { a: 'stock' } })).json.off, ['BPC-157|10mg']);
  const blocked = await call(store, { method: 'POST', query: { a: 'quote' }, body: { market: 'CO', items: CO_ITEM } });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.json.detail[0].reason, 'out_of_stock');

  const on = await adminPost('stock_set', { key: 'BPC-157|10mg', available: true });
  assert.equal(on.status, 200);
  assert.deepEqual((await call(store, { query: { a: 'stock' } })).json.off, []);
  assert.equal((await call(store, { method: 'POST', query: { a: 'quote' }, body: { market: 'CO', items: CO_ITEM } })).status, 200);
});

test('stock: refuses keys that are not in the catalogue', async () => {
  assert.equal((await adminPost('stock_set', { key: 'Fake|1mg', available: false })).status, 400);
  assert.equal((await adminPost('stock_set', { key: 'BPC-157|10mg', available: 'no' })).status, 400);
});

test('stock: the public list is cacheable for seconds, not minutes', async () => {
  const r = await call(store, { query: { a: 'stock' } });
  assert.match(r.headers['Cache-Control'], /s-maxage=10/);
});

/* ---------------------------------------------------------- affiliate codes */

let codeId;

test('codes: create, reject duplicates and bad values', async () => {
  const ok = await adminPost('code_save', { code: 'maria10', affiliate_name: 'María Gómez', affiliate_contact: '@maria', discount_pct: 10, commission_mode: 'fixed', commission_pct: 20 });
  assert.equal(ok.status, 200);
  codeId = ok.json.id;
  assert.equal((await adminPost('code_save', { code: 'MARIA10', affiliate_name: 'Otra', discount_pct: 5, commission_pct: 5 })).status, 409);
  assert.equal((await adminPost('code_save', { code: 'x', affiliate_name: 'A', discount_pct: 5, commission_pct: 5 })).json.error, 'bad_code');
  assert.equal((await adminPost('code_save', { code: 'OKCODE', affiliate_name: 'A', discount_pct: 101, commission_pct: 5 })).json.error, 'bad_discount');
  assert.equal((await adminPost('code_save', { code: 'OKCODE', affiliate_name: 'A', discount_pct: 5, commission_pct: -1 })).json.error, 'bad_commission');
});

test('quote: a code applies its discount (case and spacing insensitive)', async () => {
  const r = await call(store, { method: 'POST', query: { a: 'quote' }, body: { market: 'CO', items: CO_ITEM, code: ' maria10 ' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.code, 'MARIA10');
  assert.equal(r.json.discount, 66400);
  assert.equal(r.json.total, 597600);
  assert.equal(r.json.chargeCop, 597600);
});

test('quote: the public quote never reveals commission or the affiliate', async () => {
  const r = await call(store, { method: 'POST', query: { a: 'quote' }, body: { market: 'CO', items: CO_ITEM, code: 'MARIA10' } });
  const text = JSON.stringify(r.json);
  assert.doesNotMatch(text, /commission/i);
  assert.doesNotMatch(text, /María|Gómez|affiliate/i);
});

test('quote: an unknown or inactive code is refused rather than ignored', async () => {
  const unknown = await call(store, { method: 'POST', query: { a: 'quote' }, body: { market: 'CO', items: CO_ITEM, code: 'NOSUCH' } });
  assert.equal(unknown.json.error, 'invalid_code');
  await adminPost('code_save', { id: codeId, code: 'MARIA10', affiliate_name: 'María Gómez', discount_pct: 10, commission_pct: 20, active: false });
  const inactive = await call(store, { method: 'POST', query: { a: 'quote' }, body: { market: 'CO', items: CO_ITEM, code: 'MARIA10' } });
  assert.equal(inactive.json.error, 'invalid_code');
  await adminPost('code_save', { id: codeId, code: 'MARIA10', affiliate_name: 'María Gómez', discount_pct: 10, commission_pct: 20, active: true });
});

/* -------------------------------------------------------------- checkout */

const checkoutBody = (over = {}) => ({ market: 'CO', items: CO_ITEM, code: 'MARIA10', ack: true, customer: CUSTOMER, shipping: CO_SHIP, ...over });
let ref;

test('checkout: creates a pending order with the full breakdown and a signed Wompi URL', async () => {
  const r = await call(checkout, { method: 'POST', body: checkoutBody() });
  assert.equal(r.status, 200);
  ref = r.json.reference;
  assert.match(ref, /^ASC-/);

  const url = new URL(r.json.url);
  assert.equal(url.origin + url.pathname, 'https://checkout.wompi.co/p/');
  const p = url.searchParams;
  assert.equal(p.get('amount-in-cents'), String(597600 * 100));
  assert.equal(p.get('currency'), 'COP');
  assert.equal(p.get('reference'), ref);
  assert.equal(p.get('redirect-url'), `https://shop.example/order?ref=${ref}`);
  // the integrity signature is exactly sha256(reference + cents + currency + secret)
  assert.equal(p.get('signature:integrity'), sha256(`${ref}${597600 * 100}COP${process.env.WOMPI_INTEGRITY_SECRET}`));
  assert.doesNotMatch(r.json.url, /test_integrity_secret/, 'the secret itself must never appear in the URL');

  const [o] = await query('SELECT * FROM orders WHERE reference = $1', [ref]);
  assert.equal(o.status, 'PENDING');
  assert.equal(Number(o.subtotal_cop), 664000);
  assert.equal(Number(o.discount_cop), 66400);
  assert.equal(Number(o.charge_cop), 597600);
  assert.equal(Number(o.commission_cop), 0, 'commission is worked out per month, not stored on the order');
  assert.equal(o.code_text, 'MARIA10');
});

test('checkout: refuses a missing acknowledgement, bad fields and a country that is not the market', async () => {
  const noAck = await call(checkout, { method: 'POST', body: checkoutBody({ ack: false }) });
  assert.equal(noAck.status, 400);
  assert.ok(noAck.json.fields.includes('ack'));

  const badEmail = await call(checkout, { method: 'POST', body: checkoutBody({ customer: { ...CUSTOMER, email: 'not-an-email' } }) });
  assert.ok(badEmail.json.fields.includes('email'));

  // Colombian prices shipped to a US address
  const wrongCountry = await call(checkout, { method: 'POST', body: checkoutBody({ shipping: US_SHIP }) });
  assert.equal(wrongCountry.status, 400);
  assert.ok(wrongCountry.json.fields.includes('country'));
});

test('checkout: a US order is recorded in dollars and charged in pesos', async () => {
  const r = await call(checkout, { method: 'POST', body: { market: 'US', items: US_ITEM, code: 'MARIA10', ack: true, customer: CUSTOMER, shipping: US_SHIP } });
  assert.equal(r.status, 200);
  const [o] = await query('SELECT * FROM orders WHERE reference = $1', [r.json.reference]);
  assert.equal(o.currency, 'USD');
  assert.equal(Number(o.total_local), 90);            // $100 less 10%
  assert.equal(Number(o.charge_cop), 367200);         // toCop(90)
  assert.equal(Number(o.subtotal_cop), 408000);       // toCop(100)
  assert.equal(Number(o.discount_cop), 40800);        // exactly subtotal - charge
  assert.equal(Number(o.trm), TRM);
});

test('checkout: an out-of-stock product cannot be bought even though the page was loaded before the switch', async () => {
  await adminPost('stock_set', { key: 'BPC-157|10mg', available: false });
  const r = await call(checkout, { method: 'POST', body: checkoutBody() });
  assert.equal(r.status, 409);
  await adminPost('stock_set', { key: 'BPC-157|10mg', available: true });
});

test('checkout: refuses to run when payments are not configured', async () => {
  const keep = process.env.WOMPI_INTEGRITY_SECRET;
  delete process.env.WOMPI_INTEGRITY_SECRET;
  const r = await call(checkout, { method: 'POST', body: checkoutBody() });
  process.env.WOMPI_INTEGRITY_SECRET = keep;
  assert.equal(r.status, 503);
  assert.equal(r.json.error, 'payments_unavailable');
});

/* -------------------------------------------------------------- webhook */

const status = async reference => (await query('SELECT status FROM orders WHERE reference = $1', [reference]))[0].status;

test('webhook: a forged or unsigned event cannot mark an order paid', async () => {
  const forged = wompiEvent({ reference: ref, amountInCents: 59760000, secret: 'attacker-guess' });
  assert.equal((await call(webhook, { method: 'POST', body: forged })).status, 401);
  const noSig = { event: 'transaction.updated', data: { transaction: { id: 'x', status: 'APPROVED', reference: ref, amount_in_cents: 59760000, currency: 'COP' } } };
  assert.equal((await call(webhook, { method: 'POST', body: noSig })).status, 401);
  assert.equal(await status(ref), 'PENDING');
});

test('webhook: an approval for the wrong amount is parked for review, never counted as a sale', async () => {
  const short = wompiEvent({ id: 'tx-short', reference: ref, amountInCents: 100 });
  assert.equal((await call(webhook, { method: 'POST', body: short })).status, 200);
  assert.equal(await status(ref), 'REVIEW');
  const [o] = await query('SELECT paid_at FROM orders WHERE reference = $1', [ref]);
  assert.equal(o.paid_at, null);
});

test('webhook: a genuine approval marks the order paid and is safe to replay', async () => {
  const ev = wompiEvent({ id: 'tx-ok', reference: ref, amountInCents: 59760000 });
  assert.equal((await call(webhook, { method: 'POST', body: ev })).status, 200);
  assert.equal(await status(ref), 'APPROVED');
  const [first] = await query('SELECT paid_at, wompi_tx_id FROM orders WHERE reference = $1', [ref]);
  assert.ok(first.paid_at);
  assert.equal(first.wompi_tx_id, 'tx-ok');

  await call(webhook, { method: 'POST', body: ev });   // Wompi retries
  const [second] = await query('SELECT paid_at FROM orders WHERE reference = $1', [ref]);
  assert.deepEqual(second.paid_at, first.paid_at, 'a replay must not move the paid timestamp');
});

test('webhook: a late DECLINED after an approval does not undo the sale', async () => {
  await call(webhook, { method: 'POST', body: wompiEvent({ id: 'tx-late', status: 'DECLINED', reference: ref, amountInCents: 59760000 }) });
  assert.equal(await status(ref), 'APPROVED');
});

test('webhook: an event for an unknown reference answers 200 so Wompi stops retrying', async () => {
  const r = await call(webhook, { method: 'POST', body: wompiEvent({ reference: 'ASC-UNKNOWN-0000', amountInCents: 100 }) });
  assert.equal(r.status, 200);
});

test('order page: reports state from the database, with no personal data', async () => {
  const r = await call(store, { query: { a: 'order', ref } });
  assert.equal(r.json.state, 'approved');
  assert.doesNotMatch(JSON.stringify(r.json), /ana@example|Pérez|Calle/);
  assert.equal((await call(store, { query: { a: 'order', ref: 'garbage' } })).status, 400);
  assert.equal((await call(store, { query: { a: 'order', ref: 'ASC-NOPE-NOPE-1' } })).status, 404);
});

/* ------------------------------------------------- affiliate report / payout */

test('report: counts customers and money by code, from paid orders only', async () => {
  // a second paid order from the SAME customer, and one pending order from another
  const second = await call(checkout, { method: 'POST', body: checkoutBody() });
  await call(webhook, { method: 'POST', body: wompiEvent({ id: 'tx-2', reference: second.json.reference, amountInCents: 59760000 }) });
  await call(checkout, { method: 'POST', body: checkoutBody({ customer: { ...CUSTOMER, email: 'pedro@example.com' } }) });   // never paid

  const { json } = await adminGet('affiliates');
  const maria = json.affiliates.find(x => x.code === 'MARIA10');
  assert.equal(maria.orders_paid, 2);
  assert.equal(maria.customers_paid, 1, 'one distinct paying customer');
  assert.ok(maria.orders_started >= 3, 'the unpaid attempt is visible as started');
  assert.equal(Number(maria.sales_cop), 597600 * 2);
  // MARIA10 is on a flat 20%, so that is the rate on this month's sales
  assert.equal(maria.current.sales_cop, 597600 * 2);
  assert.equal(maria.current.rate_pct, 20);
  assert.equal(maria.current.commission_cop, 239040);
  assert.equal(maria.paid_cop, 0);
  assert.equal(maria.owed_cop, 0, 'the current month is still open, so nothing is owed yet');
});

test('orders: the admin sees the breakdown, and totals count paid orders only', async () => {
  const r = await adminGet('orders', { code_id: String(codeId) });
  assert.equal(r.status, 200);
  const paid = r.json.rows.find(o => o.status === 'APPROVED');
  assert.equal(Number(paid.subtotal_cop), 664000);
  assert.equal(Number(paid.discount_cop), 66400);
  assert.equal(Number(paid.charge_cop), 597600);
  assert.equal(Number(paid.commission_cop), 119520);
  assert.equal(paid.affiliate_name, 'María Gómez');
  assert.equal(Number(r.json.paid.charge_cop), 597600 * 2);
  assert.equal(Number(r.json.paid.commission_cop), 119520 * 2);
});

test('payout: the current month is still open and cannot be paid out', async () => {
  const month = (await adminGet('statement', { code_id: String(codeId) })).json.now;
  const r = await adminPost('pay_month', { code_id: codeId, month });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'month_open');
});

test('codes: a code with history cannot be deleted, only deactivated', async () => {
  assert.equal((await adminPost('code_delete', { id: codeId })).status, 409);
  const fresh = await adminPost('code_save', { code: 'UNUSED5', affiliate_name: 'Nadie', discount_pct: 5, commission_pct: 5 });
  assert.equal((await adminPost('code_delete', { id: fresh.json.id })).status, 200);
});

test('csv: spreadsheet formulas in customer-controlled fields are neutralised', async () => {
  await call(checkout, { method: 'POST', body: checkoutBody({ code: '', customer: { ...CUSTOMER, name: '=HYPERLINK("http://evil","x")', email: 'csv@example.com' } }) });
  const r = await adminGet('orders_csv');
  assert.equal(r.status, 200);
  assert.match(r.headers['Content-Type'], /text\/csv/);
  assert.match(r.text, /"'=HYPERLINK/);
  assert.doesNotMatch(r.text, /(^|,)=HYPERLINK/m);
});

test('settings: the exchange rate can be pinned and is range-checked', async () => {
  assert.equal((await adminPost('settings_set', { trm_override: 5 })).json.error, 'bad_rate');
  const s = await adminGet('settings');
  assert.equal(s.json.trm.rate, TRM);
  assert.equal(s.json.trm.source, 'pinned');
});
