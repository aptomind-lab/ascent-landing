/* ===========================================================================
   Admin API. One endpoint, many actions:  /api/admin?a=<action>

     auth        login (POST)  logout (POST)  me (GET)
     stock       products (GET)  stock_set (POST)
     affiliates  affiliates (GET)  code_save (POST)  code_delete (POST)
                 statement (GET)  pay_month (POST)  unpay_month (POST)
                 affiliate_user_save (POST)  affiliate_user_delete (POST)  sponsor_set (POST)
                 tiers_set (POST)  mxn_set (POST)
     orders      orders (GET)  orders_csv (GET)
     settings    settings (GET)  settings_set (POST)

   Everything except login and `me` requires the session cookie. Every POST must
   be same-origin JSON. Money in every report is pesos (what Wompi charged and
   what commissions are paid on); the buyer-facing currency is shown alongside.
   =========================================================================== */

const { query } = require('./_lib/db');
const catalog = require('./_lib/catalog');
const auth = require('./_lib/auth');
const { getTrm, getMxn } = require('./_lib/fx');
const { hashPassword, tempPassword } = require('./_lib/password');
const commission = require('./_lib/commission');
const currency = require('./_lib/currency');
const { json, body, guard } = require('./_lib/http');

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

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

/* Lifetime activity per code, plus whether it has a portal login. Commission is
   NOT summed here: it depends on the month and the tiers, so it comes from
   commission.statements(). */
const AFFILIATE_SQL = `
  SELECT c.id, c.code, c.affiliate_name, c.affiliate_contact, c.discount_pct, c.commission_pct,
         c.commission_mode, c.payout_currency, c.active, c.created_at,
         au.id IS NOT NULL AS has_access, au.email AS access_email, au.last_login_at, au.must_change,
         au.signup_source, COALESCE(sp.name, spc.affiliate_name) AS sponsor_name, spc.code AS sponsor_code,
         (SELECT t.version FROM terms_acceptances t WHERE t.user_id = au.id ORDER BY t.accepted_at DESC LIMIT 1) AS terms_version,
         count(o.id)::int                                                       AS orders_started,
         count(o.id) FILTER (WHERE o.status = 'APPROVED')::int                  AS orders_paid,
         count(DISTINCT lower(o.customer_email))::int                           AS customers_started,
         count(DISTINCT lower(o.customer_email)) FILTER (WHERE o.status = 'APPROVED')::int AS customers_paid,
         COALESCE(sum(o.charge_cop)   FILTER (WHERE o.status = 'APPROVED'), 0)::bigint AS sales_cop,
         COALESCE(sum(o.discount_cop) FILTER (WHERE o.status = 'APPROVED'), 0)::bigint AS discounts_cop
    FROM codes c
    LEFT JOIN affiliate_users au ON au.code_id = c.id
    LEFT JOIN affiliate_users sp ON sp.id = au.sponsor_user_id
    LEFT JOIN codes spc ON spc.id = sp.code_id
    LEFT JOIN orders o ON o.code_id = c.id
   GROUP BY c.id, au.id, sp.id, spc.id
   ORDER BY c.active DESC, sales_cop DESC, c.created_at DESC`;

async function listAffiliates() {
  const rows = await query(AFFILIATE_SQL);
  const { tiers, now, byCode } = await commission.statements(
    rows.map(r => ({ id: r.id, commission_pct: r.commission_pct, commission_mode: r.commission_mode })));
  const rates = await currency.getRates();
  return {
    tiers, now, rates,
    affiliates: rows.map(r => {
      const t = commission.totalsOf(byCode.get(r.id) || []);
      const conv = currency.converter(r.payout_currency, rates);
      return {
        ...r, current: t.current, owed_cop: t.owed_cop, paid_cop: t.paid_cop,
        // the same figures in the affiliate's own currency, for the admin's reference
        local: { currency: r.payout_currency, owed: conv(t.owed_cop), month_commission: conv(t.current ? t.current.commission_cop : 0) },
      };
    }),
  };
}

/* Create a portal login, or issue a fresh temporary password for an existing
   one. The password is returned ONCE here and stored only as a hash. */
async function saveAffiliateUser(b) {
  const codeId = Number(b.code_id);
  const email = text(b.email, 254).toLowerCase();
  if (!Number.isInteger(codeId)) return { error: 'bad_id' };
  if (!EMAIL.test(email)) return { error: 'bad_email' };
  const exists = await query('SELECT 1 FROM codes WHERE id = $1', [codeId]);
  if (!exists.length) return { error: 'not_found' };
  const password = tempPassword();
  const hash = await hashPassword(password);
  try {
    await query(
      `INSERT INTO affiliate_users (code_id, email, password_hash, must_change) VALUES ($1, $2, $3, true)
         ON CONFLICT (code_id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, must_change = true`,
      [codeId, email, hash]
    );
  } catch (e) {
    if (e && e.code === '23505') return { error: 'email_taken' };
    throw e;
  }
  return { ok: true, email, password };
}

