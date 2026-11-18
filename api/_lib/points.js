/* ===========================================================================
   The Points engine.

   Vocabulary (what the screens call things):
     Volumen del mes   what an affiliate bought for themselves plus what their
                       customers bought with their code, in MXN, in one calendar
                       month (Colombia time), counted by the day payment was approved.
     Optimización      the level that Volumen del mes reaches: 0 = not active,
                       1 = the floor (10 %), up to the cap (35 %).
     Puntos            1 Point = 1 MXN. Earned as a percentage of every order of the
                       month, delivered when the month is closed, usable after
                       wait_days. Only exchangeable for products.

   Two layers:
     - pure functions (rateFor, nextTarget, computeMonth): numbers in, numbers out,
       no database, so the rules can be tested with plain examples;
     - database functions (previewMonth, closeMonth, portalView, balance...).

   The Points ledger only ever gets new rows. A mistake is corrected by a new
   "adjust" row, never by editing or deleting one (the database refuses both).
   =========================================================================== */

const { query } = require('./db');
const plan = require('./plan');
const currency = require('./currency');
const { TZ, monthNow } = require('./commission');

/* ---------------------------------------------------------------- calendar */

const monthIndex = m => { const [y, mo] = String(m).split('-').map(Number); return y * 12 + (mo - 1); };
const monthFromIndex = i => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
const addMonths = (m, n) => monthFromIndex(monthIndex(m) + n);
const isMonth = m => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m));

