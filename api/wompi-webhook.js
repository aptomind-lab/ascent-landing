/* ===========================================================================
   POST /api/wompi-webhook

   Wompi calls this when a transaction changes state. It is the ONLY thing that
   can mark an order paid, and only when the event's checksum verifies against
   WOMPI_EVENTS_SECRET.

   Set the URL in the Wompi dashboard (Developers > Events) for BOTH environments:
       https://<your-domain>/api/wompi-webhook

   Wompi retries three times over 24 hours until it gets a 200, so a verified
   event always answers 200, including for a reference this server does not
   know (a retry would not make it known). An event that fails verification
   answers 401 and changes nothing.
   =========================================================================== */

const { verifyEvent } = require('./_lib/wompi');
const { applyTransaction } = require('./_lib/orders');
const { json, body, guard } = require('./_lib/http');

module.exports = guard(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  if (!process.env.WOMPI_EVENTS_SECRET) return json(res, 503, { error: 'not_configured' });

  const event = body(req);
  if (!verifyEvent(event)) return json(res, 401, { error: 'bad_signature' });

  if (event.event === 'transaction.updated') {
    const tx = event.data && event.data.transaction;
    if (tx) {
      const result = await applyTransaction(tx);
      if (!result.found) console.warn('[wompi] event for unknown reference', tx.reference);
      if (result.mismatch) console.error('[wompi] AMOUNT MISMATCH, order parked for review', tx.reference);
    }
  }
  json(res, 200, { ok: true });
});
