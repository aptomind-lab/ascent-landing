/* ===========================================================================
   Admin API. One endpoint, many actions:  /api/admin?a=<action>

     auth        login (POST)  logout (POST)  me (GET)
     stock       products (GET)  stock_set (POST)
     affiliates  affiliates (GET)  code_save (POST)  code_delete (POST)
                 pay_commissions (POST)  order_commission (POST)
     orders      orders (GET)  orders_csv (GET)
     settings    settings (GET)  settings_set (POST)

   Everything except login and `me` requires the session cookie. Every POST must
   be same-origin JSON. Money in every report is pesos (what Wompi charged and
   what commissions are paid on); the buyer-facing currency is shown alongside.
   =========================================================================== */

const { query } = require('./_lib/db');
const catalog = require('./_lib/catalog');
const auth = require('./_lib/auth');
const { getTrm } = require('./_lib/fx');
const { json, body, guard } = require('./_lib/http');

const CODE_RE = /^[A-Z0-9_-]{3,32}$/;
const STATUSES = ['PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR', 'REVIEW'];
const MAX_ROWS = 500;

const bad = (res, error, extra) => json(res, 400, { error, ...extra });
const pct = v => { const n = Number(v); return isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null; };
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/* ------------------------------------------------------------------ stock */

function productRows(off) {
  return catalog.PRODUCTS.map(p => {
    const k = catalog.key(p.n, p.s);
    const markets = {};
    for (const m of Object.keys(catalog.MARKETS)) {
      markets[m] = { carries: catalog.carries(m, p.n, p.s), shelf: catalog.onShelf(m, p.n, p.s) };
    }
    return { key: k, name: p.n, size: p.s, category: p.c, usd: p.p, available: !off.has(k), markets };
  });
}

async function setStock(b) {
  const keys = Array.isArray(b.keys) ? b.keys : [b.key];
  const valid = keys.filter(k => typeof k === 'string' && catalog.PRODUCTS.some(p => catalog.key(p.n, p.s) === k));
  if (!valid.length || valid.length !== keys.length) return { error: 'unknown_product' };
  if (typeof b.available !== 'boolean') return { error: 'bad_value' };
  if (b.available) {
    await query('DELETE FROM stock_off WHERE key = ANY($1::text[])', [valid]);
  } else {
    await query(
      `INSERT INTO stock_off (key) SELECT unnest($1::text[])
         ON CONFLICT (key) DO UPDATE SET updated_at = now()`,
      [valid]
    );
  }
  return { ok: true, changed: valid.length };
}

/* -------------------------------------------------------------- affiliates */

const AFFILIATE_SQL = `
  SELECT c.id, c.code, c.affiliate_name, c.affiliate_contact, c.discount_pct, c.commission_pct,
         c.active, c.created_at,
         count(o.id)::int                                                       AS orders_started,
         count(o.id) FILTER (WHERE o.status = 'APPROVED')::int                  AS orders_paid,
         count(DISTINCT lower(o.customer_email))::int                           AS customers_started,
         count(DISTINCT lower(o.customer_email)) FILTER (WHERE o.status = 'APPROVED')::int AS customers_paid,
         COALESCE(sum(o.charge_cop)     FILTER (WHERE o.status = 'APPROVED'), 0)::bigint AS sales_cop,
         COALESCE(sum(o.discount_cop)   FILTER (WHERE o.status = 'APPROVED'), 0)::bigint AS discounts_cop,
         COALESCE(sum(o.commission_cop) FILTER (WHERE o.status = 'APPROVED'), 0)::bigint AS commission_cop,
         COALESCE(sum(o.commission_cop) FILTER (WHERE o.status = 'APPROVED' AND o.commission_paid_at IS NOT NULL), 0)::bigint AS commission_paid_cop
    FROM codes c
    LEFT JOIN orders o ON o.code_id = c.id
   GROUP BY c.id
   ORDER BY c.active DESC, sales_cop DESC, c.created_at DESC`;

