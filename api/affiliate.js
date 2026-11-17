/* ===========================================================================
   Affiliate portal API.   /api/affiliate?a=<action>

     login (POST)  logout (POST)  me (GET)  change_password (POST)  summary (GET)

   An affiliate sees ONLY their own code's activity, and only what they need to
   follow their results:

     - people: first name and last initial, plus city. Never email, phone or
       street address. An affiliate who could read contact details could take
       the customers to their own shop, and those people gave their details to
       Ascent, not to a third party.
     - money: sales, the tier reached, commission, and what has been paid.

   Which code is read comes from the signed session, never from the request. A
   request cannot name another affiliate's code, so there is nothing to tamper
   with.
   =========================================================================== */

const { query } = require('./_lib/db');
const auth = require('./_lib/auth');
const aff = require('./_lib/affiliate-auth');
const { verifyPassword, verifyDecoy, hashPassword, MIN_LENGTH } = require('./_lib/password');
const { statements, totalsOf, commissionOf, TZ } = require('./_lib/commission');
const currency = require('./_lib/currency');
const { json, body, guard } = require('./_lib/http');

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/* "Laura Restrepo Gómez" -> "Laura G." ; "Laura" -> "Laura". */
function maskName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  const first = parts[0].slice(0, 30);
  if (parts.length === 1) return first;
  const last = Array.from(parts[parts.length - 1])[0];
  return `${first} ${last.toUpperCase()}.`;
}

async function peopleOf(codeId) {
  const rows = await query(
    `SELECT max(customer_name) AS name,
            (array_agg(shipping->>'city' ORDER BY created_at))[1] AS city,
            min(created_at) AS first_use, max(created_at) AS last_use,
            count(*) FILTER (WHERE status = 'APPROVED')::int AS orders_paid,
            count(*) FILTER (WHERE status = 'PENDING')::int AS orders_pending,
            COALESCE(sum(charge_cop) FILTER (WHERE status = 'APPROVED'), 0)::bigint AS total_cop
       FROM orders
      WHERE code_id = $1 AND status IN ('APPROVED', 'PENDING')
      GROUP BY lower(customer_email)
      ORDER BY max(created_at) DESC
      LIMIT 500`, [codeId]);
  return rows.map(r => ({
    name: maskName(r.name), city: r.city || '', first_use: r.first_use, last_use: r.last_use,
    orders_paid: r.orders_paid, orders_pending: r.orders_pending, total_cop: Number(r.total_cop),
    status: r.orders_paid > 0 ? 'bought' : 'pending',
  }));
}

async function ordersOf(codeId) {
  return query(
    `SELECT reference, status, created_at, paid_at, customer_name, shipping->>'city' AS city, items, charge_cop,
            to_char(paid_at AT TIME ZONE '${TZ}', 'YYYY-MM') AS pay_month
       FROM orders
      WHERE code_id = $1 AND status IN ('APPROVED', 'PENDING')
      ORDER BY created_at DESC
      LIMIT 200`, [codeId]);
}

