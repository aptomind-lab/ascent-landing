/* ===========================================================================
   USD -> COP.

   Wompi settles only in Colombian pesos, so every order is charged in COP
   whatever market it was quoted in. The formula is the one the storefront uses
   for display (toCop in assets/site.js), so the figure a buyer was shown and the
   figure charged agree:

       pesos = round(usd * TRM * 1.02 / 100) * 100

   TRM is the official rate from Colombia's open-data portal. The server fixes
   it at order creation and stores it on the order; a browser-read rate is fine
   for display, never for billing.

   An administrator can pin a rate in the admin panel (setting `trm_override`),
   which wins over the live one. That is the escape hatch for the portal being
   down, or for a day the rate moves sharply.
   =========================================================================== */

const { query } = require('./db');

const BUFFER = 0.02;               // headroom against intraday movement
const FALLBACK_RATE = 3132.42;     // last-resort constant, same as the storefront's
const TRM_URL = 'https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1';
const TTL_MS = 6 * 60 * 60 * 1000;

let cached = { rate: null, at: 0 };

async function fetchLive() {
  const res = await fetch(TRM_URL, { signal: AbortSignal.timeout(3500) });
  if (!res.ok) throw new Error(`TRM source returned ${res.status}`);
  const rows = await res.json();
  const rate = parseFloat(rows && rows[0] && rows[0].valor);
  if (!isFinite(rate) || rate < 1000 || rate > 20000) throw new Error('TRM value out of range');
  return rate;
}

async function getSetting(name) {
  const rows = await query('SELECT value FROM settings WHERE key = $1', [name]);
  return rows.length ? rows[0].value : null;
}

/* Resolves to { rate, source } where source says where the number came from, so
   the admin panel can tell "live" from "pinned" from "fallback". Never throws:
   a payment must not fail because a government API is slow. */
async function getTrm() {
  const pinned = parseFloat(await getSetting('trm_override'));
  if (isFinite(pinned) && pinned > 0) return { rate: pinned, source: 'pinned' };

  if (cached.rate && Date.now() - cached.at < TTL_MS) return { rate: cached.rate, source: 'live' };
  try {
    const rate = await fetchLive();
    cached = { rate, at: Date.now() };
    return { rate, source: 'live' };
  } catch (e) {
    // a stale live rate is a better guess than the compiled-in constant
    if (cached.rate) return { rate: cached.rate, source: 'stale' };
    return { rate: FALLBACK_RATE, source: 'fallback' };
  }
}

const makeToCop = rate => usd => Math.round(usd * rate * (1 + BUFFER) / 100) * 100;

/* ------------------------------------------------------------------- MXN
   Mexican pesos per 1 USD, used ONLY to show an affiliate their commission in
   their own currency (a customer is never charged through this rate). The
   source is the European Central Bank's published reference rate, no key
   needed. Same safety net as the TRM: an admin-pinned value wins, a stale live
   value beats a constant, and it never throws. */
const MXN_FALLBACK = 18.5;
const MXN_URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=MXN';
let mxnCached = { rate: null, at: 0 };

async function getMxn() {
  const pinned = parseFloat(await getSetting('mxn_override'));
  if (isFinite(pinned) && pinned > 0) return { rate: pinned, source: 'pinned' };

  if (mxnCached.rate && Date.now() - mxnCached.at < TTL_MS) return { rate: mxnCached.rate, source: 'live' };
  try {
    const res = await fetch(MXN_URL, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) throw new Error(`MXN source returned ${res.status}`);
    const rate = Number((await res.json()).rates.MXN);
    if (!isFinite(rate) || rate < 5 || rate > 60) throw new Error('MXN value out of range');
    mxnCached = { rate, at: Date.now() };
    return { rate, source: 'live' };
  } catch (e) {
    if (mxnCached.rate) return { rate: mxnCached.rate, source: 'stale' };
    return { rate: MXN_FALLBACK, source: 'fallback' };
  }
}

module.exports = { getTrm, getMxn, makeToCop, BUFFER, FALLBACK_RATE, MXN_FALLBACK };