async function saveCode(b) {
  const code = text(b.code, 40).toUpperCase().replace(/\s+/g, '');
  const name = text(b.affiliate_name, 120);
  const discount = pct(b.discount_pct);
  const commission = pct(b.commission_pct);
  if (!CODE_RE.test(code)) return { error: 'bad_code' };
  if (!name) return { error: 'bad_name' };
  if (discount === null) return { error: 'bad_discount' };
  if (commission === null) return { error: 'bad_commission' };
  const active = b.active !== false;
  const contact = text(b.affiliate_contact, 200) || null;
  try {
    if (b.id) {
      const rows = await query(
        `UPDATE codes SET code=$2, affiliate_name=$3, affiliate_contact=$4, discount_pct=$5, commission_pct=$6, active=$7
          WHERE id=$1 RETURNING id`,
        [Number(b.id), code, name, contact, discount, commission, active]
      );
      return rows.length ? { ok: true, id: rows[0].id } : { error: 'not_found' };
    }
    const rows = await query(
      `INSERT INTO codes (code, affiliate_name, affiliate_contact, discount_pct, commission_pct, active)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [code, name, contact, discount, commission, active]
    );
    return { ok: true, id: rows[0].id };
  } catch (e) {
    if (e && e.code === '23505') return { error: 'code_taken' };
    throw e;
  }
}

async function deleteCode(b) {
  const id = Number(b.id);
  if (!Number.isInteger(id)) return { error: 'bad_id' };
  const used = await query('SELECT 1 FROM orders WHERE code_id = $1 LIMIT 1', [id]);
  // a code with history is deactivated, never deleted: its orders and the
  // commissions owed on them have to stay attributable
  if (used.length) return { error: 'has_orders' };
  const gone = await query('DELETE FROM codes WHERE id = $1 RETURNING id', [id]);
  return gone.length ? { ok: true } : { error: 'not_found' };
}

/* ------------------------------------------------------------------ orders */

/* Shared by the table and the CSV so both always agree on what a filter means.
   Returns a WHERE clause and its parameters. */
function orderFilter(q) {
  const where = [];
  const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (q.status && STATUSES.includes(String(q.status).toUpperCase())) add('o.status = ?', String(q.status).toUpperCase());
  if (q.code_id && Number.isInteger(Number(q.code_id))) add('o.code_id = ?', Number(q.code_id));
  if (q.no_code === '1') where.push('o.code_id IS NULL');
  if (q.from && !isNaN(Date.parse(q.from))) add('o.created_at >= ?', new Date(q.from).toISOString());
  if (q.to && !isNaN(Date.parse(q.to))) add('o.created_at < ?', new Date(Date.parse(q.to) + 86400000).toISOString());
  if (q.q) {
    const like = `%${String(q.q).slice(0, 80).replace(/[%_\\]/g, '\\$&')}%`;
    params.push(like);
    const n = params.length;
    where.push(`(o.reference ILIKE $${n} OR o.customer_email ILIKE $${n} OR o.customer_name ILIKE $${n})`);
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const ORDER_COLS = `
  o.id, o.reference, o.status, o.market, o.currency, o.items,
  o.subtotal_local, o.discount_pct, o.discount_local, o.total_local, o.trm,
  o.subtotal_cop, o.discount_cop, o.charge_cop,
  o.code_id, o.code_text, o.commission_pct, o.commission_cop,
  o.customer_name, o.customer_email, o.customer_phone, o.shipping,
  o.wompi_tx_id, o.paid_at, o.commission_paid_at, o.created_at,
  c.affiliate_name`;

async function listOrders(q) {
  const f = orderFilter(q);
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 100, 1), MAX_ROWS);
  const offset = Math.max(parseInt(q.offset, 10) || 0, 0);
  const rows = await query(
    `SELECT ${ORDER_COLS} FROM orders o LEFT JOIN codes c ON c.id = o.code_id
      ${f.sql} ORDER BY o.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    f.params
  );
  // totals count only money that moved: PAID orders
  const sums = await query(
    `SELECT count(*)::int AS orders,
            COALESCE(sum(o.subtotal_cop), 0)::bigint   AS subtotal_cop,
            COALESCE(sum(o.discount_cop), 0)::bigint   AS discount_cop,
            COALESCE(sum(o.charge_cop), 0)::bigint     AS charge_cop,
            COALESCE(sum(o.commission_cop), 0)::bigint AS commission_cop
       FROM orders o ${f.sql ? `${f.sql} AND` : 'WHERE'} o.status = 'APPROVED'`,
    f.params
  );
  const count = await query(`SELECT count(*)::int AS n FROM orders o ${f.sql}`, f.params);
  return { rows, total: count[0].n, paid: sums[0] };
}

const csvCell = v => {
  let s = v == null ? '' : String(v);
  // a cell that begins with = + - @ is a formula to a spreadsheet; neutralise it
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function toCsv(rows) {
  const head = ['fecha', 'referencia', 'estado', 'mercado', 'cliente', 'email', 'codigo', 'afiliado',
    'subtotal_cop', 'descuento_pct', 'descuento_cop', 'total_cobrado_cop', 'comision_pct', 'comision_cop',
    'comision_pagada', 'moneda_local', 'total_local'];
  const lines = rows.map(o => [
    new Date(o.created_at).toISOString(), o.reference, o.status, o.market, o.customer_name, o.customer_email,
    o.code_text, o.affiliate_name, o.subtotal_cop, o.discount_pct, o.discount_cop, o.charge_cop,
    o.commission_pct, o.commission_cop, o.commission_paid_at ? new Date(o.commission_paid_at).toISOString() : '',
    o.currency, o.total_local,
  ].map(csvCell).join(','));
  return [head.join(','), ...lines].join('\n');
}

/* ----------------------------------------------------------------- handler */

module.exports = guard(async (req, res) => {
  const a = String((req.query && req.query.a) || '');
  const isPost = req.method === 'POST';

  if (isPost && !auth.sameOrigin(req)) return json(res, 403, { error: 'bad_origin' });

  // ---- public auth endpoints
  if (a === 'login' && isPost) {
    if (!process.env.ADMIN_PASSWORD) return json(res, 503, { error: 'admin_not_configured' });
    const ip = auth.clientIp(req);
    if (await auth.lockedOut(ip)) return json(res, 429, { error: 'too_many_attempts' });
    if (!auth.passwordMatches(body(req).password)) {
      await auth.recordFail(ip);
      return json(res, 401, { error: 'wrong_password' });
    }
    return json(res, 200, { ok: true }, { 'Set-Cookie': auth.sessionCookie(req) });
  }
  if (a === 'logout' && isPost) return json(res, 200, { ok: true }, { 'Set-Cookie': auth.clearCookie() });
  if (a === 'me') return json(res, 200, { authed: auth.isAuthed(req) });

  // ---- everything below needs a session
  if (!auth.isAuthed(req)) return json(res, 401, { error: 'unauthorized' });

  if (a === 'products' && !isPost) {
    const off = new Set((await query('SELECT key FROM stock_off')).map(r => r.key));
    return json(res, 200, { products: productRows(off), markets: Object.keys(catalog.MARKETS) });
  }
  if (a === 'stock_set' && isPost) {
    const r = await setStock(body(req));
    return r.error ? bad(res, r.error) : json(res, 200, r);
  }

  if (a === 'affiliates' && !isPost) return json(res, 200, { affiliates: await query(AFFILIATE_SQL) });
  if (a === 'code_save' && isPost) {
    const r = await saveCode(body(req));
    return r.error ? json(res, r.error === 'code_taken' ? 409 : 400, { error: r.error }) : json(res, 200, r);
  }
  if (a === 'code_delete' && isPost) {
    const r = await deleteCode(body(req));
    return r.error ? json(res, r.error === 'has_orders' ? 409 : 400, { error: r.error }) : json(res, 200, r);
  }

  if (a === 'pay_commissions' && isPost) {
    const id = Number(body(req).code_id);
    if (!Number.isInteger(id)) return bad(res, 'bad_id');
    const rows = await query(
      `UPDATE orders SET commission_paid_at = now()
        WHERE code_id = $1 AND status = 'APPROVED' AND commission_paid_at IS NULL AND commission_cop > 0
        RETURNING commission_cop`,
      [id]
    );
    return json(res, 200, { ok: true, orders: rows.length, amount_cop: rows.reduce((s, r) => s + Number(r.commission_cop), 0) });
  }
  if (a === 'order_commission' && isPost) {
    const b = body(req);
    const id = Number(b.id);
    if (!Number.isInteger(id) || typeof b.paid !== 'boolean') return bad(res, 'bad_value');
    const rows = await query(
      `UPDATE orders SET commission_paid_at = ${b.paid ? 'COALESCE(commission_paid_at, now())' : 'NULL'}
        WHERE id = $1 AND status = 'APPROVED' RETURNING id`,
      [id]
    );
    return rows.length ? json(res, 200, { ok: true }) : json(res, 404, { error: 'not_found' });
  }

  if (a === 'orders' && !isPost) return json(res, 200, await listOrders(req.query || {}));
  if (a === 'orders_csv' && !isPost) {
    const { rows } = await listOrders({ ...(req.query || {}), limit: MAX_ROWS });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="pedidos-ascent.csv"');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(toCsv(rows));
  }

  if (a === 'settings' && !isPost) {
    const trm = await getTrm();
    const pinned = await query("SELECT value FROM settings WHERE key = 'trm_override'");
    return json(res, 200, { trm, trm_override: pinned.length ? Number(pinned[0].value) : null });
  }
  if (a === 'settings_set' && isPost) {
    const v = body(req).trm_override;
    if (v === null || v === '') {
      await query("DELETE FROM settings WHERE key = 'trm_override'");
      return json(res, 200, { ok: true });
    }
    const n = Number(v);
    if (!isFinite(n) || n < 1000 || n > 20000) return bad(res, 'bad_rate');
    await query(
      `INSERT INTO settings (key, value) VALUES ('trm_override', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [String(n)]
    );
    return json(res, 200, { ok: true });
  }

  json(res, 404, { error: 'not_found' });
});
