/* ===========================================================================
   The catalogue, as the server sees it.

   Prices, markets and static stock are NOT copied here. They are read from the
   same two files the storefront ships to the browser:

     assets/data.js     PRODUCTS, with the USD price of record
     assets/markets.js  per-market price tables, what each market carries and
                        what is on its shelf

   so there is exactly one place a price or a size is edited, and the amount the
   buyer was shown and the amount the server charges cannot drift apart. The
   server never trusts a price sent by the browser; it looks the line up here.

   data.js is a classic browser script (top-level `const PRODUCTS`, no exports),
   so it is evaluated rather than required.
   =========================================================================== */

const fs = require('fs');
const path = require('path');

const markets = require('../../assets/markets.js');

function loadProducts() {
  const file = path.join(__dirname, '..', '..', 'assets', 'data.js');
  const src = fs.readFileSync(file, 'utf8');
  // eslint-disable-next-line no-new-func
  const { PRODUCTS } = new Function(`${src}\n;return { PRODUCTS };`)();
  if (!Array.isArray(PRODUCTS) || !PRODUCTS.length) throw new Error('data.js did not yield PRODUCTS');
  return PRODUCTS;
}

const PRODUCTS = loadProducts();
const BY_KEY = new Map(PRODUCTS.map(p => [`${p.n}|${p.s}`, p]));

const key = (name, size) => `${name}|${size}`;
const find = (name, size) => BY_KEY.get(key(name, size)) || null;
const isMarket = code => Object.prototype.hasOwnProperty.call(markets.MARKETS, code);

/* The unit price in the market's own currency.

   A pinned local figure wins. Without one, a USD market uses the catalogue USD
   price and a peso market converts it. This mirrors localAmount() in site.js on
   purpose; toCop is injected because the exchange rate is a runtime value. */
function unitPrice(marketCode, name, size, toCop) {
  const product = find(name, size);
  if (!product) return null;
  const pinned = (markets.MARKET_PRICES[marketCode] || {})[key(name, size)];
  if (pinned != null) return Number(pinned);
  return markets.MARKETS[marketCode].currency === 'COP' ? toCop(product.p) : product.p;
}

const carries = (marketCode, name, size) => markets.carries(marketCode, name, size);
const onShelf = (marketCode, name, size) => markets.inStock(marketCode, name, size);

module.exports = {
  PRODUCTS,
  MARKETS: markets.MARKETS,
  MARKET_STOCK: markets.MARKET_STOCK,
  key, find, isMarket, unitPrice, carries, onShelf,
};