/* Mark one closed month as paid out. The amount is computed here, from the
   server's own numbers, and frozen: the request names only the month. */
/* The owner assigns, changes or removes an affiliate's sponsor. (People cannot change it
   themselves.) It cannot be the person themselves, and it cannot create a loop: nobody may
   end up above their own sponsor. Every change is written to sponsor_changes. */
async function setSponsor(b) {
  const codeId = Number(b.code_id);
  if (!Number.isInteger(codeId)) return { error: 'bad_id' };
  const me = await query('SELECT id, sponsor_user_id FROM affiliate_users WHERE code_id = $1', [codeId]);
  if (!me.length) return { error: 'no_access' };
  const user = me[0];

  let newId = null, newName = null;
  const raw = String(b.sponsor_code || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
  if (raw) {
    const sp = await query(
      `SELECT au.id, COALESCE(au.name, c.affiliate_name) AS name FROM affiliate_users au JOIN codes c ON c.id = au.code_id
        WHERE au.ref_code = $1 OR c.code = $1 LIMIT 1`, [raw]);
    if (!sp.length) return { error: 'bad_sponsor' };
    newId = sp[0].id; newName = sp[0].name;
    if (newId === user.id) return { error: 'self_sponsor' };
    // walk up from the new sponsor: reaching this person would close a circle
    let at = newId;
    for (let i = 0; i < 100 && at; i++) {
      const up = await query('SELECT sponsor_user_id FROM affiliate_users WHERE id = $1', [at]);
      at = up.length ? up[0].sponsor_user_id : null;
      if (at === user.id) return { error: 'would_loop' };
    }
  }
  if (newId === user.sponsor_user_id) return { ok: true, sponsor: newName, unchanged: true };
  await query('UPDATE affiliate_users SET sponsor_user_id = $1 WHERE id = $2', [newId, user.id]);
  await query('INSERT INTO sponsor_changes (user_id, old_sponsor_id, new_sponsor_id) VALUES ($1, $2, $3)', [user.id, user.sponsor_user_id, newId]);
  return { ok: true, sponsor: newName };
}

async function payMonth(b) {
  const codeId = Number(b.code_id);
  const month = text(b.month, 7);
  if (!Number.isInteger(codeId) || !/^\d{4}-\d{2}$/.test(month)) return { error: 'bad_value' };
  const codes = await query('SELECT id, commission_pct, commission_mode, payout_currency FROM codes WHERE id = $1', [codeId]);
  if (!codes.length) return { error: 'not_found' };
  const { byCode, now } = await commission.statements(codes, codeId);
  const m = (byCode.get(codeId) || []).find(x => x.month === month);
  if (!m) return { error: 'no_such_month' };
  if (month >= now) return { error: 'month_open' };            // a month is paid once it has closed
  if (m.paid) return { error: 'already_paid' };
  if (m.commission_cop <= 0) return { error: 'nothing_to_pay' };

  // freeze the amount in the affiliate's own currency, with the rate that produced it
  const cur = codes[0].payout_currency;
  const rates = await currency.getRates();
  const rate = currency.copPerUnit(cur, rates);
  const local = currency.converter(cur, rates)(m.commission_cop);
  await query(
    `INSERT INTO commission_payouts (code_id, month, sales_cop, rate_pct, amount_cop, currency, amount_local, fx_rate)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [codeId, month, m.sales_cop, m.rate_pct, m.commission_cop, cur, local, rate]
  );
  return { ok: true, amount_cop: m.commission_cop, currency: cur, amount_local: local, fx_rate: rate };
}

async function saveCode(b) {
  const code = text(b.code, 40).toUpperCase().replace(/\s+/g, '');
  const name = text(b.affiliate_name, 120);
  const discount = pct(b.discount_pct);
  if (!CODE_RE.test(code)) return { error: 'bad_code' };
  if (!name) return { error: 'bad_name' };
  if (discount === null) return { error: 'bad_discount' };

  /* How this affiliate's commission is worked out and which currency they see.
     On an UPDATE, a field that is not sent is left exactly as it was; only a
     field that is sent and invalid is an error. */
  const given = v => v !== undefined && v !== null && v !== '';
  let mode = null;
  if (given(b.commission_mode)) {
    mode = String(b.commission_mode);
    if (mode !== 'tiers' && mode !== 'fixed' && mode !== 'plan') return { error: 'bad_mode' };
  }
  let cur = null;
  if (given(b.payout_currency)) {
    cur = String(b.payout_currency).toUpperCase();
    if (!currency.isCurrency(cur)) return { error: 'bad_currency' };
  }
  const fixed = pct(b.commission_pct);                     // null when absent or invalid
  if (given(b.commission_pct) && fixed === null) return { error: 'bad_commission' };
  if (mode === 'fixed' && fixed === null && !b.id) return { error: 'bad_commission' };

  const active = b.active !== false;
  const contact = text(b.affiliate_contact, 200) || null;
  try {
    if (b.id) {
      const rows = await query(
        `UPDATE codes SET code=$2, affiliate_name=$3, affiliate_contact=$4, discount_pct=$5, active=$6,
                commission_pct = COALESCE($7, commission_pct),
                commission_mode = COALESCE($8, commission_mode),
                payout_currency = COALESCE($9, payout_currency)
          WHERE id=$1 RETURNING id`,
        [Number(b.id), code, name, contact, discount, active, fixed, mode, cur]
      );
      return rows.length ? { ok: true, id: rows[0].id } : { error: 'not_found' };
    }
    const rows = await query(
      `INSERT INTO codes (code, affiliate_name, affiliate_contact, discount_pct, commission_pct, active, commission_mode, payout_currency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [code, name, contact, discount, fixed === null ? 0 : fixed, active, mode || 'plan', cur || 'COP']
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
  await query('DELETE FROM affiliate_users WHERE code_id = $1', [id]);
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
  o.code_id, o.code_text,
  o.customer_name, o.customer_email, o.customer_phone, o.shipping,
  o.wompi_tx_id, o.paid_at, o.created_at,
  to_char(o.paid_at AT TIME ZONE '${commission.TZ}', 'YYYY-MM') AS pay_month,
  c.affiliate_name`;

/* An order's commission is its share of the month's commission: the month's rate
   (the tier reached, or the paid-out rate once the month is settled) applied to
   what this order charged. Provisional while the month is open. */
async function withCommission(rows) {
  const codes = await query('SELECT id, commission_pct, commission_mode FROM codes');
  const { byCode } = await commission.statements(codes);
  return rows.map(o => {
    if (o.status !== 'APPROVED' || !o.code_id || !o.pay_month) {
      return { ...o, commission_pct: 0, commission_cop: 0, commission_state: null };
    }
    const m = (byCode.get(o.code_id) || []).find(x => x.month === o.pay_month);
    const rate = m ? m.rate_pct : 0;
    return {
      ...o, commission_pct: rate, commission_cop: commission.commissionOf(o.charge_cop, rate),
      commission_state: !m ? null : (m.paid ? 'paid' : (m.open ? 'open' : 'due')),
    };
  });
}

async function listOrders(q) {
  const f = orderFilter(q);
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 100, 1), MAX_ROWS);
  const offset = Math.max(parseInt(q.offset, 10) || 0, 0);
  const rows = await withCommission(await query(
    `SELECT ${ORDER_COLS} FROM orders o LEFT JOIN codes c ON c.id = o.code_id
      ${f.sql} ORDER BY o.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    f.params
  ));
  // totals count only money that moved: PAID orders
  const sums = await query(
    `SELECT count(*)::int AS orders,
            COALESCE(sum(o.subtotal_cop), 0)::bigint   AS subtotal_cop,
            COALESCE(sum(o.discount_cop), 0)::bigint   AS discount_cop,
            COALESCE(sum(o.charge_cop), 0)::bigint     AS charge_cop
       FROM orders o ${f.sql ? `${f.sql} AND` : 'WHERE'} o.status = 'APPROVED'`,
    f.params
  );
  const count = await query(`SELECT count(*)::int AS n FROM orders o ${f.sql}`, f.params);
  // the commission total for the filter comes from the same per-order figures as the rows
  const approved = await withCommission(await query(
    `SELECT ${ORDER_COLS} FROM orders o LEFT JOIN codes c ON c.id = o.code_id
      ${f.sql ? `${f.sql} AND` : 'WHERE'} o.status = 'APPROVED'`, f.params));
  const paid = { ...sums[0], commission_cop: approved.reduce((s, o) => s + o.commission_cop, 0) };
  return { rows, total: count[0].n, paid };
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
    'estado_comision', 'moneda_local', 'total_local'];
  const lines = rows.map(o => [
    new Date(o.created_at).toISOString(), o.reference, o.status, o.market, o.customer_name, o.customer_email,
    o.code_text, o.affiliate_name, o.subtotal_cop, o.discount_pct, o.discount_cop, o.charge_cop,
    o.commission_pct, o.commission_cop, { paid: 'pagada', due: 'por pagar', open: 'mes en curso' }[o.commission_state] || '',
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

  if (a === 'affiliates' && !isPost) return json(res, 200, await listAffiliates());
  if (a === 'code_save' && isPost) {
    const r = await saveCode(body(req));
    return r.error ? json(res, r.error === 'code_taken' ? 409 : 400, { error: r.error }) : json(res, 200, r);
  }
  if (a === 'code_delete' && isPost) {
    const r = await deleteCode(body(req));
    return r.error ? json(res, r.error === 'has_orders' ? 409 : 400, { error: r.error }) : json(res, 200, r);
  }

  // a month's statement for one affiliate, and marking a closed month as paid out
  if (a === 'statement' && !isPost) {
    const id = Number((req.query || {}).code_id);
    if (!Number.isInteger(id)) return bad(res, 'bad_id');
    const codes = await query('SELECT id, commission_pct, commission_mode, payout_currency FROM codes WHERE id = $1', [id]);
    if (!codes.length) return json(res, 404, { error: 'not_found' });
    const { tiers, now, byCode } = await commission.statements(codes, id);
    // every month also in the affiliate's own currency: frozen if paid, today's rate if not
    const rates = await currency.getRates();
    const cur = codes[0].payout_currency;
    const conv = currency.converter(cur, rates);
    const months = (byCode.get(id) || []).map(m => ({
      ...m,
      commission_local: m.paid && m.paid.currency === cur && m.paid.amount_local != null ? m.paid.amount_local : conv(m.commission_cop),
    }));
    return json(res, 200, { tiers, now, months, currency: cur, mode: codes[0].commission_mode, rates,
      cop_per_unit: currency.copPerUnit(cur, rates) });
  }
  if ((a === 'pay_month' || a === 'unpay_month') && isPost) {
    if (a === 'pay_month') {
      const r = await payMonth(body(req));
      return r.error ? json(res, r.error === 'already_paid' ? 409 : 400, { error: r.error }) : json(res, 200, r);
    }
    const b = body(req);
    const gone = await query('DELETE FROM commission_payouts WHERE code_id = $1 AND month = $2 RETURNING id',
      [Number(b.code_id), text(b.month, 7)]);
    return gone.length ? json(res, 200, { ok: true }) : json(res, 404, { error: 'not_found' });
  }

  // portal logins for affiliates
  if (a === 'affiliate_user_save' && isPost) {
    const r = await saveAffiliateUser(body(req));
    return r.error ? json(res, r.error === 'email_taken' ? 409 : 400, { error: r.error }) : json(res, 200, r);
  }
  if (a === 'sponsor_set' && isPost) {
    const r = await setSponsor(body(req));
    return r.error ? json(res, r.error === 'no_access' ? 404 : 400, { error: r.error }) : json(res, 200, r);
  }
  if (a === 'affiliate_user_delete' && isPost) {
    const gone = await query('DELETE FROM affiliate_users WHERE code_id = $1 RETURNING id', [Number(body(req).code_id)]);
    return gone.length ? json(res, 200, { ok: true }) : json(res, 404, { error: 'not_found' });
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
    const mxn = await getMxn();
    const pins = await query("SELECT key, value FROM settings WHERE key IN ('trm_override', 'mxn_override')");
    const pin = k => { const r = pins.find(x => x.key === k); return r ? Number(r.value) : null; };
    return json(res, 200, {
      trm, trm_override: pin('trm_override'),
      mxn, mxn_override: pin('mxn_override'),
      tiers: await commission.getTiers(),
      tiers_custom: await commission.isCustomSchedule(),
      standard_tiers: commission.DEFAULT_TIERS,
    });
  }
  // Mexican pesos per 1 USD, used only to show affiliates their commission in MXN
  if (a === 'mxn_set' && isPost) {
    const v = body(req).mxn_override;
    if (v === null || v === '') {
      await query("DELETE FROM settings WHERE key = 'mxn_override'");
      return json(res, 200, { ok: true });
    }
    const n = Number(v);
    if (!isFinite(n) || n < 5 || n > 60) return bad(res, 'bad_rate');
    await query(
      `INSERT INTO settings (key, value) VALUES ('mxn_override', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [String(n)]
    );
    return json(res, 200, { ok: true });
  }
  if (a === 'tiers_set' && isPost) {
    const r = commission.validateTiers(body(req).tiers);
    if (r.error) return bad(res, r.error);
    if (!r.tiers.length) {
      await query("DELETE FROM settings WHERE key = 'commission_tiers'");
    } else {
      await query(
        `INSERT INTO settings (key, value) VALUES ('commission_tiers', $1)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [JSON.stringify(r.tiers)]
      );
    }
    return json(res, 200, { ok: true, tiers: r.tiers });
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
