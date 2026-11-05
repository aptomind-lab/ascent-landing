/* ===========================================================================
   POST /api/checkout

   Takes what the buyer typed, prices it on the server, records the order, and
   returns the signed Wompi URL to send them to.

     request   { market, items:[{name,size,qty}], code?, ack:true,
                 customer:{name,email,phone},
                 shipping:{country,address,city,region,postal?,notes?} }
     response  { url, reference, quote }

   The request carries no prices and no totals. Whatever the browser believes it
   costs is irrelevant; see api/_lib/pricing.js.
   =========================================================================== */

const catalog = require('./_lib/catalog');
const { configured } = require('./_lib/db');
const { quote, publicQuote, QuoteError } = require('./_lib/pricing');
const { createOrder } = require('./_lib/orders');
const { checkoutUrl } = require('./_lib/wompi');
const { json, body, siteOrigin, guard } = require('./_lib/http');

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const PHONE = /^[+()\d\s.-]{7,25}$/;
const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

const PHONE_PREFIX = { CO: '+57' };

function validate(b, market) {
  const c = b.customer || {};
  const s = b.shipping || {};
  const customer = { name: clean(c.name, 120), email: clean(c.email, 254).toLowerCase(), phone: clean(c.phone, 25) };
  const shipping = {
    country: clean(s.country, 2).toUpperCase(),
    address: clean(s.address, 200), city: clean(s.city, 80), region: clean(s.region, 80),
    postal: clean(s.postal, 20), notes: clean(s.notes, 500),
  };
  const bad = [];
  if (customer.name.length < 2) bad.push('name');
  if (!EMAIL.test(customer.email)) bad.push('email');
  if (!PHONE.test(customer.phone)) bad.push('phone');
  if (shipping.address.length < 4) bad.push('address');
  if (shipping.city.length < 2) bad.push('city');
  if (shipping.region.length < 2) bad.push('region');
  if (b.ack !== true) bad.push('ack');
  /* The destination is the market. Colombian stock at Colombian prices must not
     ship to a US address; the storefront enforces it, and so does the server,
     because the browser is not the thing to rely on. */
  const ship = catalog.MARKETS[market].ship;
  if (!ship.includes(shipping.country)) bad.push('country');
  return { customer, shipping, bad };
}

module.exports = guard(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  // without these three secrets there is nothing to sign with; say so plainly so
  // the storefront can fall back to WhatsApp instead of showing a dead end
  if (!process.env.WOMPI_PUBLIC_KEY || !process.env.WOMPI_INTEGRITY_SECRET || !configured()) {
    return json(res, 503, { error: 'payments_unavailable' });
  }

  const b = body(req);
  const market = String(b.market || '').toUpperCase();
  if (!catalog.isMarket(market)) return json(res, 400, { error: 'bad_market' });

  const { customer, shipping, bad } = validate(b, market);
  if (bad.length) return json(res, 400, { error: 'invalid_fields', fields: bad });

  let q;
  try {
    q = await quote({ market, items: b.items, code: b.code });
  } catch (e) {
    if (e instanceof QuoteError) return json(res, e.error === 'unavailable' ? 409 : 400, { error: e.error, detail: e.detail });
    throw e;
  }

  const reference = await createOrder(q, customer, shipping);

  const digits = customer.phone.replace(/\D/g, '');
  const prefix = PHONE_PREFIX[market];
  const local = prefix && digits.startsWith('57') && digits.length === 12 ? digits.slice(2) : digits;
  const url = checkoutUrl({
    reference,
    chargeCop: q.chargeCop,
    redirectUrl: `${siteOrigin(req)}/order?ref=${encodeURIComponent(reference)}`,
    customer: {
      name: customer.name,
      email: customer.email,
      // Wompi's phone field is Colombian; other markets just leave it to the buyer
      phone: prefix && local.length === 10 ? local : null,
      phonePrefix: prefix || null,
    },
  });

  json(res, 200, { url, reference, quote: publicQuote(q) });
});
