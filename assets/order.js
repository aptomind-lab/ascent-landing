/* ==========================================================================
   Order status page.

   Wompi redirects the buyer here (?ref=<our reference>&id=<transaction id>).
   The redirect is NOT proof of payment: anyone can type this URL. So this page
   never decides anything. It asks OUR server for the order's state, and the
   server only moves an order to "approved" when Wompi's signed webhook says so.

   The four states are deliberate. "pending" in particular is not a failure:
   PSE and bank transfers routinely sit there, and telling someone their
   payment failed when it is merely settling produces a support ticket and,
   worse, a second payment. While an order is pending the page asks again every
   few seconds, because the webhook usually lands moments after the redirect.
   ========================================================================== */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const card = $('#or-card');
  if (!card) return;

  const T = () => (typeof I18N !== 'undefined' ? I18N : { en: {} });
  const LANG = document.documentElement.lang === 'es' ? 'es' : 'en';
  const t = k => (T()[LANG] && T()[LANG][k]) || T().en[k] || k;

  const ICON = {
    approved: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pending:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    declined: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>',
    error:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5" stroke-linecap="round"/><circle cx="12" cy="16.5" r="1.1" fill="currentColor" stroke="none"/></svg>',
  };

  const ACTIONS = {
    approved: () => `<a class="btn btn--primary" href="/#catalog">${t('or.keepBrowsing')}</a>`,
    // a retry has to go back to the cart, not re-post a dead transaction
    pending:  () => `<a class="btn btn--ghost" href="/#catalog">${t('or.keepBrowsing')}</a>`,
    declined: () => `<a class="btn btn--primary" href="/checkout">${t('or.tryAgain')}</a>
                     <a class="btn btn--ghost" href="/#catalog">${t('or.keepBrowsing')}</a>`,
    error:    () => `<a class="btn btn--primary" href="/checkout">${t('or.tryAgain')}</a>`,
  };

  function render(state, tx, opts) {
    card.dataset.state = state;
    $('#or-mark').innerHTML = ICON[state] || ICON.error;
    $('#or-kicker').textContent = t('or.kicker.' + state);
    $('#or-title').textContent = t('or.title.' + state);
    $('#or-body').textContent = t('or.body.' + state);
    $('#or-actions').innerHTML = (ACTIONS[state] || ACTIONS.error)();

    const meta = $('#or-meta');
    if (tx && tx.reference) {
      $('#or-ref').textContent = tx.reference;
      /* The pesos actually charged: that is the amount on the buyer's bank
         statement, whatever currency the catalogue quoted them in. */
      $('#or-amount').textContent = tx.chargeCop != null
        ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0, currencyDisplay: 'code' }).format(tx.chargeCop)
        : '\u2014';
      meta.hidden = false;
    } else {
      meta.hidden = true;
    }

    /* Only an approved payment clears the cart. Clearing on pending or
       declined would leave someone who needs to retry with nothing to retry. */
    if (state === 'approved' && !(opts && opts.preview)) {
      try { localStorage.removeItem('ascent.order.v1'); } catch (e) {}
      if (window.AscentCart && window.AscentCart.refresh) window.AscentCart.refresh();
    }
  }

  const POLL_MS = 3000;
  const POLL_MAX = 30;          // about 90 seconds, then leave it as "still settling"

  async function lookup(ref) {
    try {
      const r = await fetch('/api/store?a=order&ref=' + encodeURIComponent(ref), { headers: { Accept: 'application/json' } });
      if (!r.ok) return { state: 'error', tx: null };
      const j = await r.json();
      return { state: j.state, tx: { reference: j.reference, chargeCop: j.chargeCop } };
    } catch (e) {
      return { state: 'error', tx: null };
    }
  }

  async function boot() {
    const p = new URLSearchParams(location.search);

    // ?status=approved|pending|declined|error previews a state without a real order
    const forced = p.get('status');
    if (forced && ICON[forced]) {
      render(forced, { reference: p.get('ref') || 'ASC-PREVIEW-0000', chargeCop: 597600 }, { preview: true });
      return;
    }

    const ref = p.get('ref');
    if (!ref) { render('error', null); return; }

    let res = await lookup(ref);
    render(res.state, res.tx);
    for (let n = 0; res.state === 'pending' && n < POLL_MAX; n++) {
      await new Promise(done => setTimeout(done, POLL_MS));
      res = await lookup(ref);
      render(res.state, res.tx);
    }
  }

  boot();
})();
