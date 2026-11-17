const { call, wompiEvent } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');

const store = require('../api/store');
const checkout = require('../api/checkout');
const webhook = require('../api/wompi-webhook');
const admin = require('../api/admin');
const { query } = require('../api/_lib/db');
const commission = require('../api/_lib/commission');

/* Every order below is BPC-157 40mg in Colombia (COP 1,022,000) with a 10% code,
   so each paid order is exactly COP 919,800. */
const PRICE = 919800;
const CO_SHIP = { country: 'CO', address: 'Calle 1 # 2-3', city: 'Medellín', region: 'Antioquia' };

let cookie = '';
let code;
let n = 0;

const adminGet = (a, query = {}) => call(admin, { query: { a, ...query }, headers: { cookie } });
const adminPost = (a, body) => call(admin, { method: 'POST', query: { a }, body, headers: { cookie } });
const setTiers = tiers => adminPost('tiers_set', { tiers });

/* A real paid order through the real endpoints, optionally back-dated to `paidAt`. */
async function paidOrder({ paidAt, email } = {}) {
  n += 1;
  const r = await call(checkout, { method: 'POST', body: {
    market: 'CO', items: [{ name: 'BPC-157', size: '40mg', qty: 1 }], code: 'TIER10', ack: true,
    customer: { name: `Cliente ${n}`, email: email || `cliente${n}@example.com`, phone: '3001234567' }, shipping: CO_SHIP,
  } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const ev = await call(webhook, { method: 'POST', body: wompiEvent({ id: `tx-${n}`, reference: r.json.reference, amountInCents: PRICE * 100 }) });
  assert.equal(ev.status, 200);
  if (paidAt) await query('UPDATE orders SET paid_at = $1 WHERE reference = $2', [paidAt, r.json.reference]);
  return r.json.reference;
}

async function paidOrderWith(codeText) {
  n += 1;
  const r = await call(checkout, { method: 'POST', body: {
    market: 'CO', items: [{ name: 'BPC-157', size: '40mg', qty: 1 }], code: codeText, ack: true,
    customer: { name: 'Otro ' + n, email: 'otro' + n + '@example.com', phone: '3001234567' }, shipping: CO_SHIP,
  } });
  await call(webhook, { method: 'POST', body: wompiEvent({ id: 'tx-w' + n, reference: r.json.reference, amountInCents: PRICE * 100 }) });
  return r.json.reference;
}

const current = async () => (await adminGet('statement', { code_id: String(code) })).json.months.find(m => m.open);
const monthOf = async m => (await adminGet('statement', { code_id: String(code) })).json.months.find(x => x.month === m);

test.before(async () => {
  const login = await call(admin, { method: 'POST', query: { a: 'login' }, body: { password: process.env.ADMIN_PASSWORD } });
  cookie = login.headers['Set-Cookie'].split(';')[0];
  await adminPost('settings_set', { trm_override: 4000 });
  const c = await adminPost('code_save', { code: 'TIER10', affiliate_name: 'Nivel Prueba', discount_pct: 10 });
  code = c.json.id;
});

/* ------------------------------------------------------------ tier rules */

test('tiers: validation refuses anything that could mis-pay an affiliate', async () => {
  const bad = async (tiers, error) => assert.equal((await setTiers(tiers)).json.error, error, JSON.stringify(tiers));
  await bad('nope', 'bad_tiers');
  await bad([{ min_cop: -1, pct: 5 }], 'bad_threshold');
  await bad([{ min_cop: 1.5, pct: 5 }], 'bad_threshold');
  await bad([{ min_cop: 0, pct: 101 }], 'bad_percent');
  await bad([{ min_cop: 0, pct: -1 }], 'bad_percent');
  await bad([{ min_cop: 0, pct: 5 }, { min_cop: 0, pct: 8 }], 'duplicate_threshold');
  // selling more must never pay less
  await bad([{ min_cop: 0, pct: 10 }, { min_cop: 1000000, pct: 5 }], 'tiers_not_increasing');
  await bad(Array.from({ length: 11 }, (_, i) => ({ min_cop: i * 1000, pct: i })), 'too_many_tiers');
});

test('standard schedule: 15% from the first peso, +5 points per COP 1,000,000, capped at 40%', async () => {
  const std = (await adminGet('settings')).json;
  assert.equal(std.tiers_custom, false, 'nothing saved yet: the standard schedule is in force');
  assert.deepEqual(std.tiers, [
    { min_cop: 0, pct: 15 }, { min_cop: 1000000, pct: 20 }, { min_cop: 2000000, pct: 25 },
    { min_cop: 3000000, pct: 30 }, { min_cop: 4000000, pct: 35 }, { min_cop: 5000000, pct: 40 }]);

  const rateAt = sales => commission.levelFor(sales, std.tiers, 0).pct;
  assert.equal(rateAt(0), 15);
  assert.equal(rateAt(999999), 15);
  assert.equal(rateAt(1000000), 20);
  assert.equal(rateAt(2999999), 25);
  assert.equal(rateAt(4000000), 35);
  assert.equal(rateAt(5000000), 40);
  assert.equal(rateAt(80000000), 40, 'never above 40%');

  // and through the real endpoints: one COP 919,800 order -> 15%
  await paidOrder();
  const m = await current();
  assert.equal(m.rate_pct, 15);
  assert.equal(m.commission_cop, Math.round(PRICE * 0.15));
});

test('method: each affiliate is on the escalating schedule or on a flat percentage, chosen by the admin', async () => {
  const flat = (await adminPost('code_save', { code: 'FLAT7', affiliate_name: 'Tarifa Fija', discount_pct: 10, commission_mode: 'fixed', commission_pct: 7 })).json.id;
  const ref = await paidOrderWith('FLAT7');
  const st = (await adminGet('statement', { code_id: String(flat) })).json;
  assert.equal(st.mode, 'fixed');
  const m = st.months.find(x => x.open);
  assert.equal(m.rate_pct, 7);
  assert.equal(m.commission_cop, Math.round(PRICE * 0.07));
  assert.ok(ref);

  // switching the same affiliate to the schedule changes the rate, and keeps the 7% for later
  assert.equal((await adminPost('code_save', { id: flat, code: 'FLAT7', affiliate_name: 'Tarifa Fija', discount_pct: 10, commission_mode: 'tiers' })).status, 200);
  assert.equal((await adminGet('statement', { code_id: String(flat) })).json.months.find(x => x.open).rate_pct, 15);
  const list = (await adminGet('affiliates')).json.affiliates.find(x => x.id === flat);
  assert.equal(Number(list.commission_pct), 7);
  assert.equal(list.commission_mode, 'tiers');
});

test('method: fields that are not sent stay as they were, and bad values are refused', async () => {
  const id = (await adminPost('code_save', { code: 'KEEP20', affiliate_name: 'Conserva', discount_pct: 5, commission_mode: 'fixed', commission_pct: 20, payout_currency: 'USD' })).json.id;
  // an edit that sends neither mode, percentage nor currency must not reset them
  await adminPost('code_save', { id, code: 'KEEP20', affiliate_name: 'Conserva Renombrada', discount_pct: 5 });
  const row = (await adminGet('affiliates')).json.affiliates.find(x => x.id === id);
  assert.equal(row.commission_mode, 'fixed');
  assert.equal(Number(row.commission_pct), 20);
  assert.equal(row.payout_currency, 'USD');

  assert.equal((await adminPost('code_save', { code: 'BADMODE', affiliate_name: 'x', discount_pct: 5, commission_mode: 'surprise' })).json.error, 'bad_mode');
  assert.equal((await adminPost('code_save', { code: 'BADCUR', affiliate_name: 'x', discount_pct: 5, payout_currency: 'EUR' })).json.error, 'bad_currency');
  assert.equal((await adminPost('code_save', { code: 'NOPCT', affiliate_name: 'x', discount_pct: 5, commission_mode: 'fixed' })).json.error, 'bad_commission');
  assert.equal((await adminPost('code_save', { code: 'NEGPCT', affiliate_name: 'x', discount_pct: 5, commission_pct: -3 })).json.error, 'bad_commission');
});

test('standard schedule: a custom one replaces it, and saving an empty one restores it', async () => {
  assert.equal((await setTiers([{ min_cop: 0, pct: 5 }])).status, 200);
  assert.equal((await adminGet('settings')).json.tiers_custom, true);
  assert.equal((await setTiers([])).status, 200);
  const back = (await adminGet('settings')).json;
  assert.equal(back.tiers_custom, false);
  assert.equal(back.tiers.length, 6);
  assert.equal(back.tiers[5].pct, 40);
});

test('tiers: the level reached sets the rate for the WHOLE month, not just the excess', async () => {
  const saved = await setTiers([{ min_cop: 0, pct: 5 }, { min_cop: 1500000, pct: 10 }, { min_cop: 3500000, pct: 15 }]);
  assert.equal(saved.status, 200);
  assert.equal((await adminGet('settings')).json.tiers.length, 3);

  // one order so far: COP 919,800, first level
  let m = await current();
  assert.equal(m.sales_cop, PRICE);
  assert.equal(m.rate_pct, 5);
  assert.equal(m.commission_cop, Math.round(PRICE * 0.05));

  // a second order crosses 1,500,000: ALL 1,839,600 is now paid at 10%
  await paidOrder();
  m = await current();
  assert.equal(m.sales_cop, PRICE * 2);
  assert.equal(m.rate_pct, 10);
  assert.equal(m.commission_cop, Math.round(PRICE * 2 * 0.10), 'retroactive: the earlier order is also paid at the new rate');
});

test('tiers: the progress shown to the affiliate says how far the next level is', async () => {
  const m = await current();
  assert.equal(m.level.level, 2);
  assert.equal(m.level.levels, 3);
  assert.deepEqual(m.level.next, { min_cop: 3500000, pct: 15, missing_cop: 3500000 - PRICE * 2 });
});

test('tiers: a threshold met exactly counts, and the top level has no next', async () => {
  assert.deepEqual(commission.levelFor(1500000, [{ min_cop: 0, pct: 5 }, { min_cop: 1500000, pct: 10 }], 0).pct, 10);
  assert.equal(commission.levelFor(1499999, [{ min_cop: 0, pct: 5 }, { min_cop: 1500000, pct: 10 }], 0).pct, 5);
  const top = commission.levelFor(9e9, [{ min_cop: 0, pct: 5 }, { min_cop: 1500000, pct: 10 }], 0);
  assert.equal(top.next, null);
  // a first threshold above zero means no commission until it is reached
  assert.equal(commission.levelFor(100, [{ min_cop: 500000, pct: 8 }], 0).pct, 0);
});

test('orders: each order shows its share of the month, at the month\'s rate', async () => {
  const { rows } = (await adminGet('orders', { code_id: String(code), status: 'APPROVED' })).json;
  assert.ok(rows.length >= 2);
  for (const o of rows) {
    assert.equal(o.commission_pct, 10);
    assert.equal(o.commission_cop, Math.round(Number(o.charge_cop) * 0.10));
    assert.equal(o.commission_state, 'open');
  }
});

/* ------------------------------------------------------------- the month */

test('month: boundaries follow Colombia time, not UTC', async () => {
  // 23:30 on 31 Oct in Bogota is already 1 Nov in UTC; it still belongs to October
  await paidOrder({ paidAt: '2025-10-31 23:30:00-05' });
  // 00:30 on 1 Nov in Bogota belongs to November
  await paidOrder({ paidAt: '2025-11-01 00:30:00-05' });
  assert.equal((await monthOf('2025-10')).orders, 1);
  assert.equal((await monthOf('2025-11')).orders, 1);
});

test('month: a voided order drops out of the month and its commission', async () => {
  const ref = await paidOrder({ paidAt: '2025-06-10 12:00:00-05' });
  assert.equal((await monthOf('2025-06')).sales_cop, PRICE);
  await call(webhook, { method: 'POST', body: wompiEvent({ id: 'tx-void', status: 'VOIDED', reference: ref, amountInCents: PRICE * 100 }) });
  assert.equal(await monthOf('2025-06'), undefined, 'a month with only voided sales has nothing left to show');
});

/* ------------------------------------------------------------ settlement */

test('payout: a closed month is paid at its own rate, once, and the amount is frozen', async () => {
  // March 2025: two orders -> 1,839,600 -> second level -> 10%
  await paidOrder({ paidAt: '2025-03-05 12:00:00-05' });
  await paidOrder({ paidAt: '2025-03-20 12:00:00-05' });
  const before = await monthOf('2025-03');
  assert.equal(before.rate_pct, 10);
  assert.equal(before.commission_cop, Math.round(PRICE * 2 * 0.10));
  assert.equal(before.paid, null);

  const pay = await adminPost('pay_month', { code_id: code, month: '2025-03' });
  assert.equal(pay.status, 200);
  assert.equal(pay.json.amount_cop, before.commission_cop);
  assert.equal((await adminPost('pay_month', { code_id: code, month: '2025-03' })).status, 409, 'cannot pay the same month twice');

  // the business changes its tiers afterwards: history must not move
  await setTiers([{ min_cop: 0, pct: 20 }]);
  const after = await monthOf('2025-03');
  assert.equal(after.rate_pct, 10, 'the paid month keeps the rate it was paid at');
  assert.equal(after.commission_cop, before.commission_cop);
  assert.equal(after.paid.amount_cop, before.commission_cop);

  // while an unpaid month follows the new tiers
  assert.equal((await monthOf('2025-10')).rate_pct, 20);
});

test('payout: the open month, empty months and unknown months cannot be paid', async () => {
  const now = (await adminGet('statement', { code_id: String(code) })).json.now;
  assert.equal((await adminPost('pay_month', { code_id: code, month: now })).json.error, 'month_open');
  assert.equal((await adminPost('pay_month', { code_id: code, month: '2020-01' })).json.error, 'no_such_month');
  assert.equal((await adminPost('pay_month', { code_id: code, month: 'garbage' })).json.error, 'bad_value');
  // June 2025 has nothing left after its only order was voided
  assert.equal((await adminPost('pay_month', { code_id: code, month: '2025-06' })).status, 400);
});

test('payout: what is owed is the closed, unpaid months only', async () => {
  const { json } = await adminGet('affiliates');
  const a = json.affiliates.find(x => x.id === code);
  const { json: st } = await adminGet('statement', { code_id: String(code) });
  const expected = st.months.filter(m => !m.open && !m.paid).reduce((s, m) => s + m.commission_cop, 0);
  assert.equal(a.owed_cop, expected);
  assert.equal(a.paid_cop, st.months.filter(m => m.paid).reduce((s, m) => s + m.paid.amount_cop, 0));
  assert.ok(a.owed_cop > 0, 'October and November 2025 are closed and unpaid');
});

test('payout: a payment can be undone, and the month goes back to owed', async () => {
  assert.equal((await adminPost('unpay_month', { code_id: code, month: '2025-03' })).status, 200);
  assert.equal((await monthOf('2025-03')).paid, null);
  assert.equal((await adminPost('unpay_month', { code_id: code, month: '2025-03' })).status, 404);
});

test('payout: only the admin can touch settlement', async () => {
  const anon = { query: { a: 'pay_month' }, method: 'POST', body: { code_id: code, month: '2025-10' } };
  assert.equal((await call(admin, anon)).status, 401);
  assert.equal((await call(admin, { query: { a: 'tiers_set' }, method: 'POST', body: { tiers: [] } })).status, 401);
});

test('public quote still reveals nothing about tiers or commission', async () => {
  const r = await call(store, { method: 'POST', query: { a: 'quote' }, body: { market: 'CO', items: [{ name: 'BPC-157', size: '40mg', qty: 1 }], code: 'TIER10' } });
  assert.doesNotMatch(JSON.stringify(r.json), /commission|"tiers?"|"level"|Nivel Prueba|rate_pct/i);
});

/* --------------------------------------------------------------- currencies */

test('currency: amounts are earned in COP and shown in the affiliate\'s own currency', async () => {
  assert.equal((await adminPost('settings_set', { trm_override: 4000 })).status, 200);
  assert.equal((await adminPost('mxn_set', { mxn_override: 20 })).status, 200);
  const s = (await adminGet('settings')).json;
  assert.equal(s.mxn.rate, 20);
  assert.equal(s.mxn_override, 20);
  assert.equal((await adminPost('mxn_set', { mxn_override: 3 })).json.error, 'bad_rate', 'implausible MXN rate refused');

  const cur = {};
  for (const c of ['COP', 'MXN', 'USD']) {
    const id = (await adminPost('code_save', { code: 'CUR' + c, affiliate_name: 'Moneda ' + c, discount_pct: 10, commission_mode: 'fixed', commission_pct: 10, payout_currency: c })).json.id;
    await paidOrderWith('CUR' + c);
    cur[c] = (await adminGet('statement', { code_id: String(id) })).json;
    cur[c].id = id;
  }
  // 10% of 919,800 = 91,980 COP.  USD at 4,000 COP; MXN at 4,000/20 = 200 COP per peso mexicano
  const row = c => cur[c].months.find(m => m.open);
  assert.equal(row('COP').commission_cop, 91980);
  assert.equal(row('COP').commission_local, 91980);
  assert.equal(row('USD').commission_local, Math.round(91980 / 4000 * 100) / 100);
  assert.equal(row('MXN').commission_local, 459.9);
  assert.equal(cur.USD.cop_per_unit, 4000);
  assert.equal(cur.MXN.cop_per_unit, 200);
  assert.equal(cur.USD.currency, 'USD');
});

test('currency: a paid month keeps the amount and rate it was paid at', async () => {
  await adminPost('settings_set', { trm_override: 4000 });
  const id = (await adminPost('code_save', { code: 'FROZEN', affiliate_name: 'Congelada', discount_pct: 10, commission_mode: 'fixed', commission_pct: 10, payout_currency: 'USD' })).json.id;
  await paidOrderWith('FROZEN');
  await query("UPDATE orders SET paid_at = '2025-02-10T15:00:00Z' WHERE code_id = $1", [id]);

  const pay = await adminPost('pay_month', { code_id: id, month: '2025-02' });
  assert.equal(pay.status, 200);
  assert.equal(pay.json.currency, 'USD');
  assert.equal(pay.json.amount_local, Math.round(91980 / 4000 * 100) / 100);
  assert.equal(pay.json.fx_rate, 4000);

  // the dollar moves afterwards: what was paid must not
  await adminPost('settings_set', { trm_override: 5000 });
  const m = (await adminGet('statement', { code_id: String(id) })).json.months.find(x => x.month === '2025-02');
  assert.equal(m.commission_local, pay.json.amount_local);
  assert.equal(m.paid.fx_rate, 4000);
  await adminPost('settings_set', { trm_override: null });
});
