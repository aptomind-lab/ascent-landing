/* ===========================================================================
   Markets: what changes by where the buyer is.

   ONE SITE, THREE CONFIGURATIONS. Not three sites. Every string on this site
   exists once, in i18n.js or data.js, and this file only decides commercial
   facts on top of it: which currency, which price, what ships, what is in
   stock. Nothing here varies a product description, a research page or a
   claim, and nothing here should. Those stay identical in every market, which
   is both the honest position and the defensible one.

   Prices are keyed "Name|Size", matching PRODUCTS exactly. Run
   scripts/check-markets.js after editing: a typo in a key is otherwise a
   silent fallback to the converted price rather than an error.
   =========================================================================== */

const MARKETS = {
  US: {
    label: 'United States',
    currency: 'USD',
    locale: 'en-US',
    lang: 'en',
    ship: ['US'],
  },
  CO: {
    label: 'Colombia',
    currency: 'COP',
    locale: 'es-CO',
    lang: 'es',
    ship: ['CO'],
  },
  MX: {
    /* Priced in dollars for now, not pesos. Mexico is quoted in USD until a
       peso list exists, so currency is USD while the locale and language stay
       Mexican: what a buyer reads is Spanish, what they pay is dollars. */
    label: 'México',
    currency: 'USD',
    locale: 'es-MX',
    lang: 'es',
    ship: ['MX'],
  },
};

const MARKET_DEFAULT = 'US';

/* ---------------------------------------------------------------------------
   Which market a visitor's country puts them in.

   Only three countries are shipped to, so this is a short list rather than a
   region-to-market scheme. Everyone else falls to MARKET_DEFAULT: a visitor in
   Spain or the UK sees the US catalogue in dollars, which is the closest thing
   to true, and the picker is there for anyone the guess does not fit.

   Deliberately separate from each market's `ship` list even though the two
   agree today. They answer different questions — "where is this person" and
   "where will this market post to" — and a market that ships somewhere it does
   not price for would make them diverge.
--------------------------------------------------------------------------- */
const COUNTRY_MARKET = {
  US: 'US',
  CO: 'CO',
  MX: 'MX',
};

const marketForCountry = code =>
  (code && COUNTRY_MARKET[String(code).toUpperCase()]) || MARKET_DEFAULT;

/* ---------------------------------------------------------------------------
   Prices, in each market's own currency, as whole units (not cents).

   A market with no entry for a product falls back to converting the USD price
   in data.js at the live rate, which is what the site did everywhere before
   this file existed. So a partial table degrades to the old behaviour rather
   than to a missing price.

   US is deliberately empty: data.js already holds the USD prices, and keeping
   one source for them means a US price change is a single edit rather than
   two places that can disagree.
--------------------------------------------------------------------------- */
const MARKET_PRICES = {
  US: {},
  CO: {
    'BPC-157|10mg': 664000,
    'BPC-157|20mg': 657000,
    'BPC-157|40mg': 1022000,
    'Cartalax|20mg': 672000,
    'GHK-Cu|100mg': 709000,
    'KLOWUP|80mg': 903000,
    'KPV|10mg': 548000,
    'KPV|30mg': 959000,
    'TB-500|10mg': 792000,
    '5-Amino-1MQ|50mg': 511000,
    'AICAR|50mg': 475000,
    'AOD-9604|5mg': 687000,
    'Eloratlintide|10mg': 1095000,
    'MOTS-c|40mg': 847000,
    'Retatrutide|10mg': 622000,
    'Retatrutide|30mg': 889000,
    'Retatrutide|50mg': 1161000,
    'SLU-PP-332|5mg': 683000,
    'Tensity I|20mg': 901000,
    'Tesamorelin|10mg': 630000,
    'Tesamorelin|20mg': 831000,
    'Tirzepatide|5mg': 591000,
    'Tirzepatide|10mg': 683000,
    'Tirzepatide|30mg': 942000,
    'CJC-1295 noDAC|10mg': 657000,
    'GHRP-2|5mg': 572000,
    'HCG|5000IU': 685000,
    'HCG|10000IU': 833000,
    'HGH|30IU': 606000,
    'HGH|36IU': 1049000,
    'HGH|50IU': 630000,
    'IGF1-LR3|1mg': 758000,
    'Ipamorelin|10mg': 637000,
    'Kisspeptin|10mg': 615000,
    'Synergy II|10mg/10mg': 822000,
    'ARA-290|10mg': 636000,
    'Cardiogen|20mg': 647000,
    'Coherence|50mg': 785000,
    'Cortagen|20mg': 705000,
    'Epithalon|50mg': 649000,
    'FOX-04|10mg': 1217000,
    'Glutathione|1500mg': 754000,
    'NAD+|1000mg': 767000,
    'Oxytocin|10mg': 457000,
    'Pinealon|20mg': 655000,
    'Prostamax|20mg': 913000,
    'PT-141|10mg': 682000,
    'SS-31|50mg': 1107000,
    'Thymosin A|10mg': 825000,
    'Thymulin|20mg': 954000,
    'Vesugen|20mg': 886000,
    'Vilon|20mg': 892000,
    'VIP|10mg': 863000,
    'DSIP|15mg': 549000,
    'Selank|30mg': 565000,
    'Semax|30mg': 551000,
    'Melanotan I|10mg': 489000,
    'Melanotan II|10mg': 480000,
  },
  MX: {},   // pending: Mexican list
};

