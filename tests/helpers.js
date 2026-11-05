/* Test helpers: environment, and a way to call a Vercel-style handler without a server. */

process.env.ASCENT_TEST_DB = 'pglite';
process.env.ADMIN_PASSWORD = 'correct-horse-battery-staple';
process.env.WOMPI_PUBLIC_KEY = 'pub_test_abc123';
process.env.WOMPI_INTEGRITY_SECRET = 'test_integrity_secret';
process.env.WOMPI_EVENTS_SECRET = 'test_events_secret';
process.env.SITE_URL = 'https://shop.example';
delete process.env.DATABASE_URL;

const crypto = require('crypto');

function fakeRes() {
  return {
    headers: {}, code: 200, payload: '', headersSent: false,
    status(c) { this.code = c; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    send(b) { this.payload = b; this.headersSent = true; return this; },
  };
}

async function call(handler, { method = 'GET', query = {}, body, headers = {} } = {}) {
  const res = fakeRes();
  await handler({ method, query, body, headers: { host: 'localhost', ...headers }, url: '/test' }, res);
  let json = null;
  try { json = JSON.parse(res.payload); } catch (e) { /* not JSON (CSV) */ }
  return { status: res.code, headers: res.headers, json, text: res.payload };
}

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

/* A webhook event signed the way Wompi signs it. */
function wompiEvent({ id = 'tx-1', status = 'APPROVED', reference, amountInCents, currency = 'COP', secret } = {}) {
  const timestamp = 1700000000;
  const checksum = sha256(`${id}${status}${amountInCents}${timestamp}${secret || process.env.WOMPI_EVENTS_SECRET}`);
  return {
    event: 'transaction.updated',
    data: { transaction: { id, status, reference, amount_in_cents: amountInCents, currency } },
    signature: { properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'], checksum },
    timestamp,
    sent_at: '2026-11-04T00:00:00.000Z',
  };
}

module.exports = { call, wompiEvent, sha256 };
