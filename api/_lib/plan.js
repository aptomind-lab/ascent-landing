/* ===========================================================================
   Points plan: the fixed facts of the programme that Stage 1 needs.

   The earning rules (levels, Points, month close) arrive in Stage 2. Here there is
   only what registration needs: the customer discount a new affiliate's code
   gives, the countries, and how a code and an invite link are made.
   =========================================================================== */

const crypto = require('crypto');

const PLAN_DISCOUNT_PCT = 7;                       // what a customer gets with a plan affiliate's code
const COUNTRIES = { CO: 'COP', MX: 'MXN', US: 'USD' };   // country -> the currency their figures show in
const LANGUAGES = ['es', 'en'];

// no 0/O, 1/I/L: an invite link or code read aloud or typed from a phone should not be ambiguous
const SAFE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomString(len) {
  let out = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += SAFE[bytes[i] % SAFE.length];
  return out;
}

const refCode = () => randomString(8);

/* "María José Gómez" -> "MARIA" + 2 digits, e.g. "MARIA47". Letters only, accents removed. */
function codeFromName(name) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'ASC';
  const letters = first.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 8);
  const base = letters.length >= 3 ? letters : (letters + 'ASC').slice(0, 5);
  return base + String(crypto.randomInt(10, 100));
}

module.exports = { PLAN_DISCOUNT_PCT, COUNTRIES, LANGUAGES, refCode, codeFromName, randomString };
