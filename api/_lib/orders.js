/* ===========================================================================
   Orders: creating one, and the rule for when it counts as paid.

   An order is written BEFORE the buyer is sent to Wompi, with every figure the
   server calculated. Nothing the browser says later can change those figures:
   the confirmation only ever moves the status.

   applyTransaction() is the single place an order becomes PAID. The webhook and
   the return-page reconciliation both call it, so there is one rule, not two.
   =========================================================================== */

const crypto = require('crypto');
const { query } = require('./db');

const FINAL = new Set(['APPROVED', 'DECLINED', 'VOIDED', 'ERROR']);

function newReference() {
  return `ASC-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`.toUpperCase();
}

async function createOrder(q, customer, shipping) {
  const reference = newReference();
  await query(
    `INSERT INTO orders (
       reference, market, currency, items,
       subtotal_local, discount_pct, discount_local, total_local, trm,
       subtotal_cop, discount_cop, charge_cop,
       code_id, code_text, commission_pct, commission_cop,
       customer_name, customer_email, customer_phone, shipping
     ) VALUES (
       $1, $2, $3, $4::jsonb,
       $5, $6, $7, $8, $9,
       $10, $11, $12,
       $13, $14, $15, $16,
       $17, $18, $19, $20::jsonb
     )`,
    [
      reference, q.market, q.currency, JSON.stringify(q.lines),
      q.subtotal, q.discountPct, q.discount, q.total, q.trm,
      q.subtotalCop, q.discountCop, q.chargeCop,
      q.code ? q.code.id : null, q.code ? q.code.code : null, 0, 0,   // commission is worked out per month, never stored per order
      customer.name, customer.email, customer.phone, JSON.stringify(shipping),
    ]
  );
  return reference;
}

/* tx: a Wompi transaction object ({ id, status, reference, amount_in_cents,
   currency }), already known to be authentic (verified event, or fetched
   straight from Wompi's API).

   Rules:
     - APPROVED is only accepted when the amount and currency match what this
       server charged. A mismatch parks the order as REVIEW for a human; it is
       never counted as a sale and never earns a commission.
     - An APPROVED order may only move to VOIDED (a reversal). It never goes back
       to DECLINED or PENDING because an old event arrived late.
     - VOIDED is terminal.
     - Replaying the same event changes nothing. */
async function applyTransaction(tx) {
  const reference = tx && tx.reference;
  if (!reference) return { found: false };
  const rows = await query('SELECT id, status, charge_cop FROM orders WHERE reference = $1', [reference]);
  if (!rows.length) return { found: false };
  const order = rows[0];

  const status = String(tx.status || '').toUpperCase();
  if (status !== 'PENDING' && !FINAL.has(status)) return { found: true, status: order.status, ignored: true };

  if (status === 'APPROVED') {
    const expected = Number(order.charge_cop) * 100;
    if (Number(tx.amount_in_cents) !== expected || tx.currency !== 'COP') {
      await query(
        "UPDATE orders SET status = 'REVIEW', wompi_tx_id = $2 WHERE id = $1 AND status NOT IN ('APPROVED','VOIDED')",
        [order.id, String(tx.id)]
      );
      return { found: true, status: 'REVIEW', mismatch: true };
    }
  }

  const updated = await query(
    `UPDATE orders
        SET status = $1::text,
            wompi_tx_id = $2,
            paid_at = CASE WHEN $1::text = 'APPROVED' THEN COALESCE(paid_at, now()) ELSE paid_at END
      WHERE reference = $3
        AND status <> 'VOIDED'
        AND status <> $1::text
        AND (status <> 'APPROVED' OR $1::text = 'VOIDED')
      RETURNING status`,
    [status, String(tx.id), reference]
  );
  return { found: true, status: updated.length ? updated[0].status : order.status };
}

module.exports = { createOrder, applyTransaction, newReference };
