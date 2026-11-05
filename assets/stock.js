/* ==========================================================================
   Live stock.

   markets.js decides what each market has on the shelf, from a list that is
   edited in code. The admin panel adds a second, live switch on top of that: a
   product turned off there must stop being sellable within seconds, with no
   deploy.

   This replaces the global inStock() with one that also asks "has the admin
   switched this off?". Everything on the site already routes through
   inStock(), so the Out of stock label, the disabled Add button and the dimmed
   size chips all follow without any of that code being touched.

   Load order: after markets.js (it wraps the function that file defines) and
   before site.js (which calls it).

   The list is cached in localStorage so a returning visitor's first paint is
   already right; the network answer then corrects it if it has changed. If the
   API is unreachable the cached list stays in force: failing open (selling
   everything) on a network blip would be the worse mistake. The server checks
   again at checkout either way, so this file only ever affects what is shown.
   ========================================================================== */
(function () {
  'use strict';

  var KEY = 'ascent.stockoff.v1';
  var base = window.inStock;
  if (typeof base !== 'function') return;

  var off = new Set();
  try { off = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { off = new Set(); }

  window.inStock = function (market, name, size) {
    return base(market, name, size) && !off.has(name + '|' + size);
  };

  function same(a, b) {
    if (a.size !== b.size) return false;
    for (const k of a) if (!b.has(k)) return false;
    return true;
  }

  fetch('/api/store?a=stock', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (!j || !Array.isArray(j.off)) return;
      var next = new Set(j.off.filter(function (k) { return typeof k === 'string'; }));
      if (same(off, next)) return;
      off = next;
      try { localStorage.setItem(KEY, JSON.stringify(Array.from(off))); } catch (e) {}
      // site.js listens for this and redraws the catalogue, cart and open sheet
      window.dispatchEvent(new CustomEvent('ascent:stock'));
    })
    .catch(function () { /* offline or no API: keep what we have */ });
})();
