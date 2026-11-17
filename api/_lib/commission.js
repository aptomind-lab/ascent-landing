/* ===========================================================================
   Commission.

   An affiliate's commission is decided by how much their code sold in a
   calendar month, not per order:

     month        a calendar month in Colombia time (America/Bogota), counted by
                  the date the payment was approved
     sales        what customers actually paid with the code that month, after
                  the discount, in pesos (only APPROVED orders: a voided order
                  drops out of the month)
     level        the highest tier whose threshold the month's sales have reached
     commission   sales x that tier's percentage. The tier applies to the WHOLE
                  month's sales, not only the part above the threshold

   Each affiliate is on ONE of two methods, chosen in the admin panel:

     tiers   the escalating schedule below (global, editable in Ajustes)
     fixed   a flat percentage of the month's sales, set on that affiliate

   The standard schedule starts at 15% and adds 5 points for every COP 1,000,000
   sold in the month, capped at 40%. It is used until the owner saves a
   different one.

   A month is provisional while it is open and final once it has closed. When a
   month is paid out, its sales, rate and amount are frozen in
   commission_payouts; later changes to the tiers never rewrite history.
   =========================================================================== */

const { query } = require('./db');

const TZ = 'America/Bogota';
const MAX_TIERS = 10;

/* 15% from the first peso, +5 points per COP 1,000,000 in the month, capped at 40%. */
const DEFAULT_TIERS = [
  { min_cop: 0, pct: 15 },
  { min_cop: 1000000, pct: 20 },
  { min_cop: 2000000, pct: 25 },
  { min_cop: 3000000, pct: 30 },
  { min_cop: 4000000, pct: 35 },
  { min_cop: 5000000, pct: 40 },
];

function monthNow(date = new Date()) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit' }).formatToParts(date);
  const get = t => p.find(x => x.type === t).value;
  return `${get('year')}-${get('month')}`;
}

/* ------------------------------------------------------------------ tiers */

function parseTiers(raw) {
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .map(t => ({ min_cop: Number(t.min_cop), pct: Number(t.pct) }))
      .filter(t => Number.isFinite(t.min_cop) && t.min_cop >= 0 && Number.isFinite(t.pct) && t.pct >= 0 && t.pct <= 100)
      .sort((a, b) => a.min_cop - b.min_cop);
  } catch (e) {
    return [];
  }
}

/* The saved schedule, or the standard one when none has been saved. Saving an
   empty list deletes the row, which restores the standard schedule. */
async function getTiers() {
  const rows = await query("SELECT value FROM settings WHERE key = 'commission_tiers'");
  const saved = rows.length ? parseTiers(rows[0].value) : [];
  return saved.length ? saved : DEFAULT_TIERS.map(t => ({ ...t }));
}

async function isCustomSchedule() {
  const rows = await query("SELECT 1 FROM settings WHERE key = 'commission_tiers'");
  return rows.length > 0;
}

/* Strict validation for what an admin submits. Returns { tiers } or { error }.
   Higher thresholds must not pay less: a level that pays LESS than the one
   below it would punish an affiliate for selling more. */
function validateTiers(input) {
  if (!Array.isArray(input)) return { error: 'bad_tiers' };
  if (input.length > MAX_TIERS) return { error: 'too_many_tiers' };
  const tiers = [];
  for (const t of input) {
    const min = Number(t && t.min_cop);
    const pct = Number(t && t.pct);
    if (!Number.isInteger(min) || min < 0 || min > 1e12) return { error: 'bad_threshold' };
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { error: 'bad_percent' };
    tiers.push({ min_cop: min, pct: Math.round(pct * 100) / 100 });
  }
  tiers.sort((a, b) => a.min_cop - b.min_cop);
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i].min_cop === tiers[i - 1].min_cop) return { error: 'duplicate_threshold' };
    if (tiers[i].pct < tiers[i - 1].pct) return { error: 'tiers_not_increasing' };
  }
  return { tiers };
}