/* ---------------------------------------------------------------------------
   What each market can supply, and what is on the shelf today.

     carries: 'all' | []   the range. 'all' is the whole catalogue. A line
                           outside it is not sold here and is not rendered.
     inStock: []           what is available now. A carried line absent from
                           this renders dimmed and unbuyable.

   Two lists rather than one flag, because "we do not sell this here" and "we
   sell this and are out" read differently to a buyer, and only one of them
   invites them back.

   inStock is the explicit list rather than its opposite, deliberately. Every
   market can supply the whole catalogue, so an out-of-stock list would run to
   80-odd lines and, worse, a product added tomorrow would default to being on
   the shelf in three countries the day it lands. This way anything new is
   carried but not yet stocked, which is true by definition.

   Colombia is the one market narrower than the catalogue. It is supplied
   separately, and the 29 lines added after its price list was issued have no
   peso figure. Rendering those dimmed would still print a price, and it would
   be a USD conversion rather than the Colombian one, so they stay outside the
   range until real numbers exist.
--------------------------------------------------------------------------- */
const MARKET_STOCK = {
  US: {
    carries: 'all',
    /* Only the 20mg Retatrutide here. Its 125.00 sits below the 10mg's 170.21
       for twice the peptide, which makes the smaller vial worse in every
       respect and the whole ladder look like a mistake. Narrowing the range is
       not a workaround for that — the other three sizes are not on the US
       shelf anyway — but it does mean the two prices are never on screen
       together while the ladder is being sorted out. Mexico takes the opposite
       cut for the same reason. */
    except: ['Retatrutide|10mg', 'Retatrutide|30mg', 'Retatrutide|50mg'],
    inStock: [
      'GHK-Cu|50mg',
      'MOTS-c|10mg',
      'BPC-157 / TB-500|20mg',
      'Retatrutide|20mg',
    ],
  },
  CO: {
    carries: [
      'BPC-157|10mg',
      'BPC-157|20mg',
      'BPC-157|40mg',
      'Cartalax|20mg',
      'GHK-Cu|100mg',
      'KLOWUP|80mg',
      'KPV|10mg',
      'KPV|30mg',
      'TB-500|10mg',
      '5-Amino-1MQ|50mg',
      'AICAR|50mg',
      'AOD-9604|5mg',
      'Eloratlintide|10mg',
      'MOTS-c|40mg',
      'Retatrutide|10mg',
      'Retatrutide|30mg',
      'Retatrutide|50mg',
      'SLU-PP-332|5mg',
      'Tensity I|20mg',
      'Tesamorelin|10mg',
      'Tesamorelin|20mg',
      'Tirzepatide|5mg',
      'Tirzepatide|10mg',
      'Tirzepatide|30mg',
      'CJC-1295 noDAC|10mg',
      'GHRP-2|5mg',
      'HCG|5000IU',
      'HCG|10000IU',
      'HGH|30IU',
      'HGH|36IU',
      'HGH|50IU',
      'IGF1-LR3|1mg',
      'Ipamorelin|10mg',
      'Kisspeptin|10mg',
      'Synergy II|10mg/10mg',
      'ARA-290|10mg',
      'Cardiogen|20mg',
      'Coherence|50mg',
      'Cortagen|20mg',
      'Epithalon|50mg',
      'FOX-04|10mg',
      'Glutathione|1500mg',
      'NAD+|1000mg',
      'Oxytocin|10mg',
      'Pinealon|20mg',
      'Prostamax|20mg',
      'PT-141|10mg',
      'SS-31|50mg',
      'Thymosin A|10mg',
      'Thymulin|20mg',
      'Vesugen|20mg',
      'Vilon|20mg',
      'VIP|10mg',
      'DSIP|15mg',
      'Selank|30mg',
      'Semax|30mg',
      'Melanotan I|10mg',
      'Melanotan II|10mg',
    ],
    inStock: [
      'BPC-157|10mg',
      'BPC-157|40mg',
      'Cartalax|20mg',
      'GHK-Cu|100mg',
      'KLOWUP|80mg',
      'KPV|10mg',
      'KPV|30mg',
      'TB-500|10mg',
      '5-Amino-1MQ|50mg',
      'AICAR|50mg',
      'AOD-9604|5mg',
      'Eloratlintide|10mg',
      'MOTS-c|40mg',
      'Retatrutide|10mg',
      'Retatrutide|30mg',
      'Retatrutide|50mg',
      'SLU-PP-332|5mg',
      'Tensity I|20mg',
      'Tesamorelin|10mg',
      'Tesamorelin|20mg',
      'Tirzepatide|5mg',
      'Tirzepatide|10mg',
      'Tirzepatide|30mg',
      'CJC-1295 noDAC|10mg',
      'GHRP-2|5mg',
      'HCG|5000IU',
      'HCG|10000IU',
      'HGH|30IU',
      'HGH|36IU',
      'HGH|50IU',
      'IGF1-LR3|1mg',
      'Ipamorelin|10mg',
      'Kisspeptin|10mg',
      'Synergy II|10mg/10mg',
      'ARA-290|10mg',
      'Cardiogen|20mg',
      'Coherence|50mg',
      'Cortagen|20mg',
      'Epithalon|50mg',
      'FOX-04|10mg',
      'Glutathione|1500mg',
      'NAD+|1000mg',
      'Oxytocin|10mg',
      'Pinealon|20mg',
      'Prostamax|20mg',
      'PT-141|10mg',
      'SS-31|50mg',
      'Thymosin A|10mg',
      'Thymulin|20mg',
      'Vesugen|20mg',
      'Vilon|20mg',
      'VIP|10mg',
      'DSIP|15mg',
      'Selank|30mg',
      'Semax|30mg',
      'Melanotan I|10mg',
      'Melanotan II|10mg',
    ],
  },
  MX: {
    carries: 'all',
    /* The mirror of the US cut. Mexico stocks the 10mg and not the 20mg, so
       dropping the 20mg here loses nothing and leaves 170.21 / 243.33 / 318.00
       — a ladder that reads correctly on its own. */
    except: ['Retatrutide|20mg'],
    inStock: [
      'BPC-157 / TB-500|20mg',
      'KLOWUP|80mg',
      'Retatrutide|10mg',
    ],
  },
};

