/* ===========================================================================
   Public storefront API.

     GET  /api/store?a=stock          which products the admin switched off
     POST /api/store?a=quote          price an order, no side effects
     GET  /api/store?a=order&ref=...  the state of an order, for the return page

   Nothing here returns commissions, affiliate names or customer data.
   =========================================================================== */

const { query } = require('./_lib/db');
const { quote, publicQuote, QuoteError } = require('./_lib/pricing');
const { json, body, guard } = require('./_lib/http');

const STATE = {
  APPROVED: 'approved',
  PENDING: 'pending',
  REVIEW: 'pending',      // paid but being verified: not a failure to the buyer
  DECLINED: 'declined',
  VOIDED: 'declined',
  ERROR: 'error',
};

const quoteStatus = e => (e.error === 'unavailable' ? 409 : 400);

module.exports = guard(async (req, res) => {
  const a = String((req.query && req.query.a) || '');

  if (a === 'stock' && req.method === 'GET') {
    const rows = await query('SELECT key FROM stock_off ORDER BY key');
    /* Not per-visitor, so a short CDN cache is safe (unlike /api/geo, which is
       keyed on the visitor's country). Ten seconds keeps a stock switch near
       real time without every page view reaching the database. */
    return json(res, 200, { off: rows.map(r => r.key) }, {
      'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
    });
  }

  if (a === 'quote' && req.method === 'POST') {
    try {
      return json(res, 200, publicQuote(await quote(body(req))));
    } catch (e) {
      if (e instanceof QuoteError) return json(res, quoteStatus(e), { error: e.error, detail: e.detail });
      throw e;
    }
  }

  if (a === 'order' && req.method === 'GET') {
    const ref = String((req.query && req.query.ref) || '').slice(0, 64);
    if (!/^ASC-[A-Z0-9-]{6,50}$/.test(ref)) return json(res, 400, { error: 'bad_reference' });
    const rows = await query(
      'SELECT status, currency, total_local, charge_cop, created_at FROM orders WHERE reference = $1',
      [ref]
    );
    if (!rows.length) return json(res, 404, { error: 'not_found' });
    const o = rows[0];
    return json(res, 200, {
      state: STATE[o.status] || 'pending',
      reference: ref,
      currency: o.currency,
      total: Number(o.total_local),
      chargeCop: Number(o.charge_cop),
    });
  }

  json(res, 404, { error: 'not_found' });
});