/* Where a given month's sales land, and how far the next level is. */
function levelFor(sales, tiers, fixedPct, mode = 'tiers') {
  if (mode === 'fixed' || !tiers.length) return { mode: 'fixed', pct: Number(fixedPct), level: null, levels: 0, next: null };
  let idx = -1;
  tiers.forEach((t, i) => { if (sales >= t.min_cop) idx = i; });
  const next = tiers[idx + 1] || null;
  return {
    mode: 'tiers',
    pct: idx >= 0 ? tiers[idx].pct : 0,
    level: idx + 1,                      // 0 means below the first threshold
    levels: tiers.length,
    next: next ? { min_cop: next.min_cop, pct: next.pct, missing_cop: next.min_cop - sales } : null,
  };
}

const commissionOf = (sales, pct) => Math.round(Number(sales) * Number(pct) / 100);

/* --------------------------------------------------------------- statements */

/* For each code: its months, newest first. Each month carries sales, orders,
   customers, the rate that applies, the commission, and whether it was paid.

   codes: [{ id, commission_pct, commission_mode }]   only: restrict to one code id (optional) */
async function statements(codes, only) {
  const tiers = await getTiers();
  const filter = only ? 'AND code_id = $1' : '';
  const args = only ? [only] : [];

  const sales = await query(
    `SELECT code_id,
            to_char(paid_at AT TIME ZONE '${TZ}', 'YYYY-MM') AS month,
            sum(charge_cop)::bigint AS sales_cop,
            count(*)::int AS orders,
            count(DISTINCT lower(customer_email))::int AS customers
       FROM orders
      WHERE status = 'APPROVED' AND code_id IS NOT NULL AND paid_at IS NOT NULL ${filter}
      GROUP BY 1, 2`, args);
  const paid = await query(
    `SELECT code_id, month, sales_cop, rate_pct, amount_cop, currency, amount_local, fx_rate, paid_at
       FROM commission_payouts ${only ? 'WHERE code_id = $1' : ''}`, args);

  const now = monthNow();
  const byCode = new Map();
  for (const code of codes) {
    if (only && code.id !== only) continue;
    const months = new Map();
    const ensure = m => { if (!months.has(m)) months.set(m, { month: m, sales_cop: 0, orders: 0, customers: 0 }); return months.get(m); };
    ensure(now);                                   // the current month always shows, even at zero
    sales.filter(r => r.code_id === code.id).forEach(r => Object.assign(ensure(r.month), {
      sales_cop: Number(r.sales_cop), orders: r.orders, customers: r.customers }));
    const payByMonth = new Map(paid.filter(r => r.code_id === code.id).map(r => [r.month, r]));
    payByMonth.forEach((_, m) => ensure(m));

    const list = [...months.values()].sort((a, b) => (a.month < b.month ? 1 : -1)).map(m => {
      const payout = payByMonth.get(m.month);
      const lvl = levelFor(m.sales_cop, tiers, code.commission_pct, code.commission_mode);
      const open = m.month === now;
      if (payout) {
        return { ...m, open, level: lvl, rate_pct: Number(payout.rate_pct), commission_cop: Number(payout.amount_cop),
          paid: { at: payout.paid_at, amount_cop: Number(payout.amount_cop), sales_cop: Number(payout.sales_cop),
            currency: payout.currency, amount_local: payout.amount_local == null ? null : Number(payout.amount_local),
            fx_rate: Number(payout.fx_rate) } };
      }
      return { ...m, open, level: lvl, rate_pct: lvl.pct, commission_cop: commissionOf(m.sales_cop, lvl.pct), paid: null };
    });
    byCode.set(code.id, list);
  }
  return { tiers, now, byCode };
}

/* The totals an affiliate (or the admin) cares about, from a statement. */
function totalsOf(months) {
  const current = months.find(m => m.open) || null;
  const closedUnpaid = months.filter(m => !m.open && !m.paid);
  return {
    current,
    owed_cop: closedUnpaid.reduce((s, m) => s + m.commission_cop, 0),   // closed months, not yet paid
    paid_cop: months.filter(m => m.paid).reduce((s, m) => s + m.paid.amount_cop, 0),
    lifetime_sales_cop: months.reduce((s, m) => s + m.sales_cop, 0),
  };
}

module.exports = { monthNow, getTiers, isCustomSchedule, parseTiers, validateTiers, levelFor, commissionOf, statements, totalsOf, DEFAULT_TIERS, TZ };
