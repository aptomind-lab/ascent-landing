/* ===========================================================================
   Wompi: signing a checkout and verifying its confirmation.

   Both halves are SHA-256 over concatenated strings, per Wompi's docs:

     checkout integrity   sha256( reference + amountInCents + currency + INTEGRITY_SECRET )
     event checksum       sha256( <values named in signature.properties, in order>
                                  + timestamp + EVENTS_SECRET )

   The integrity secret and the events secret are different values and neither
   is the public or private API key. They live only in server environment
   variables. If the integrity secret ever reached the browser, anyone could
   sign an order for one peso.

   A payment is only trusted when the EVENT checksum verifies. The browser being
   redirected back to the site proves nothing; anyone can type that URL.

   There is deliberately NO code path where the browser can trigger a "look this
   transaction up on Wompi and mark the order paid" step. A transaction fetched
   by id is authentic Wompi data, but not necessarily OUR merchant's: someone
   with their own Wompi account could create an approved transaction carrying
   one of our order references. Only the signed event, which needs our events
   secret to forge, is allowed to move an order to paid.
   =========================================================================== */

const crypto = require('crypto');

const CHECKOUT_URL = 'https://checkout.wompi.co/p/';

const sha256 = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function integritySignature(reference, amountInCents, currency) {
  return sha256(`${reference}${amountInCents}${currency}${env('WOMPI_INTEGRITY_SECRET')}`);
}

/* The URL the buyer is sent to. Everything in it is either public (the key) or
   derived server-side from the stored order. */
function checkoutUrl({ reference, chargeCop, redirectUrl, customer }) {
  const amountInCents = chargeCop * 100;
  const p = new URLSearchParams();
  p.set('public-key', env('WOMPI_PUBLIC_KEY'));
  p.set('currency', 'COP');
  p.set('amount-in-cents', String(amountInCents));
  p.set('reference', reference);
  p.set('signature:integrity', integritySignature(reference, amountInCents, 'COP'));
  if (redirectUrl) p.set('redirect-url', redirectUrl);
  if (customer && customer.email) p.set('customer-data:email', customer.email);
  if (customer && customer.name) p.set('customer-data:full-name', customer.name);
  if (customer && customer.phone && customer.phonePrefix) {
    p.set('customer-data:phone-number', customer.phone);
    p.set('customer-data:phone-number-prefix', customer.phonePrefix);
  }
  return `${CHECKOUT_URL}?${p.toString()}`;
}

// "transaction.id" -> event.data.transaction.id
function pick(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/* True only when the event is authentic. The property list is read from the
   event rather than hard-coded: Wompi documents that it can change. */
function verifyEvent(event) {
  try {
    const sig = event && event.signature;
    if (!sig || !Array.isArray(sig.properties) || typeof sig.checksum !== 'string') return false;
    if (event.timestamp == null) return false;
    const values = sig.properties.map(p => {
      const v = pick(event.data, p);
      return v == null ? '' : String(v);
    });
    const expected = sha256(values.join('') + String(event.timestamp) + env('WOMPI_EVENTS_SECRET'));
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(sig.checksum.toLowerCase(), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

module.exports = { checkoutUrl, integritySignature, verifyEvent, sha256 };
