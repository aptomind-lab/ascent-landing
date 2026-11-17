/* ===========================================================================
   Pricing: the only code that decides what an order costs.

   The browser sends WHAT it wants (market, name, size, quantity, a code) and
   never a price. Everything that becomes money is worked out here from the
   catalogue, the stock switches and the discount codes in the database. A
   tampered request can therefore ask for something the server refuses, but it
   cannot name its own price.

   quote() is read-only and is what the checkout page shows the buyer. The same
   function runs again inside checkout, so the number a buyer sees and the
   number that is charged come from one place.
   =========================================================================== */

const { query } = require('./db');
const catalog = require('./catalog');
const { getTrm, makeToCop } = require('./fx');

const MAX_LINES = 40;
const MAX_QTY = 99;
const MIN_CHARGE_COP = 1500;   // below this a card payment is not worth creating
const CODE_RE = /^[A-Z0-9_-]{3,32}$/;

class QuoteError extends Error {
  constructor(error, detail) { super(error); this.error = error; this.detail = detail; }
}

const round = (n, dec) => { const f = 10 ** dec; return Math.round(n * f) / f; };
const decimals = currency => (currency === 'COP' ? 0 : 2);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function normalizeCode(raw) {
  const code = str(raw, 64).toUpperCase().replace(/\s+/g, '');
  if (!code) return '';
  if (!CODE_RE.test(code)) throw new QuoteError('invalid_code');
  return code;
}

function normalizeItems(raw) {
  if (!Array.isArray(raw) || !raw.length) throw new QuoteError('empty_order');
  if (raw.length > MAX_LINES) throw new QuoteError('too_many_lines');
  const merged = new Map();
  for (const line of raw) {
    const name = str(line && line.name, 80);
    const size = str(line && line.size, 40);
    const qty = Number(line && line.qty);
    if (!name || !size || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      throw new QuoteError('bad_line', { name, size });
    }
    const k = catalog.key(name, size);
    const prior = merged.get(k);
    const total = (prior ? prior.qty : 0) + qty;
    if (total > MAX_QTY) throw new QuoteError('bad_line', { name, size });
    merged.set(k, { name, size, qty: total });
  }
  return [...merged.values()];
}

async function disabledKeys() {
  const rows = await query('SELECT key FROM stock_off');
  return new Set(rows.map(r => r.key));
}

async function findCode(code) {
  if (!code) return null;
  const rows = await query(
    'SELECT id, code, affiliate_name, discount_pct, commission_pct, active FROM codes WHERE code = $1',
    [code]
  );
  if (!rows.length || !rows[0].active) throw new QuoteError('invalid_code');
  return rows[0];
}

/* input:  { market, items: [{name,size,qty}], code? }
   output: a quote object, or throws QuoteError(error, detail). */
async function quote(input) {
  const market = str(input && input.market, 4).toUpperCase();
  if (!catalog.isMarket(market)) throw new QuoteError('bad_market');
  const currency = catalog.MARKETS[market].currency;
  const dec = decimals(currency);

  const items = normalizeItems(input.items);
  const code = normalizeCode(input.code);

  // availability: market range, static shelf, then the admin's switches
  const off = await disabledKeys();
  const unavailable = [];
  for (const it of items) {
    if (!catalog.find(it.name, it.size)) throw new QuoteError('bad_line', { name: it.name, size: it.size });
    const k = catalog.key(it.name, it.size);
    if (!catalog.carries(market, it.name, it.size)) unavailable.push({ ...it, reason: 'not_carried' });
    else if (!catalog.onShelf(market, it.name, it.size) || off.has(k)) unavailable.push({ ...it, reason: 'out_of_stock' });
  }
  if (unavailable.length) throw new QuoteError('unavailable', unavailable);

  const { rate, source } = await getTrm();
  const toCop = makeToCop(rate);

  const lines = items.map(it => {
    const unit = catalog.unitPrice(market, it.name, it.size, toCop);
    return { name: it.name, size: it.size, qty: it.qty, unit: round(unit, dec), line: round(unit * it.qty, dec) };
  });
  const subtotal = round(lines.reduce((s, l) => s + l.line, 0), dec);

  const codeRow = await findCode(code);
  const discountPct = codeRow ? Number(codeRow.discount_pct) : 0;
  const discount = round(subtotal * discountPct / 100, dec);
  const total = round(subtotal - discount, dec);

  // pesos: the money that actually moves. A peso market is already in pesos.
  const inPesos = currency === 'COP';
  const subtotalCop = inPesos ? subtotal : toCop(subtotal);
  const chargeCop = inPesos ? total : toCop(total);
  const discountCop = subtotalCop - chargeCop;
  if (chargeCop < MIN_CHARGE_COP) throw new QuoteError('below_minimum');

  return {
    market, currency,
    lines,
    subtotal, discountPct, discount, total,
    subtotalCop, discountCop, chargeCop,
    trm: inPesos ? null : rate, trmSource: source,
    code: codeRow ? { id: codeRow.id, code: codeRow.code } : null,
  };
}

/* What the public may see: no commission, no affiliate, no internal ids. */
function publicQuote(q) {
  return {
    market: q.market, currency: q.currency,
    lines: q.lines,
    subtotal: q.subtotal, discountPct: q.discountPct, discount: q.discount, total: q.total,
    chargeCop: q.chargeCop,
    code: q.code ? q.code.code : null,
  };
}

module.exports = { quote, publicQuote, QuoteError, normalizeCode };
