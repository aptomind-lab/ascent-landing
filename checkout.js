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
  const LANG = document.documentElement.lang === 'es' ? 'es' : 'en';
  const t = k => (T()[LANG] && T()[LANG][k]) || T().en[k] || k;

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

  function applyCountry() {
    const c = $('#co-country').value;
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
  $('#co-country').addEventListener('change', () => { applyCountry(); syncPay(); });

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

  /* ---- summary ---- */
  function renderSummary() {
    const items = order();
    const empty = items.length === 0;
    $('#co-empty').hidden = !empty;
    $('#co-grid').hidden = empty;
    if (empty) return;

    const total = items.reduce((a, i) => a + i.price * i.qty, 0);
    /* Both currencies, from site.js's formatter, so this total can never
       disagree with the one in the cart drawer. */
    const fx = window.AscentFX;
    const price = v => fx ? fx.priceHTML(v, 'fx--inline') : money(v);
    $('#co-lines').innerHTML = items.map(i => `
      <div class="co-line">
        <div>
          <div class="co-line-n">${i.name}</div>
          <div class="co-line-m small">${i.size} · ×${i.qty}</div>
        </div>
        <div class="tabular">${price(i.price * i.qty)}</div>
      </div>`).join('');
    $('#co-total').innerHTML = fx ? fx.priceHTML(total, 'fx--total') : money(total);
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    $$('#co-form input, #co-form select').forEach(el => showError(el, fieldError(el)));
    if (pay.getAttribute('aria-disabled') === 'true') {
      const first = $('#co-form .is-invalid');
      if (first) { first.focus(); return; }
      $('[data-err="form"]').textContent = ruo.checked ? t('co.fixErrors') : t('co.needAck');
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
    payload.items = order();
    payload.total = payload.items.reduce((a, i) => a + i.price * i.qty, 0);
    console.info('[checkout] validated order, awaiting payment backend', payload);
    $('[data-err="form"]').textContent = t('co.notWired');
  });

  applyCountry();
  renderSummary();
  syncPay();
  // the real exchange rate arrives after first paint; redraw when it does
  addEventListener('ascent:fx-ready', renderSummary);
})();
