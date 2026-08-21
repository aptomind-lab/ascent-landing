/* ==========================================================================
   Checkout behaviour.

   Deliberately stops short of submitting. Everything here — reading the cart,
   country-aware address rules, validation, the research-use gate — is identical
   whether the order ends up going to WooCommerce or to a Wompi payload signed
   by a serverless function. Only the final handoff differs, and it is marked.

   Runs after site.js, which owns the cart in localStorage under 'ascent.order.v1'
   and exposes nothing, so the cart is re-read here from the same key.
   ========================================================================== */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const form = $('#co-form');
  if (!form) return;

  const T = () => (typeof I18N !== 'undefined' ? I18N : { en: {} });
  // read per call, not captured at load: the reader can switch language on
  // this page and everything below is rendered by script, not by data-i18n
  const LANG = () => (document.documentElement.lang === 'es' ? 'es' : 'en');
  /* Same {{var}} interpolation site.js does. Without it the subscription
     strings render the literal placeholder, which is worse than an untranslated
     string because it looks like a bug in the price. */
  const t = (k, vars) => {
    const s = (T()[LANG()] && T()[LANG()][k]) || T().en[k] || k;
    return vars ? s.replace(/\{\{(\w+)\}\}/g, (m, v) => (v in vars ? vars[v] : m)) : s;
  };

  /* ---- the cart, read from the same store site.js writes ---- */
  function order() {
    try { return JSON.parse(localStorage.getItem('ascent.order.v1') || '[]'); }
    catch (e) { return []; }
  }
  const money = n => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  /* ---- country decides the labels and what is required ----
     A Colombian buyer is asked for a Departamento, a Mexican for an Estado, a
     US buyer for a State. Postal codes are required in MX and US and genuinely
     optional in much of Colombia, so requiring one there would block real
     orders. */
  const RULES = {
    CO: { region: 'co.regionCO', postal: false },
    MX: { region: 'co.regionMX', postal: true },
    US: { region: 'co.regionUS', postal: true },
  };

  /* The destination is the market, full stop. It used to be guessed from the
     reading language and then left editable, which made where an order ships
     independent of which price list it was built from — so Colombian stock at
     Colombian prices could be sent to a US address, and the market split that
     the whole catalogue rests on came apart at the last step.

     Language is no longer consulted. A Spanish-reading visitor in the US is in
     the US market and ships to the US; that they prefer Spanish says nothing
     about where they live. */
  const destination = () => {
    const mk = window.AscentMarket;
    return (mk && mk.config().ship[0]) || 'US';
  };

  function syncCountryDefault() {
    const c = destination();
    const label = (window.AscentMarket && window.AscentMarket.config().label) || c;
    $('#co-country').textContent = label;
    $('#co-country-value').value = c;
  }

  function applyCountry() {
    const c = destination();
    const rule = RULES[c] || RULES.CO;
    $('#co-region-label').textContent = t(rule.region);
    const postal = $('#co-postal');
    postal.required = rule.postal;
    $('#co-postal-field').classList.toggle('is-optional', !rule.postal);
    $('#co-postal-field').querySelector('label').textContent =
      t('co.postal') + (rule.postal ? '' : ' ' + t('co.optional'));
  }

  /* ---- validation: on blur, never on keystroke ---- */
  const RX = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
    phone: /^[+()\d\s.-]{7,}$/,
  };

  function fieldError(el) {
    const v = el.value.trim();
    if (el.required && !v) return t('co.required');
    if (!v) return '';
    if (el.name === 'email' && !RX.email.test(v)) return t('co.badEmail');
    if (el.name === 'phone' && !RX.phone.test(v)) return t('co.badPhone');
    return '';
  }

  function showError(el, msg) {
    const slot = $(`[data-err="${el.name}"]`);
    if (slot) slot.textContent = msg;
    el.classList.toggle('is-invalid', !!msg);
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  $$('#co-form input, #co-form select, #co-form textarea').forEach(el => {
    el.addEventListener('blur', () => showError(el, fieldError(el)));
    // clear the error as soon as they start fixing it, not on every keystroke
    el.addEventListener('input', () => {
      if (el.classList.contains('is-invalid') && !fieldError(el)) showError(el, '');
      syncPay();
    });
  });
  addEventListener('ascent:market', () => { syncCountryDefault(); applyCountry(); syncPay(); });

  /* ---- the research-use acknowledgement gates payment, same as the cart ---- */
  const ruo = $('#co-ruo');
  const pay = $('#co-pay');
  const formValid = () =>
    $$('#co-form input, #co-form select').every(el => !fieldError(el));


  function syncPay() {
    const ok = ruo.checked && formValid() && order().length > 0;
    pay.setAttribute('aria-disabled', String(!ok));
    pay.classList.toggle('is-disabled', !ok);
  }
  ruo.addEventListener('change', syncPay);

  /* ---- summary ----
     Pricing rules come from site.js rather than being reimplemented here. A
     subscription line discounted in the drawer and charged at full price at
     payment is exactly the kind of mismatch that becomes a dispute. */
  const pricing = () => window.AscentPricing;
  const unit = i => (pricing() ? pricing().unitPrice(i) : i.price);

  function renderSummary() {
    const items = order();
    const empty = items.length === 0;
    $('#co-empty').hidden = !empty;
    $('#co-grid').hidden = empty;
    if (empty) { syncPay(); return; }

    const total = items.reduce((a, i) => a + unit(i) * i.qty, 0);
    /* The market's currency, from site.js's formatter, so this total can never
       disagree with the one in the cart drawer. unit() already returns the
       local amount, so formatting is all that is left to do here. */
    const mk = window.AscentMarket;
    const price = v => (mk ? mk.format(v) : `${money(v)}<small> USD</small>`);
    $('#co-lines').innerHTML = items.map(i => `
      <div class="co-line">
        <div>
          <div class="co-line-n">${i.name}</div>
          <div class="co-line-m small">${i.size} · ×${i.qty}</div>
        </div>
        <div class="co-line-p tabular">${price(unit(i) * i.qty)}</div>
      </div>`).join('');
    /* The total is where the peso figure has to appear, because it is the
       amount Wompi debits. The lines above stay in the market's own currency. */
    const ch = window.AscentCharge;
    $('#co-total').innerHTML = ch ? ch.html(total, 'fx--total') : price(total);
    if (ch) ch.syncNotes();
    $('#co-total-label').textContent = t('cart.total');

  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    $$('#co-form input, #co-form select').forEach(el => showError(el, fieldError(el)));
    if (pay.getAttribute('aria-disabled') === 'true') {
      const first = $('#co-form .is-invalid');
      if (first) { first.focus(); return; }
      $('[data-err="form"]').textContent =
        !ruo.checked ? t('co.needAck') : t('co.fixErrors');
      return;
    }
    $('[data-err="form"]').textContent = '';

    /* ---------------------------------------------------------------------
       THE ONLY PLATFORM-SPECIFIC LINE.

       WooCommerce  -> POST these fields to its checkout endpoint.
       Vercel+Wompi -> POST to a serverless function that builds the reference,
                       computes the SHA256 integrity signature server-side (it
                       must never be computed in the browser — the secret would
                       be exposed and amounts could be forged) and returns the
                       signed payload to redirect with.

       Until that is decided, collect and hold.
       --------------------------------------------------------------------- */
    const payload = Object.fromEntries(new FormData(form));
    const mk = window.AscentMarket;
    payload.items = order();
    payload.total = payload.items.reduce((a, i) => a + unit(i) * i.qty, 0);
    /* total alone is ambiguous and dangerously so: it is dollars in the US and
       Mexico and pesos in Colombia, and a server that assumes dollars would
       multiply a Colombian order by the TRM and charge it three thousand times
       over. The currency travels with the number so that cannot be guessed
       wrong, and the market travels with it because it is what decided both
       the price and the destination. */
    payload.market = mk ? mk.code() : 'US';
    payload.currency = mk ? mk.config().currency : 'USD';
    console.info('[checkout] validated order, awaiting payment backend', payload);
    $('[data-err="form"]').textContent = t('co.notWired');
  });

  syncCountryDefault();
  applyCountry();
  renderSummary();
  syncPay();
  // the real exchange rate arrives after first paint; redraw when it does
  addEventListener('ascent:fx-ready', renderSummary);
  /* A market change is a price change, so this page has to redraw for the same
     reason it redraws on a language change. Without it the summary keeps the
     currency it was first painted in while the drawer behind it has moved. */
  addEventListener('ascent:market', renderSummary);
  /* applyI18n has already run by the time this fires and will have reset the
     total's label from its data-i18n default, so re-rendering after it is what
     keeps "Total today" from reverting to "Total". */
  addEventListener('ascent:lang', () => {
    syncCountryDefault();
    applyCountry();
    renderSummary();
  });
})();
