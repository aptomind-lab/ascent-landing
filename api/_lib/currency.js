/* ===========================================================================
   Showing an affiliate their money in their own currency.

   Everything is EARNED in pesos colombianos: that is the money Wompi charged and
   the base the tiers are written in. An affiliate based in Mexico or the USA
   is simply shown, and paid, the equivalent in MXN or USD.

     COP per 1 USD   the TRM (no customer buffer: this is a conversion, not a charge)
     COP per 1 MXN   TRM / (MXN per 1 USD)

   While a month is unpaid its figures use today's rate and are approximate. The
   moment a month is marked paid, the amount in the affiliate's currency AND the
   rate used are frozen with it, so what was paid never moves afterwards.
   =========================================================================== */

const { getTrm, getMxn } = require('./fx');

const CURRENCIES = ['COP', 'MXN', 'USD'];
const DECIMALS = { COP: 0, MXN: 2, USD: 2 };
const isCurrency = c => CURRENCIES.includes(c);

const round = (n, dec) => { const f = 10 ** dec; return Math.round(n * f) / f; };

async function getRates() {
  const [trm, mxn] = await Promise.all([getTrm(), getMxn()]);
  return { usd_cop: trm.rate, usd_mxn: mxn.rate, trm_source: trm.source, mxn_source: mxn.source };
}

// how many pesos colombianos one unit of `currency` is worth
function copPerUnit(currency, rates) {
  if (currency === 'USD') return rates.usd_cop;
  if (currency === 'MXN') return rates.usd_cop / rates.usd_mxn;
  return 1;
}

/* A function that turns a COP amount into the affiliate's currency. */
function converter(currency, rates) {
  const per = copPerUnit(currency, rates);
  const dec = DECIMALS[currency] ?? 0;
  return cop => round(Number(cop) / per, dec);
}

module.exports = { CURRENCIES, DECIMALS, isCurrency, getRates, copPerUnit, converter, round };