/* The last calendar day of a month, as YYYY-MM-DD. */
function lastDayOf(month) {
  const [y, mo] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`;
}

/* Days left in the current month, counting today (Colombia time). */
function daysLeftIn(month, now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [y, mo, d] = p.split('-').map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return `${y}-${String(mo).padStart(2, '0')}` === month ? last - d + 1 : 0;
}

/* --------------------------------------------------------------- the rules */

/* The percentage for a month's volume. At or above the activation volume it is the
   floor plus one step for each full step above it, up to the cap. Below it, an
   affiliate whose floor is still running keeps the floor; anyone else earns 0. */
function rateFor(volume, floorActive, cfg) {
  if (volume >= cfg.activation_mxn) {
    const steps = Math.floor((volume - cfg.activation_mxn) / cfg.step_mxn);
    return Math.min(cfg.cap_pct, round2(cfg.floor_pct + steps * cfg.step_pct));
  }
  return floorActive ? cfg.floor_pct : 0;
}

const round2 = n => Math.round(n * 100) / 100;

const maxLevel = cfg => 1 + Math.ceil((cfg.cap_pct - cfg.floor_pct) / cfg.step_pct);

function levelOf(rate, cfg) {
  if (rate <= 0) return 0;
  if (rate >= cfg.cap_pct) return maxLevel(cfg);
  return 1 + Math.round((rate - cfg.floor_pct) / cfg.step_pct);
}

/* The next volume at which the percentage goes up, and how far away it is. */
function nextTarget(volume, rate, cfg) {
  if (rate >= cfg.cap_pct) return null;
  let at;
  if (volume < cfg.activation_mxn) at = rate >= cfg.floor_pct ? cfg.activation_mxn + cfg.step_mxn : cfg.activation_mxn;
  else at = cfg.activation_mxn + (Math.floor((volume - cfg.activation_mxn) / cfg.step_mxn) + 1) * cfg.step_mxn;
  const pct = rateFor(at, false, cfg);
  return { volume: at, pct, missing: round2(at - volume), points_at: Math.round(pct * at / 100), level: levelOf(pct, cfg) };
}

/* Is the floor running in `month`? It is when the affiliate qualified in that month or
   in any of the floor_months before it. */
function floorRunning(month, qualifiedNow, lastQualified, cfg) {
  if (qualifiedNow) return true;
  return Boolean(lastQualified) && monthIndex(month) - monthIndex(lastQualified) <= cfg.floor_months;
}

/* Which affiliate does an order count for? Exactly one, so a sale is never paid twice:
     - bought by an affiliate with no code, or with their own code  -> their own purchase
     - bought with another affiliate's code (whoever buys)          -> that affiliate's sale
     - anything else (an ordinary customer with no code)            -> nobody
   Only affiliates on the Points plan take part. */
function classify(order, byEmail, byCodeId) {
  const buyer = byEmail.get(String(order.email || '').toLowerCase()) || null;
  const owner = order.code_id ? (byCodeId.get(order.code_id) || null) : null;
  if (buyer && (!order.code_id || !owner || owner.id === buyer.id)) {
    // a code that belongs to someone outside the plan does not turn the buyer's own purchase into a sale
    return { earner: buyer.id, kind: 'own' };
  }
  if (owner) return { earner: owner.id, kind: 'sale' };
  return null;
}

/* One month, start to finish. No database.
     users        [{ id, sponsor_user_id }]            affiliates on the Points plan
     orders       [{ id, amount_mxn, discount_pct, earner, kind }]     already classified
     lastQualified Map userId -> the latest month BEFORE this one that reached the activation volume */
function computeMonth({ month, users, orders, lastQualified, cfg }) {
  const per = new Map(users.map(u => [u.id, { user_id: u.id, own_mxn: 0, sales_mxn: 0 }]));
  for (const o of orders) {
    const row = per.get(o.earner);
    if (!row) continue;
    row[o.kind === 'own' ? 'own_mxn' : 'sales_mxn'] += Number(o.amount_mxn);
  }
  for (const row of per.values()) {
    row.own_mxn = round2(row.own_mxn); row.sales_mxn = round2(row.sales_mxn);
    // the owner may cap how much of an affiliate's own buying counts (empty = all of it)
    row.own_counted = cfg.own_cap_mxn == null ? row.own_mxn : Math.min(row.own_mxn, cfg.own_cap_mxn);
    row.own_factor = row.own_mxn > 0 ? row.own_counted / row.own_mxn : 1;
    row.volume_mxn = round2(row.sales_mxn + row.own_counted);
    row.qualified = row.volume_mxn >= cfg.activation_mxn;
    row.floor_running = floorRunning(month, row.qualified, lastQualified.get(row.user_id) || null, cfg);
    row.rate_pct = rateFor(row.volume_mxn, row.floor_running, cfg);
    row.level = levelOf(row.rate_pct, cfg);
    row.points = 0; row.referral_points = 0; row.referral_volume_mxn = 0;
  }

  const sponsorOf = new Map(users.map(u => [u.id, u.sponsor_user_id || null]));
  const lines = [];
  for (const o of orders) {
    const e = per.get(o.earner);
    if (!e) continue;
    const counted = round2(Number(o.amount_mxn) * (o.kind === 'own' ? e.own_factor : 1));
    const points = Math.round(e.rate_pct * counted / 100);
    e.points += points;
    const line = { order_id: o.id, earner: o.earner, kind: o.kind, counted_mxn: counted, rate_pct: e.rate_pct, points, sponsor: null, bonus_points: 0, bonus_pct: 0 };

    // the sponsor's bonus: only if they are on the plan and their own floor is running, and
    // never so much that discount + this order's percentage + the bonus passes the business limit
    const sp = per.get(sponsorOf.get(o.earner));
    if (sp && sp.floor_running && counted > 0) {
      const room = Math.max(0, round2(cfg.business_limit_pct - Number(o.discount_pct || 0) - e.rate_pct));
      line.bonus_pct = Math.min(cfg.referral_pct, room);
      line.bonus_points = Math.round(line.bonus_pct * counted / 100);
      line.sponsor = sp.user_id;
      sp.referral_points += line.bonus_points;
      sp.referral_volume_mxn = round2(sp.referral_volume_mxn + counted);
    }
    lines.push(line);
  }
  return { users: per, lines };
}

/* ----------------------------------------------------------------- loading */

/* Orders paid in a month, with their value in MXN. A value already stored on the order is
   kept (it was frozen at an earlier close); otherwise it is worked out at today's rates. */
function toMxn(o, rates, cfg) {
  if (o.amount_mxn != null) return Number(o.amount_mxn);
  const gross = o.currency === 'USD'
    ? Number(o.total_local) * rates.usd_mxn
    : Number(o.charge_cop) * rates.usd_mxn / rates.usd_cop;
  return round2(gross / (1 + cfg.vat_pct / 100));
}

async function planUsers() {
  return query(
    `SELECT au.id, au.email, au.name, au.sponsor_user_id, au.code_id, c.code, c.affiliate_name
       FROM affiliate_users au JOIN codes c ON c.id = au.code_id
      WHERE c.commission_mode = 'plan'`);
}

async function monthOrders(month) {
  return query(
    `SELECT id, reference, currency, total_local, charge_cop, discount_pct, code_id, lower(customer_email) AS email, amount_mxn
       FROM orders
      WHERE status = 'APPROVED' AND paid_at IS NOT NULL
        AND to_char(paid_at AT TIME ZONE '${TZ}', 'YYYY-MM') = $1
      ORDER BY id`, [month]);
}

async function lastQualifiedBefore(month) {
  const rows = await query('SELECT user_id, max(month) AS m FROM member_months WHERE qualified AND month < $1 GROUP BY user_id', [month]);
  return new Map(rows.map(r => [r.user_id, r.m]));
}

/* Everything for one month, using current rates for orders that have no frozen value yet. */
async function evaluate(month, rates, cfg) {
  const [users, orders, lastQualified] = await Promise.all([planUsers(), monthOrders(month), lastQualifiedBefore(month)]);
  const byEmail = new Map(users.map(u => [String(u.email).toLowerCase(), u]));
  const byCodeId = new Map(users.map(u => [u.code_id, u]));
  const classified = [];
  for (const o of orders) {
    const c = classify(o, byEmail, byCodeId);
    if (!c) continue;
    classified.push({ id: o.id, reference: o.reference, amount_mxn: toMxn(o, rates, cfg), frozen: o.amount_mxn != null,
      discount_pct: o.discount_pct, ...c });
  }
  const result = computeMonth({ month, users, orders: classified, lastQualified, cfg });
  return { ...result, orders: classified, userRows: users };
}

/* ------------------------------------------------------------- the close */

/* The month that may be closed next: months close in order, one at a time, and never the
   current one. null when there is nothing to close. */
async function nextToClose() {
  const rows = await query("SELECT month, status FROM monthly_closes ORDER BY month DESC LIMIT 1");
  let next;
  if (rows.length) next = rows[0].status === 'running' ? rows[0].month : addMonths(rows[0].month, 1);
  else {
    const first = await query(`SELECT min(to_char(paid_at AT TIME ZONE '${TZ}', 'YYYY-MM')) AS m FROM orders WHERE status = 'APPROVED' AND paid_at IS NOT NULL`);
    next = first[0].m;
  }
  return next && monthIndex(next) < monthIndex(monthNow()) ? next : null;
}

/* What closing a month WOULD do, without writing anything. */
async function previewMonth(month) {
  const [cfg, rates] = await Promise.all([plan.getConfig(), currency.getRates()]);
  const ev = await evaluate(month, rates, cfg);
  const names = new Map(ev.userRows.map(u => [u.id, u.name || u.affiliate_name]));
  const rows = [...ev.users.values()].filter(r => r.volume_mxn > 0 || r.points > 0 || r.referral_points > 0)
    .map(r => ({ ...r, name: names.get(r.user_id) || '' }))
    .sort((a, b) => b.volume_mxn - a.volume_mxn);
  return {
    month, config: cfg, rows,
    totals: {
      orders: ev.lines.length,
      volume_mxn: round2(rows.reduce((s, r) => s + r.volume_mxn, 0)),
      points: rows.reduce((s, r) => s + r.points, 0),
      referral_points: rows.reduce((s, r) => s + r.referral_points, 0),
    },
  };
}

class CloseError extends Error { constructor(code) { super(code); this.code = code; } }

/* Close a month: freeze each order's value in MXN, write one row per affiliate, and add
   the Points to the ledger. Safe to run again after an interruption: every insert is
   skipped if it already exists, and frozen values are reused. */
async function closeMonth(month, closedBy = 'admin') {
  if (!isMonth(month)) throw new CloseError('bad_month');
  const next = await nextToClose();
  if (next !== month) {
    const done = await query('SELECT status FROM monthly_closes WHERE month = $1', [month]);
    throw new CloseError(done.length && done[0].status === 'closed' ? 'already_closed' : (monthIndex(month) >= monthIndex(monthNow()) ? 'month_open' : 'not_next'));
  }
  const cfg = await plan.getConfig();
  const rates = await currency.getRates();

  const started = await query(
    `INSERT INTO monthly_closes (month, status, closed_by) VALUES ($1, 'running', $2)
       ON CONFLICT (month) DO UPDATE SET month = EXCLUDED.month RETURNING closed_at`, [month, closedBy]);
  const closedAt = new Date(started[0].closed_at);
  const availableAt = new Date(closedAt.getTime() + cfg.wait_days * 86400000).toISOString();

  // 1. freeze the value of every order of the month that counts for someone
  const ev = await evaluate(month, rates, cfg);
  for (const o of ev.orders) {
    if (!o.frozen) await query('UPDATE orders SET amount_mxn = $1, amount_mxn_at = now() WHERE id = $2 AND amount_mxn IS NULL', [o.amount_mxn, o.id]);
  }
  // 2. the result can only be trusted if it was worked out from the frozen values
  const ev2 = await evaluate(month, rates, cfg);

  for (const r of ev2.users.values()) {
    if (!(r.volume_mxn > 0 || r.points > 0 || r.referral_points > 0)) continue;
    await query(
      `INSERT INTO member_months (user_id, month, own_mxn, sales_mxn, volume_mxn, qualified, floor_running, rate_pct, level, points, referral_points, referral_volume_mxn)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (user_id, month) DO NOTHING`,
      [r.user_id, month, r.own_mxn, r.sales_mxn, r.volume_mxn, r.qualified, r.floor_running, r.rate_pct, r.level, r.points, r.referral_points, r.referral_volume_mxn]);
  }
  // The ledger refuses updates and deletes, and a table with those rules cannot take ON CONFLICT,
  // so "only if it is not there yet" is written out. If two closes ever raced, the unique index
  // on (order, kind) would still stop the second copy.
  const earn = async (kind, userId, pts, orderId, sourceId, note) => {
    try {
      await query(
        `INSERT INTO points_ledger (user_id, kind, points, order_id, month, available_at, source_user_id, note)
         SELECT $1, $2, $3, $4::integer, $5, $6::timestamptz, $7::integer, $8
          WHERE NOT EXISTS (SELECT 1 FROM points_ledger WHERE order_id = $4::integer AND kind = $2)`,
        [userId, kind, pts, orderId, month, availableAt, sourceId, note]);
    } catch (e) { if (!(e && e.code === '23505')) throw e; }
  };
  for (const l of ev2.lines) {
    if (l.points > 0) await earn('earn_purchase', l.earner, l.points, l.order_id, null, `${l.kind} ${l.rate_pct}%`);
    if (l.bonus_points > 0) await earn('earn_referral', l.sponsor, l.bonus_points, l.order_id, l.earner, `referral ${l.bonus_pct}%`);
  }
  const totals = [...ev2.users.values()];
  await query(
    `UPDATE monthly_closes SET status = 'closed', orders = $2, volume_mxn = $3, points = $4, referral_points = $5
      WHERE month = $1`,
    [month, ev2.lines.length, round2(totals.reduce((s, r) => s + r.volume_mxn, 0)),
      totals.reduce((s, r) => s + r.points, 0), totals.reduce((s, r) => s + r.referral_points, 0)]);
  return { ok: true, month, orders: ev2.lines.length, points: totals.reduce((s, r) => s + r.points, 0), referral_points: totals.reduce((s, r) => s + r.referral_points, 0), available_at: availableAt };
}

/* --------------------------------------------------------------- balances */

async function balance(userId) {
  const r = (await query(
    `SELECT COALESCE(sum(points) FILTER (WHERE available_at <= now()), 0)::bigint AS available,
            COALESCE(sum(points) FILTER (WHERE available_at >  now()), 0)::bigint AS waiting,
            min(available_at) FILTER (WHERE available_at > now()) AS next_available
       FROM points_ledger WHERE user_id = $1`, [userId]))[0];
  return { available: Number(r.available), waiting: Number(r.waiting), next_available: r.next_available };
}

/* What the person sees: one line per month and source, not one per order. The ledger keeps
   every order; here the Points of a month are added up ("+2,200 for your October") because a
   long list of identical lines helps nobody. Anything that is not an earning stays one line each. */
async function history(userId, limit = 60) {
  return query(
    `SELECT max(l.id) AS id, l.kind, sum(l.points)::bigint AS points, l.month, l.available_at, min(l.created_at) AS created_at,
            s.name AS source_name
       FROM points_ledger l LEFT JOIN affiliate_users s ON s.id = l.source_user_id
      WHERE l.user_id = $1
      GROUP BY l.kind, l.month, l.available_at, s.name, CASE WHEN l.kind LIKE 'earn%' THEN 0 ELSE l.id END
      ORDER BY max(l.id) DESC LIMIT $2`, [userId, limit]);
}

/* When this person's Points expire: expiry_months after their last activity, which is
   the later of their last purchase and the last time they earned Points. */
async function expiryOf(user, cfg) {
  const r = (await query(
    `SELECT GREATEST(
              (SELECT max(paid_at) FROM orders WHERE status = 'APPROVED' AND lower(customer_email) = lower($2)),
              (SELECT max(created_at) FROM points_ledger WHERE user_id = $1 AND kind LIKE 'earn%')) AS anchor`,
    [user.id, user.email]))[0];
  if (!r.anchor) return null;
  const d = new Date(r.anchor);
  d.setUTCMonth(d.getUTCMonth() + cfg.expiry_months);
  return d.toISOString();
}

/* What the portal shows a plan affiliate: this month so far, how far the next level is,
   what the whole month would pay if they got there, and their Points. */
async function portalView(user) {
  const [cfg, rates] = await Promise.all([plan.getConfig(), currency.getRates()]);
  const month = monthNow();
  const ev = await evaluate(month, rates, cfg);
  const me = ev.users.get(user.id) || { own_mxn: 0, sales_mxn: 0, volume_mxn: 0, qualified: false, floor_running: false, rate_pct: 0, level: 0, points: 0, referral_points: 0 };
  const next = nextTarget(me.volume_mxn, me.rate_pct, cfg);

  const lastQ = (await lastQualifiedBefore(addMonths(month, 1))).get(user.id) || null;   // includes this month once qualified
  const qualifiedMonth = me.qualified ? month : lastQ;
  const floorUntil = qualifiedMonth ? lastDayOf(addMonths(qualifiedMonth, cfg.floor_months)) : null;

  const local = { currency: user.payout_currency, per_mxn: user.payout_currency === 'MXN' ? 1 : (user.payout_currency === 'USD' ? 1 / rates.usd_mxn : rates.usd_cop / rates.usd_mxn) };
  const levels = [];
  for (let i = 0; i <= maxLevel(cfg) - 1; i++) {
    const pct = Math.min(cfg.cap_pct, round2(cfg.floor_pct + i * cfg.step_pct));
    levels.push({ level: i + 1, from_mxn: cfg.activation_mxn + i * cfg.step_mxn, pct });
  }
  const bal = await balance(user.id);
  return {
    month, days_left: daysLeftIn(month), level_max: maxLevel(cfg),
    own_mxn: me.own_mxn, sales_mxn: me.sales_mxn, volume_mxn: me.volume_mxn,
    rate_pct: me.rate_pct, level: me.level, qualified: me.qualified, floor_running: me.floor_running, floor_until: floorUntil,
    points_now: me.points, referral_points_now: me.referral_points,
    next: next && { ...next, gain: next.points_at - me.points },
    activation_mxn: cfg.activation_mxn, floor_months: cfg.floor_months, wait_days: cfg.wait_days,
    levels, local, balance: bal, expires_at: bal.available + bal.waiting > 0 ? await expiryOf(user, cfg) : null,
  };
}

module.exports = {
  rateFor, levelOf, maxLevel, nextTarget, floorRunning, classify, computeMonth, toMxn,
  addMonths, monthIndex, isMonth, lastDayOf, daysLeftIn, nextToClose, previewMonth, closeMonth, CloseError,
  balance, history, expiryOf, portalView,
};