/* Part of this market's range. False means do not render it. */
function carries(marketCode, name, size) {
  const rule = MARKET_STOCK[marketCode];
  if (!rule) return true;
  const key = `${name}|${size}`;
  /* Subtracted from the range after it is worked out, so a market can say "all
     of it except this" without restating the whole catalogue as a list. */
  if (rule.except && rule.except.includes(key)) return false;
  return rule.carries === 'all' || rule.carries.includes(key);
}

/* Carried AND on the shelf. False on a carried line means dim it. */
function inStock(marketCode, name, size) {
  const rule = MARKET_STOCK[marketCode];
  if (!rule) return true;
  return carries(marketCode, name, size) && rule.inStock.includes(`${name}|${size}`);
}

/* ---------------------------------------------------------------------------
   Confirmed as stocked, but not sellable yet because something is missing.

   This is a list rather than a comment on purpose. The same note lived as a
   comment beside the US shelf and was silently lost when MARKET_STOCK was
   restructured, which is exactly the failure it existed to prevent. The
   validator prints everything here on every run, so a pending line cannot
   quietly become a permanent omission.
--------------------------------------------------------------------------- */
const PENDING = [
  // empty: Retatrutide 20mg landed at 125.00 and is on the US shelf
];

const marketKey = (name, size) => `${name}|${size}`;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MARKETS, MARKET_DEFAULT, MARKET_PRICES, MARKET_STOCK, marketKey, carries, inStock, PENDING, COUNTRY_MARKET, marketForCountry };
}
