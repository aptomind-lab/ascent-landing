/* ==========================================================================
   Order status page.

   Wompi redirects here with ?id=<transactionId>. The redirect is NOT proof of
   payment — anyone can type this URL — so the real status has to be read from
   Wompi's transaction endpoint. That lookup is stubbed until the backend is
   decided; see resolveStatus().

   The four states are deliberate. "pending" in particular is not a failure:
   PSE and bank transfers routinely sit there, and telling someone their
   payment failed when it is merely settling produces a support ticket and,
   worse, a second payment.
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

  function render(state, tx) {
    card.dataset.state = state;
    $('#or-mark').innerHTML = ICON[state] || ICON.error;
    $('#or-kicker').textContent = t('or.kicker.' + state);
    $('#or-title').textContent = t('or.title.' + state);
    $('#or-body').textContent = t('or.body.' + state);
    $('#or-actions').innerHTML = (ACTIONS[state] || ACTIONS.error)();

    const meta = $('#or-meta');
    if (tx && tx.reference) {
      $('#or-ref').textContent = tx.reference;
      /* tx.amount was stored in whatever currency the order was placed in, so
         it is formatted in the market the buyer is in now. A receipt read from
         a different market is an edge worth knowing about; it is not one this
         can fix without storing the currency alongside the amount, which the
         payment handoff will need to do anyway. */
      const mk = window.AscentMarket;
      $('#or-amount').innerHTML = tx.amount != null && mk
        ? mk.format(tx.amount)
        : (tx.amountText || '—');
      meta.hidden = false;
    } else {
      meta.hidden = true;
    }

    /* Only an approved payment clears the cart. Clearing on pending or
       declined would leave someone who needs to retry with nothing to retry. */
    if (state === 'approved') {
      try { localStorage.removeItem('ascent.order.v1'); } catch (e) {}
      if (window.AscentCart && window.AscentCart.refresh) window.AscentCart.refresh();
    }
  }

  /* ---------------------------------------------------------------------
     THE PLATFORM-SPECIFIC PART.

     Wompi  -> GET https://production.wompi.co/v1/transactions/<id>
               and map data.status (APPROVED | PENDING | DECLINED | VOIDED).
               Safe to call from the browser: it is a public read, no secret.
     Woo    -> the order-received page owns this and this file is unused.

     Until then, ?status= drives it so the states can be reviewed.
     --------------------------------------------------------------------- */
  function resolveStatus() {
    const p = new URLSearchParams(location.search);
    const forced = p.get('status');
    if (forced && ICON[forced]) {
      return Promise.resolve({ state: forced, tx: { reference: p.get('ref') || 'ASC-PREVIEW-0000' } });
    }
    const id = p.get('id');
    if (!id) return Promise.resolve({ state: 'error', tx: null });

    // real lookup, ready for when the redirect URL is live
    return fetch('https://production.wompi.co/v1/transactions/' + encodeURIComponent(id))
      .then(r => r.ok ? r.json() : Promise.reject(new Error('lookup failed')))
      .then(j => {
        const d = j.data || {};
        const map = { APPROVED: 'approved', PENDING: 'pending', DECLINED: 'declined', VOIDED: 'declined', ERROR: 'error' };
        return {
          state: map[d.status] || 'error',
          tx: { reference: d.reference, amount: d.amount_in_cents != null ? d.amount_in_cents / 100 : null },
        };
      })
      .catch(() => ({ state: 'error', tx: null }));
  }

  resolveStatus().then(({ state, tx }) => render(state, tx));
})();