async function summary(user) {
  const mode = user.commission_mode === 'fixed' ? 'fixed' : 'tiers';
  const { tiers, now, byCode } = await statements(
    [{ id: user.code_id, commission_pct: user.commission_pct, commission_mode: mode }], user.code_id);
  const months = byCode.get(user.code_id) || [];
  const totals = totalsOf(months);
  const [people, orders] = await Promise.all([peopleOf(user.code_id), ordersOf(user.code_id)]);
  const rateByMonth = new Map(months.map(m => [m.month, m.rate_pct]));

  /* Everything is earned in COP and shown in the affiliate's own currency. A paid
     month keeps the amount (and rate) it was actually paid at; everything still
     open is converted at today's rate and is approximate. */
  const cur = user.payout_currency;
  const rates = await currency.getRates();
  const conv = currency.converter(cur, rates);
  const perUnit = currency.copPerUnit(cur, rates);
  const frozen = m => (m.paid && m.paid.currency === cur && m.paid.amount_local != null ? m.paid.amount_local : conv(m.commission_cop));

  const c = totals.current;
  const lvl = c && c.level;
  const next = lvl && lvl.next ? { ...lvl.next, missing_local: conv(lvl.next.missing_cop), min_local: conv(lvl.next.min_cop) } : null;

  return {
    profile: { name: user.affiliate_name, email: user.email, code: user.code, active: user.active,
      discount_pct: Number(user.discount_pct), fixed_commission_pct: Number(user.commission_pct) },
    mode,
    currency: cur,
    fx: {
      currency: cur,
      cop_per_unit: perUnit,
      // where the rate came from, so an approximate figure can be labelled as such
      source: cur === 'COP' ? null : (cur === 'USD' ? rates.trm_source : (rates.trm_source === 'live' && rates.mxn_source === 'live' ? 'live' : 'estimate')),
    },
    tiers: tiers.map(t => ({ min_cop: t.min_cop, min_local: conv(t.min_cop), pct: t.pct })),
    now,
    month: c && {
      month: c.month, orders: c.orders, customers: c.customers, rate_pct: c.rate_pct,
      sales_cop: c.sales_cop, sales_local: conv(c.sales_cop),
      commission_cop: c.commission_cop, commission_local: conv(c.commission_cop),
      level: { ...lvl, next },
    },
    owed_cop: totals.owed_cop, owed_local: conv(totals.owed_cop),
    paid_cop: totals.paid_cop, paid_local: Math.round(months.filter(m => m.paid).reduce((s, m) => s + frozen(m), 0) * 100) / 100,
    lifetime_sales_cop: totals.lifetime_sales_cop, lifetime_sales_local: conv(totals.lifetime_sales_cop),
    people_used: people.length,
    people_bought: people.filter(p => p.status === 'bought').length,
    months: months.slice(0, 24).map(m => ({
      month: m.month, orders: m.orders, customers: m.customers, rate_pct: m.rate_pct,
      sales_cop: m.sales_cop, sales_local: conv(m.sales_cop),
      commission_cop: m.commission_cop, commission_local: frozen(m),
      status: m.paid ? 'paid' : (m.open ? 'open' : 'due'), paid_at: m.paid ? m.paid.at : null,
    })),
    people: people.map(p => ({ ...p, total_local: conv(p.total_cop) })),
    orders: orders.map(o => {
      // the commission this order earns at its month's rate (provisional while the month is open)
      const comm = o.status === 'APPROVED' && rateByMonth.has(o.pay_month) ? commissionOf(o.charge_cop, rateByMonth.get(o.pay_month)) : 0;
      return {
        reference: o.reference, status: o.status, created_at: o.created_at,
        who: maskName(o.customer_name), city: o.city || '',
        items: (o.items || []).map(l => ({ name: l.name, size: l.size, qty: l.qty })),
        charge_cop: Number(o.charge_cop), charge_local: conv(o.charge_cop),
        commission_cop: comm, commission_local: conv(comm),
      };
    }),
  };
}

module.exports = guard(async (req, res) => {
  const a = String((req.query && req.query.a) || '');
  const isPost = req.method === 'POST';
  if (!process.env.ADMIN_PASSWORD) return json(res, 503, { error: 'not_configured' });
  if (isPost && !auth.sameOrigin(req)) return json(res, 403, { error: 'bad_origin' });

  if (a === 'login' && isPost) {
    const b = body(req);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 254);
    const password = String(b.password || '').slice(0, 200);
    const keys = [`aff-ip:${auth.clientIp(req)}`, `aff-mail:${email}`];
    for (const k of keys) if (await auth.lockedOut(k)) return json(res, 429, { error: 'too_many_attempts' });

    const rows = EMAIL.test(email)
      ? await query(
        `SELECT au.id, au.password_hash, au.must_change, c.active FROM affiliate_users au
           JOIN codes c ON c.id = au.code_id WHERE au.email = $1`, [email])
      : [];
    const user = rows[0];
    // the same work whether or not the account exists, and the same answer
    const ok = user ? await verifyPassword(password, user.password_hash) : (await verifyDecoy(password), false);
    if (!ok) {
      for (const k of keys) await auth.recordFail(k);
      return json(res, 401, { error: 'wrong_credentials' });
    }
    await query('UPDATE affiliate_users SET last_login_at = now() WHERE id = $1', [user.id]);
    return json(res, 200, { ok: true, must_change: user.must_change }, { 'Set-Cookie': aff.sessionCookie(req, user) });
  }

  if (a === 'logout' && isPost) return json(res, 200, { ok: true }, { 'Set-Cookie': aff.clearCookie() });

  const user = await aff.currentUser(req);
  if (a === 'me') {
    return json(res, 200, user ? { authed: true, must_change: user.must_change, name: user.affiliate_name } : { authed: false });
  }
  if (!user) return json(res, 401, { error: 'unauthorized' });

  if (a === 'change_password' && isPost) {
    const b = body(req);
    if (!(await verifyPassword(String(b.current || ''), user.password_hash))) return json(res, 400, { error: 'wrong_current' });
    const next = String(b.next || '');
    if (next.length < MIN_LENGTH || next.length > 200) return json(res, 400, { error: 'weak_password' });
    if (next === String(b.current)) return json(res, 400, { error: 'same_password' });
    const hash = await hashPassword(next);
    await query('UPDATE affiliate_users SET password_hash = $1, must_change = false WHERE id = $2', [hash, user.id]);
    // the old cookie dies with the old hash; hand back one for the new one
    return json(res, 200, { ok: true }, { 'Set-Cookie': aff.sessionCookie(req, { id: user.id, password_hash: hash }) });
  }

  if (a === 'summary' && !isPost) {
    if (user.must_change) return json(res, 403, { error: 'must_change_password' });
    return json(res, 200, await summary(user));
  }

  json(res, 404, { error: 'not_found' });
});
