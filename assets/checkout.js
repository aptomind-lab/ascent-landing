/* ==========================================================================
   Checkout.

   What this page does: collect the contact and shipping details, ask the
   SERVER what the order costs, and on confirmation send the buyer to Wompi.

   Prices are never worked out here. The browser sends what is in the cart
   (name, size, quantity) plus an optional discount code, and renders whatever
   the server answers: lines, subtotal, discount, total, and the pesos that will
   actually be charged. If the server is unreachable the summary falls back to
   the browser's own estimate for display only, and paying is not possible until
   the server answers, because the server is what creates the order.

   Runs after site.js, which owns the cart in localStorage under 'ascent.order.v1'.
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
  const t = (k, vars) => {
    const s = (T()[LANG()] && T()[LANG()][k]) || T().en[k] || k;
    return vars ? s.replace(/\{\{(\w+)\}\}/g, (m, v) => (v in vars ? vars[v] : m)) : s;
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---- the cart, read from the same store site.js writes ---- */
  function order() {
    try { return JSON.parse(localStorage.getItem('ascent.order.v1') || '[]'); }
    catch (e) { return []; }
  }
  // what the server is told: identity and quantity, never a price
  const orderForServer = () => order().map(i => ({ name: i.name, size: i.size, qty: i.qty }));
  const money = n => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const copFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0, currencyDisplay: 'code' });

  /* ---- country decides the labels and what is required ---- */
  const RULES = {
    CO: { region: 'co.regionCO', postal: false },
    MX: { region: 'co.regionMX', postal: true },
    US: { region: 'co.regionUS', postal: true },
  };

  /* The destination is the market, full stop. Colombian stock at Colombian
     prices cannot be sent to a US address; the server enforces this too. */
  const destination = () => {
    const mk = window.AscentMarket;
    return (mk && mk.config().ship[0]) || 'US';
  };
  const marketCode = () => (window.AscentMarket ? window.AscentMarket.code() : 'US');

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
    el.addEventListener('input', () => {
      if (el.classList.contains('is-invalid') && !fieldError(el)) showError(el, '');
      syncPay();
    });
  });

  /* ---- the research-use acknowledgement gates payment ---- */
  const ruo = $('#co-ruo');
  const pay = $('#co-pay');
  const formValid = () =>
    $$('#co-form input, #co-form select').every(el => !fieldError(el));

  let busy = false;
  // paying needs: a server price, a valid form, the acknowledgement, and no request in flight
  function syncPay() {
    const ok = !!quote && !quoteError && ruo.checked && formValid() && order().length > 0 && !busy;
    pay.setAttribute('aria-disabled', String(!ok));
    pay.classList.toggle('is-disabled', !ok);
  }
  ruo.addEventListener('change', syncPay);

  /* ---- the server's quote ---- */
  let quote = null;          // last good answer from /api/store?a=quote
  let quoteError = '';       // a message when the order itself cannot be priced
  let codeApplied = '';      // the code the server has accepted
  let seq = 0;               // discards the answer of a request that was overtaken

  const CODE_KEY = 'ascent.code.v1';
  try { codeApplied = sessionStorage.getItem(CODE_KEY) || ''; } catch (e) { codeApplied = ''; }

  async function postJson(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let data = null;
    try { data = await res.json(); } catch (e) { /* non-JSON error page */ }
    return { status: res.status, data: data || {} };
  }

  const itemsLabel = detail => (Array.isArray(detail) ? detail.map(d => `${d.name} ${d.size}`).join(', ') : '');

  async function refreshQuote() {
    const mine = ++seq;
    if (!order().length) { quote = null; quoteError = ''; renderSummary(); return; }
    let r;
    try {
      r = await postJson('/api/store?a=quote', { market: marketCode(), items: orderForServer(), code: codeApplied });
    } catch (e) {
      if (mine !== seq) return;
      quote = null; quoteError = t('co.networkError'); renderSummary(); return;
    }
    if (mine !== seq) return;

    if (r.status === 200) {
      quote = r.data; quoteError = '';
    } else if (r.data.error === 'invalid_code') {
      // the cart is fine; only the code is not. Drop it and price again without.
      setCodeMessage(t('co.codeInvalid'), 'err');
      codeApplied = '';
      try { sessionStorage.removeItem(CODE_KEY); } catch (e) {}
      return refreshQuote();
    } else if (r.data.error === 'unavailable') {
      quote = null; quoteError = t('co.unavailable', { items: itemsLabel(r.data.detail) });
    } else {
      quote = null; quoteError = t('co.serverError');
    }
    renderSummary();
  }

  /* ---- summary ---- */
  function renderSummary() {
    const items = order();
    const empty = items.length === 0;
    $('#co-empty').hidden = !empty;
    $('#co-grid').hidden = empty;
    if (empty) { syncPay(); return; }

    const mk = window.AscentMarket;
    const price = v => (mk ? mk.format(v) : `${money(v)}<small> USD</small>`);

    if (quote) {
      $('#co-lines').innerHTML = quote.lines.map(l => `
        <div class="co-line">
          <div>
            <div class="co-line-n">${esc(l.name)}</div>
            <div class="co-line-m small">${esc(l.size)} · ×${l.qty}</div>
          </div>
          <div class="co-line-p tabular">${price(l.line)}</div>
        </div>`).join('');

      const hasDiscount = quote.discount > 0;
      const bd = $('#co-breakdown');
      bd.hidden = !hasDiscount;
      bd.innerHTML = hasDiscount
        ? `<div><span>${esc(t('co.subtotal'))}</span><span class="tabular">${price(quote.subtotal)}</span></div>
           <div class="is-discount"><span>${esc(t('co.discount'))} (${esc(quote.code)} · ${quote.discountPct}%)</span><span class="tabular">−${price(quote.discount)}</span></div>`
        : '';
      $('#co-total').innerHTML = price(quote.total);

      // a dollar market is charged in pesos: state the amount that will be debited
      const charge = $('#co-charge');
      const inPesos = quote.currency === 'COP';
      charge.hidden = inPesos;
      charge.innerHTML = inPesos ? '' : `<span>${esc(t('co.chargeLine'))}</span><b class="tabular">${esc(copFmt.format(quote.chargeCop))}</b>`;
      const fx = $('.fx-note', $('.co-summary'));
      if (fx) fx.hidden = inPesos;
    } else {
      // no server answer: show the browser's estimate so the page is not blank,
      // but it is not payable (see syncPay)
      const pricing = window.AscentPricing;
      const unit = i => (pricing ? pricing.unitPrice(i) : i.price);
      $('#co-lines').innerHTML = items.map(i => `
        <div class="co-line">
          <div>
            <div class="co-line-n">${esc(i.name)}</div>
            <div class="co-line-m small">${esc(i.size)} · ×${i.qty}</div>
          </div>
          <div class="co-line-p tabular">${price(unit(i) * i.qty)}</div>
        </div>`).join('');
      $('#co-breakdown').hidden = true;
      $('#co-total').innerHTML = price(items.reduce((a, i) => a + unit(i) * i.qty, 0));
      $('#co-charge').hidden = true;
    }
    $('#co-total-label').textContent = t('cart.total');

    const msg = $('[data-err="form"]');
    // a pricing problem is shown where the buyer is looking; a form problem is set by submit
    if (quoteError) msg.textContent = quoteError;
    else if (msg.dataset.kind === 'quote') msg.textContent = '';
    msg.dataset.kind = quoteError ? 'quote' : '';
    syncPay();
  }

  /* ---- discount code ---- */
  const codeInput = $('#co-code');
  const codeBtn = $('#co-code-apply');
  const codeMsg = $('#co-code-msg');

  function setCodeMessage(text, kind) {
    codeMsg.textContent = text || '';
    codeMsg.hidden = !text;
    codeMsg.classList.toggle('is-ok', kind === 'ok');
    codeMsg.classList.toggle('is-err', kind === 'err');
    codeInput.classList.toggle('is-invalid', kind === 'err');
  }

  function syncCodeUi() {
    const applied = !!(quote && quote.code && quote.code === codeApplied);
    codeBtn.textContent = applied ? t('co.codeRemove') : t('co.codeApply');
    codeBtn.dataset.mode = applied ? 'remove' : 'apply';
    codeInput.readOnly = applied;
    if (applied) {
      codeInput.value = quote.code;
      setCodeMessage(t('co.codeApplied', { code: quote.code, pct: quote.discountPct + '%' }), 'ok');
    }
  }

  codeBtn.addEventListener('click', async () => {
    if (codeBtn.dataset.mode === 'remove') {
      codeApplied = '';
      codeInput.value = '';
      try { sessionStorage.removeItem(CODE_KEY); } catch (e) {}
      setCodeMessage('', '');
      await refreshQuote();
      syncCodeUi();
      return;
    }
    const v = codeInput.value.trim().toUpperCase();
    if (!v) { setCodeMessage(t('co.codeInvalid'), 'err'); return; }
    codeApplied = v;
    setCodeMessage('', '');
    await refreshQuote();
    if (codeApplied) {
      try { sessionStorage.setItem(CODE_KEY, codeApplied); } catch (e) {}
      syncCodeUi();
    }
  });
  codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); codeBtn.click(); } });

  /* ---- submit ---- */
  function whatsappFallback() {
    const wa = $('a.wa');
    const num = wa ? (wa.href.match(/wa\.me\/(\d+)/) || [])[1] : '';
    const lines = order().map(i => `${i.qty}x ${i.name} ${i.size}`).join(', ');
    const code = codeApplied ? ` (${t('wa.code')} ${codeApplied})` : '';
    return `https://wa.me/${num}?text=${encodeURIComponent(`${t('wa.order')} ${lines}${code}. ${t('wa.ruo')}`)}`;
  }

  function setFormMessage(html, isHtml) {
    const el = $('[data-err="form"]');
    el.dataset.kind = '';
    if (isHtml) el.innerHTML = html; else el.textContent = html;
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy) return;
    $$('#co-form input, #co-form select').forEach(el => showError(el, fieldError(el)));
    if (pay.getAttribute('aria-disabled') === 'true') {
      const first = $('#co-form .is-invalid');
      if (first) { first.focus(); return; }
      if (quoteError) return;
      setFormMessage(!ruo.checked ? t('co.needAck') : t('co.fixErrors'));
      return;
    }
    setFormMessage('');

    const f = Object.fromEntries(new FormData(form));
    const body = {
      market: marketCode(),
      items: orderForServer(),
      code: codeApplied,
      ack: ruo.checked,
      customer: { name: f.name, email: f.email, phone: f.phone },
      shipping: { country: f.country, address: f.address, city: f.city, region: f.region, postal: f.postal, notes: f.notes },
    };

    busy = true; syncPay();
    const label = pay.textContent;
    pay.textContent = t('co.redirecting');
    let r;
    try {
      r = await postJson('/api/checkout', body);
    } catch (err) {
      busy = false; pay.textContent = label; syncPay();
      setFormMessage(t('co.networkError'));
      return;
    }

    if (r.status === 200 && r.data.url) {
      // keep the cart: it is only cleared once the payment is approved (order.js)
      window.location.assign(r.data.url);
      return;
    }

    busy = false; pay.textContent = label;
    const err = r.data.error;
    if (err === 'payments_unavailable') {
      setFormMessage(`${esc(t('co.paymentsDown'))} <a href="${whatsappFallback()}" target="_blank" rel="noopener">${esc(t('co.paymentsDownCta'))}</a>`, true);
    } else if (err === 'unavailable') {
      quote = null; quoteError = t('co.unavailable', { items: itemsLabel(r.data.detail) });
      renderSummary();
    } else if (err === 'invalid_code') {
      codeApplied = '';
      try { sessionStorage.removeItem(CODE_KEY); } catch (e2) {}
      setCodeMessage(t('co.codeInvalid'), 'err');
      await refreshQuote();
      syncCodeUi();
      setFormMessage(t('co.codeInvalid'));
    } else if (err === 'invalid_fields' && Array.isArray(r.data.fields)) {
      r.data.fields.forEach(n => { const el = form.elements[n]; if (el && el.name) showError(el, t('co.required')); });
      setFormMessage(t('co.fixErrors'));
    } else {
      setFormMessage(t('co.serverError'));
    }
    syncPay();
  });

  /* ---- boot and re-render triggers ---- */
  async function refreshAll() {
    syncCountryDefault();
    applyCountry();
    await refreshQuote();
    syncCodeUi();
  }

  refreshAll();
  // a language change re-labels everything; a market change is a price change
  addEventListener('ascent:lang', () => { syncCountryDefault(); applyCountry(); renderSummary(); syncCodeUi(); });
  addEventListener('ascent:market', refreshAll);
  // a product switched off in the admin while this page is open
  addEventListener('ascent:stock', refreshQuote);
  // the cart can change in another tab
  addEventListener('storage', e => { if (e.key === 'ascent.order.v1') refreshQuote(); });
})();
