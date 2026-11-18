/* ===========================================================================
   Points plan: the fixed facts of the programme that Stage 1 needs.

   The earning rules (levels, Points, month close) arrive in Stage 2. Here there is
   only what registration needs: the customer discount a new affiliate's code
   gives, the countries, and how a code and an invite link are made.
   =========================================================================== */

const crypto = require('crypto');
const { query } = require('./db');

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

/* ------------------------------------------------------------ plan settings */

/* Every number of the Points plan, in one place, editable by the owner in Ajustes.
   Money amounts are in MXN, the plan's base currency. */
const DEFAULTS = {
  activation_mxn: 20000,      // Volumen del mes that activates the affiliate (and sets Optimización 1)
  step_mxn: 5000,             // each further step of Volumen del mes ...
  step_pct: 5,                // ... adds this many points of percentage
  floor_pct: 10,              // Optimización 1: the percentage kept for floor_months after qualifying
  cap_pct: 35,                // the highest percentage
  referral_pct: 5,            // bonus to the sponsor, on the value of a direct referral's purchases and sales
  business_limit_pct: 48,     // discount + affiliate % + bonus % can never pass this share of the price
  discount_pct: PLAN_DISCOUNT_PCT,   // what a customer gets with a plan affiliate's code
  wait_days: 15,              // days after the month closes before Points can be used
  expiry_months: 12,          // Points expire this long after the holder's last activity
  floor_months: 12,           // how long Optimización 1 lasts after the last qualifying month
  own_cap_mxn: null,          // optional monthly cap on the owner's own purchases that count (null = no cap)
  vat_pct: 0,                 // IVA contained in prices, removed before counting volume (0 = prices have none)
};

const num = (v, min, max, int) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max && (!int || Number.isInteger(n)) ? n : null;
};

/* Strict validation of what the owner submits. Returns { config } or { error }. */
function validateConfig(input) {
  const b = input && typeof input === 'object' ? input : {};
  const c = {};
  const spec = [
    ['activation_mxn', 1000, 10000000, true], ['step_mxn', 100, 1000000, true], ['step_pct', 0.5, 50, false],
    ['floor_pct', 0, 100, false], ['cap_pct', 0, 100, false], ['referral_pct', 0, 50, false],
    ['business_limit_pct', 1, 100, false], ['discount_pct', 0, 50, false],
    ['wait_days', 0, 120, true], ['expiry_months', 1, 60, true], ['floor_months', 1, 60, true], ['vat_pct', 0, 30, false],
  ];
  for (const [k, min, max, int] of spec) {
    const v = b[k] === undefined ? DEFAULTS[k] : num(b[k], min, max, int);
    if (v === null) return { error: 'bad_' + k };
    c[k] = v;
  }
  if (b.own_cap_mxn === undefined || b.own_cap_mxn === null || b.own_cap_mxn === '') c.own_cap_mxn = b.own_cap_mxn === undefined ? DEFAULTS.own_cap_mxn : null;
  else { c.own_cap_mxn = num(b.own_cap_mxn, 1, 100000000, false); if (c.own_cap_mxn === null) return { error: 'bad_own_cap_mxn' }; }
  if (c.cap_pct < c.floor_pct) return { error: 'cap_below_floor' };
  // the guard from the plan: what is paid out plus the customer's discount must fit inside the business limit
  if (c.discount_pct + c.cap_pct + c.referral_pct > c.business_limit_pct) return { error: 'over_limit' };
  return { config: c };
}

async function getConfig() {
  const rows = await query("SELECT value FROM settings WHERE key = 'plan_config'");
  let saved = {};
  try { saved = rows.length ? JSON.parse(rows[0].value) : {}; } catch (e) { saved = {}; }
  const v = validateConfig({ ...DEFAULTS, ...saved });
  return v.config || { ...DEFAULTS };
}

async function saveConfig(config) {
  await query(
    `INSERT INTO settings (key, value) VALUES ('plan_config', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [JSON.stringify(config)]);
}

module.exports = { PLAN_DISCOUNT_PCT, COUNTRIES, LANGUAGES, DEFAULTS, refCode, codeFromName, randomString, validateConfig, getConfig, saveConfig };
