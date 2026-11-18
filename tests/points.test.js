const { call } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');

const points = require('../api/_lib/points');
const plan = require('../api/_lib/plan');
const admin = require('../api/admin');
const portal = require('../api/affiliate');
const { query } = require('../api/_lib/db');
const terms = require('../api/_lib/terms');
const commission = require('../api/_lib/commission');

const CFG = { ...plan.DEFAULTS };

/* =========================================================== the rules, no database */

test('rules: the percentage for a month\'s volume (MXN)', () => {
  const at = v => points.rateFor(v, false, CFG);
  assert.equal(at(0), 0);
  assert.equal(at(19999), 0, 'one peso short of activating');
  assert.equal(at(20000), 10);
  assert.equal(at(24999), 10);
  assert.equal(at(25000), 15);
  assert.equal(at(29999), 15);
  assert.equal(at(30000), 20);
  assert.equal(at(35000), 25);
  assert.equal(at(40000), 30);
  assert.equal(at(44999), 30);
  assert.equal(at(45000), 35);
  assert.equal(at(1000000), 35, 'never above the cap');
});

test('rules: the level number that goes with each percentage', () => {
  const lv = p => points.levelOf(p, CFG);
  assert.deepEqual([0, 10, 15, 20, 25, 30, 35].map(lv), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(points.maxLevel(CFG), 6);
});

test('rules: a running floor keeps 10% in a slow month, and nothing keeps it otherwise', () => {
  assert.equal(points.rateFor(3000, true, CFG), 10);
  assert.equal(points.rateFor(3000, false, CFG), 0);
  assert.equal(points.rateFor(0, true, CFG), 10, 'even a month with no sales');
  assert.equal(points.rateFor(27000, true, CFG), 15, 'and a good month still climbs above it');
});

test('rules: the floor lasts 12 months after the last month that reached the activation volume', () => {
  const run = (month, last) => points.floorRunning(month, false, last, CFG);
  assert.equal(run('2027-01', '2027-01'), true);
  assert.equal(run('2027-02', '2027-01'), true);
  assert.equal(run('2028-01', '2027-01'), true, 'the twelfth month after is still covered');
  assert.equal(run('2028-02', '2027-01'), false, 'the thirteenth is not');
  assert.equal(run('2028-02', null), false);
  assert.equal(points.floorRunning('2028-02', true, '2027-01', CFG), true, 'a month that qualifies renews it');
});

test('rules: how far the next level is, and what the whole month would pay if reached', () => {
  const n = points.nextTarget(27000, 15, CFG);
  assert.deepEqual([n.volume, n.pct, n.missing, n.points_at], [30000, 20, 3000, 6000]);
  const now = Math.round(15 * 27000 / 100);
  assert.equal(now, 4050);
  assert.equal(n.points_at - now, 1950, 'the new percentage applies to the WHOLE month, not only the excess');

  const fresh = points.nextTarget(15000, 0, CFG);
  assert.deepEqual([fresh.volume, fresh.pct, fresh.missing], [20000, 10, 5000]);
  const onFloor = points.nextTarget(3000, 10, CFG);
  assert.equal(onFloor.volume, 25000, 'with the floor running the next gain is at the next step');
  assert.equal(points.nextTarget(60000, 35, CFG), null, 'nothing above the cap');
});

test('rules: validation of the plan settings, including the 48% guard', () => {
  assert.ok(plan.validateConfig({}).config, 'the defaults are valid');
  assert.equal(plan.validateConfig({ discount_pct: 7, cap_pct: 35, referral_pct: 5 }).config.discount_pct, 7);
  assert.equal(plan.validateConfig({ discount_pct: 10 }).error, 'over_limit', '10 + 35 + 5 = 50 > 48');
  assert.equal(plan.validateConfig({ cap_pct: 40 }).error, 'over_limit');
  assert.equal(plan.validateConfig({ cap_pct: 5 }).error, 'cap_below_floor');
  assert.equal(plan.validateConfig({ step_mxn: 0 }).error, 'bad_step_mxn');
  assert.equal(plan.validateConfig({ own_cap_mxn: -4 }).error, 'bad_own_cap_mxn');
  assert.equal(plan.validateConfig({ own_cap_mxn: 5000 }).config.own_cap_mxn, 5000);
  assert.equal(plan.validateConfig({ own_cap_mxn: '' }).config.own_cap_mxn, null);
});

/* which affiliate an order counts for */

const byEmail = new Map([['ana@x.co', { id: 1 }], ['beto@x.co', { id: 2 }]]);
const byCodeId = new Map([[10, { id: 1 }], [20, { id: 2 }]]);
const cls = (email, code_id) => points.classify({ email, code_id }, byEmail, byCodeId);

test('classify: one order, one earner, never paid twice', () => {
  assert.deepEqual(cls('ana@x.co', null), { earner: 1, kind: 'own' }, 'an affiliate buying with no code');
  assert.deepEqual(cls('ana@x.co', 10), { earner: 1, kind: 'own' }, 'buying with their own code is their own purchase, once');
  assert.deepEqual(cls('cliente@x.co', 10), { earner: 1, kind: 'sale' }, 'a customer with an affiliate\'s code');
  assert.deepEqual(cls('ana@x.co', 20), { earner: 2, kind: 'sale' }, 'an affiliate using ANOTHER one\'s code: that one\'s sale, not both');
  assert.equal(cls('cliente@x.co', null), null, 'an ordinary customer with no code');
  assert.equal(cls('cliente@x.co', 99), null, 'a code that is not on the plan');
  assert.deepEqual(cls('ana@x.co', 99), { earner: 1, kind: 'own' }, 'a promo code outside the plan does not change whose purchase it is');
});

/* a whole month */

const U = (id, sponsor = null) => ({ id, sponsor_user_id: sponsor });
const O = (id, earner, kind, amount, discount = 7) => ({ id, earner, kind, amount_mxn: amount, discount_pct: discount });
const month = (users, orders, last = new Map(), cfg = CFG) => points.computeMonth({ month: '2027-03', users, orders, lastQualified: last, cfg });

test('month: Ana activates with 4,000 of her own buying and 18,000 of sales', () => {
  const r = month([U(1)], [O(1, 1, 'own', 4000), O(2, 1, 'sale', 18000)]);
  const ana = r.users.get(1);
  assert.equal(ana.volume_mxn, 22000);
  assert.equal(ana.qualified, true);
  assert.equal(ana.rate_pct, 10);
  assert.equal(ana.points, 2200);
});

test('month: a slow month after activating still pays the floor; a month with the floor lapsed pays nothing', () => {
  const slow = month([U(1)], [O(1, 1, 'sale', 9000)], new Map([[1, '2027-01']]));
  assert.equal(slow.users.get(1).rate_pct, 10);
  assert.equal(slow.users.get(1).points, 900);
  const lapsed = month([U(1)], [O(1, 1, 'sale', 9000)], new Map([[1, '2025-01']]));
  assert.equal(lapsed.users.get(1).rate_pct, 0);
  assert.equal(lapsed.users.get(1).points, 0);
  const never = month([U(1)], [O(1, 1, 'sale', 9000)]);
  assert.equal(never.users.get(1).points, 0, 'never activated');
});

test('month: the top percentage on 46,000', () => {
  const r = month([U(1)], [O(1, 1, 'sale', 46000)]);
  assert.equal(r.users.get(1).rate_pct, 35);
  assert.equal(r.users.get(1).points, 16100);
});

test('month: the sponsor gets 5% of the value of a direct referral\'s month, whatever the referral\'s own percentage', () => {
  // Ana (sponsor) qualified; Beto (referral) does 30,000: 20% for him, 5% of 30,000 for her
  const r = month([U(1), U(2, 1)], [O(1, 2, 'sale', 10000), O(2, 2, 'sale', 20000)], new Map([[1, '2027-02']]));
  assert.equal(r.users.get(2).rate_pct, 20);
  assert.equal(r.users.get(2).points, 6000);
  assert.equal(r.users.get(1).referral_points, 1500);
  assert.equal(r.users.get(1).referral_volume_mxn, 30000);
  assert.equal(r.users.get(1).volume_mxn, 0, 'what a referral sells does not raise the sponsor\'s own level');
});

test('month: one level only, and a sponsor whose floor is not running earns no bonus', () => {
  // Carla is Beto's referral, Beto is Ana's: Ana gets nothing from Carla
  const chain = month([U(1), U(2, 1), U(3, 2)], [O(1, 3, 'sale', 30000)], new Map([[1, '2027-03'], [2, '2027-03']]));
  assert.equal(chain.users.get(2).referral_points, 1500);
  assert.equal(chain.users.get(1).referral_points, 0);
  const inactive = month([U(1), U(2, 1)], [O(1, 2, 'sale', 30000)]);
  assert.equal(inactive.users.get(1).referral_points, 0, 'Ana never activated');
  const sponsorQualifiesThisMonth = month([U(1), U(2, 1)], [O(1, 2, 'sale', 30000), O(2, 1, 'sale', 20000)]);
  assert.equal(sponsorQualifiesThisMonth.users.get(1).referral_points, 1500, 'qualifying in the same month counts');
});

test('month: discount + percentage + bonus can never pass the business limit', () => {
  const limit = (discount, vol) => {
    const r = month([U(1), U(2, 1)], [O(1, 2, 'sale', vol, discount)], new Map([[1, '2027-03']]));
    return { bonus_pct: r.lines[0].bonus_pct, total: discount + r.lines[0].rate_pct + r.lines[0].bonus_pct };
  };
  assert.deepEqual(limit(7, 60000), { bonus_pct: 5, total: 47 }, 'the plan as agreed: 7 + 35 + 5');
  assert.deepEqual(limit(10, 60000), { bonus_pct: 3, total: 48 }, 'a bigger discount trims the bonus, not the affiliate');
  assert.deepEqual(limit(15, 60000), { bonus_pct: 0, total: 50 }, 'nothing left for the bonus');
  for (const d of [0, 7, 10, 20]) for (const v of [5000, 22000, 33000, 60000]) {
    const { bonus_pct } = limit(d, v);
    const rate = points.rateFor(v, true, CFG);
    assert.ok(bonus_pct === 0 || d + rate + bonus_pct <= 48, `d=${d} v=${v}`);
  }
});

test('month: the optional cap on own buying only counts that much of it', () => {
  const capped = { ...CFG, own_cap_mxn: 5000 };
  const r = month([U(1)], [O(1, 1, 'own', 12000), O(2, 1, 'sale', 10000)], new Map(), capped);
  assert.equal(r.users.get(1).volume_mxn, 15000, '10,000 of sales + 5,000 of own buying');
  assert.equal(r.users.get(1).qualified, false);
  const free = month([U(1)], [O(1, 1, 'own', 12000), O(2, 1, 'sale', 10000)]);
  assert.equal(free.users.get(1).volume_mxn, 22000, 'no cap by default: own buying counts in full');
  assert.equal(free.users.get(1).qualified, true);
});

test('calendar: month arithmetic and the last day of the floor', () => {
  assert.equal(points.addMonths('2027-11', 3), '2028-02');
  assert.equal(points.addMonths('2027-01', 12), '2028-01');
  assert.equal(points.lastDayOf('2028-01'), '2028-01-31');
  assert.equal(points.lastDayOf('2028-02'), '2028-02-29');
  assert.equal(points.isMonth('2027-13'), false);
  assert.equal(points.daysLeftIn('2027-03', new Date('2027-03-22T15:00:00Z')), 10);
});

/* ================================================ the close, against the database */

let cookie = '';
const adminGet = (a, q = {}) => call(admin, { query: { a, ...q }, headers: { cookie } });
const adminPost = (a, body) => call(admin, { method: 'POST', query: { a }, body, headers: { cookie } });
const P = (a, { method = 'GET', body, cookie: c } = {}) => call(portal, { method, query: { a }, body, headers: c ? { cookie: c } : {} });

const GOOD = { country: 'CO', language: 'es', accept: true, terms_version: terms.VERSION, password: 'una-clave-larga-1' };
let ana, beto, carla, ivan;        // { uid, code, codeId, email, cookie }
let n = 0;

async function signUp(name, email, sponsorCode) {
  const r = await P('register', { method: 'POST', body: { ...GOOD, name, email, sponsor_code: sponsorCode } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const [row] = await query('SELECT au.id AS uid, c.id AS code_id, c.code FROM affiliate_users au JOIN codes c ON c.id = au.code_id WHERE au.email = $1', [email]);
  return { uid: row.uid, codeId: row.code_id, code: row.code, email, cookie: r.headers['Set-Cookie'].split(';')[0] };
}

/* A paid order straight into the database, with its MXN value already frozen so no exchange rate is involved. */
async function order({ email, codeId = null, mxn, month: m, discount = 7 }) {
  n += 1;
  await query(
    `INSERT INTO orders (reference, status, market, currency, items, subtotal_local, discount_pct, discount_local, total_local, subtotal_cop, discount_cop, charge_cop,
                         code_id, customer_name, customer_email, paid_at, amount_mxn)
     VALUES ($1, 'APPROVED', 'CO', 'COP', '[]', $2::numeric, $3, 0, $2::numeric, $2::bigint, 0, $2::bigint, $4, 'Cliente', $5, $6, $7)`,
    [`PT-${n}`, mxn * 200, discount, codeId, email, `${m}-15T17:00:00Z`, mxn]);
}

test.before(async () => {
  const login = await call(admin, { method: 'POST', query: { a: 'login' }, body: { password: process.env.ADMIN_PASSWORD } });
  cookie = login.headers['Set-Cookie'].split(';')[0];
  // rates are fixed so nothing depends on the network
  await adminPost('settings_set', { trm_override: 4000 });
  await adminPost('mxn_set', { mxn_override: 20 });
  ana = await signUp('Ana Pérez', 'ana@pts.co');
  beto = await signUp('Beto Ruiz', 'beto@pts.co', ana.code);
  carla = await signUp('Carla Soto', 'carla@pts.co', beto.code);
  ivan = await signUp('Iván Mora', 'ivan@pts.co');
  // a month that is long past, so it can be closed
  const M = '2026-01';
  await order({ email: 'ana@pts.co', mxn: 4000, month: M, codeId: ana.codeId });          // Ana's own purchase, with her own code
  await order({ email: 'cliente1@x.co', codeId: ana.codeId, mxn: 18000, month: M });        // a customer's sale for Ana
  await order({ email: 'cliente2@x.co', codeId: beto.codeId, mxn: 30000, month: M });       // Beto: 30,000
  await order({ email: 'cliente3@x.co', codeId: carla.codeId, mxn: 8000, month: M });       // Carla: 8,000 (never activates)
  await order({ email: 'cliente4@x.co', mxn: 5000, month: M });                              // a plain customer: counts for nobody
});

test('close: a preview shows the whole month and writes nothing', async () => {
  const p = (await adminGet('close_preview', { month: '2026-01' })).json;
  const row = id => p.rows.find(r => r.user_id === id);
  assert.equal(row(ana.uid).volume_mxn, 22000);
  assert.equal(row(ana.uid).rate_pct, 10);
  assert.equal(row(ana.uid).points, 2200);
  assert.equal(row(beto.uid).rate_pct, 20);
  assert.equal(row(beto.uid).points, 6000);
  assert.equal(row(carla.uid).points, 0, 'below the activation volume with no floor');
  assert.equal(row(ana.uid).referral_points, 1500, 'Ana: 5% of Beto\'s 30,000; Beto is her direct referral');
  assert.equal(row(beto.uid).referral_points, 400, 'Beto: 5% of Carla\'s 8,000. The bonus is on what a direct referral buys and sells, whether or not she is active');
  assert.equal(row(ivan.uid), undefined, 'no activity, not listed');
  assert.equal((await query('SELECT count(*)::int AS n FROM points_ledger'))[0].n, 0, 'nothing written');
  assert.equal((await adminGet('close_status')).json.next, '2026-01');
});

test('close: only the next month can be closed, and never the current one', async () => {
  assert.equal((await adminPost('close_month', { month: '2026-02' })).json.error, 'not_next');
  assert.equal((await adminPost('close_month', { month: commission.monthNow() })).json.error, 'month_open');
  assert.equal((await adminPost('close_month', { month: 'garbage' })).json.error, 'bad_month');
  const anon = await call(admin, { method: 'POST', query: { a: 'close_month' }, body: { month: '2026-01' } });
  assert.equal(anon.status, 401, 'only the owner closes months');
});

test('close: closing writes the Points, and the same month cannot be closed twice', async () => {
  const r = await adminPost('close_month', { month: '2026-01' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.points, 2200 + 6000);
  assert.equal(r.json.referral_points, 1500 + 400);

  const bal = async u => (await query('SELECT COALESCE(sum(points), 0)::int AS p FROM points_ledger WHERE user_id = $1', [u]))[0].p;
  assert.equal(await bal(ana.uid), 2200 + 1500);
  assert.equal(await bal(beto.uid), 6000 + 400);
  assert.equal(await bal(carla.uid), 0);

  const again = await adminPost('close_month', { month: '2026-01' });
  assert.equal(again.status, 409);
  assert.equal(again.json.error, 'already_closed');
  assert.equal((await query('SELECT count(*)::int AS n FROM points_ledger'))[0].n, 5, 'one row per earning: Ana\'s two orders, Beto\'s order, and the two referral bonuses. Nothing duplicated');
  assert.equal((await query("SELECT status FROM monthly_closes WHERE month = '2026-01'"))[0].status, 'closed');
});

test('close: every row says where it came from, and the order\'s value in MXN is frozen', async () => {
  const rows = await query(`SELECT l.kind, l.points, l.month, l.order_id, l.source_user_id, l.user_id FROM points_ledger l ORDER BY l.id`);
  assert.ok(rows.every(r => r.order_id && r.month === '2026-01'));
  const referral = rows.find(r => r.kind === 'earn_referral');
  assert.equal(referral.user_id, ana.uid);
  assert.equal(referral.source_user_id, beto.uid);
  const frozen = await query("SELECT amount_mxn, amount_mxn_at FROM orders WHERE reference = 'PT-1'");
  assert.equal(Number(frozen[0].amount_mxn), 4000);
});

test('close: each affiliate\'s month is on record, and the activation starts the floor', async () => {
  const m = (await query('SELECT * FROM member_months WHERE month = $1 ORDER BY user_id', ['2026-01']));
  const ofUser = id => m.find(r => r.user_id === id);
  assert.equal(Number(ofUser(ana.uid).volume_mxn), 22000);
  assert.equal(ofUser(ana.uid).qualified, true);
  assert.equal(ofUser(ana.uid).level, 1);
  assert.equal(ofUser(beto.uid).level, 3);
  assert.equal(ofUser(carla.uid).qualified, false);
});

test('ledger: it can only grow. Changing or deleting a row does nothing', async () => {
  const before = await query('SELECT id, points FROM points_ledger ORDER BY id');
  await query('UPDATE points_ledger SET points = 999999');
  await query('DELETE FROM points_ledger');
  const after = await query('SELECT id, points FROM points_ledger ORDER BY id');
  assert.deepEqual(after, before);
});

test('ledger: Points wait 15 days after the close before they can be used', async () => {
  const bal = await points.balance(beto.uid);
  assert.equal(bal.available, 0);
  assert.equal(bal.waiting, 6400);
  const [row] = await query("SELECT available_at, (SELECT closed_at FROM monthly_closes WHERE month = '2026-01') AS closed FROM points_ledger WHERE user_id = $1 ORDER BY id LIMIT 1", [beto.uid]);
  const days = (new Date(row.available_at) - new Date(row.closed)) / 86400000;
  assert.ok(Math.abs(days - 15) < 0.01, `waits ${days} days`);
  // once those 15 days pass the same Points are usable
  await query("INSERT INTO points_ledger (user_id, kind, points, available_at, note) VALUES ($1, 'adjust', 0, now(), 'noop')", [beto.uid]);
  const later = await query('SELECT COALESCE(sum(points) FILTER (WHERE available_at <= $2), 0)::int AS p FROM points_ledger WHERE user_id = $1', [beto.uid, new Date(Date.now() + 16 * 86400000).toISOString()]);
  assert.equal(later[0].p, 6400);
});

test('close: months go in order, and a later month sees the floor that January earned', async () => {
  // February: Ana sells only 9,000. Her floor from January still pays 10%.
  await order({ email: 'cliente5@x.co', codeId: ana.codeId, mxn: 9000, month: '2026-02' });
  assert.equal((await adminGet('close_status')).json.next, '2026-02');
  const p = (await adminGet('close_preview', { month: '2026-02' })).json;
  const row = p.rows.find(r => r.user_id === ana.uid);
  assert.equal(row.rate_pct, 10);
  assert.equal(row.floor_running, true);
  assert.equal(row.qualified, false);
  assert.equal(row.points, 900);
  assert.equal((await adminPost('close_month', { month: '2026-02' })).status, 200);
  assert.equal((await adminGet('close_status')).json.next, '2026-03', 'and then March, because the month in between has to be closed too');
});

test('close: changing the plan settings later never rewrites a month that is closed', async () => {
  const before = Number((await query("SELECT points FROM member_months WHERE user_id = $1 AND month = '2026-01'", [ana.uid]))[0].points);
  assert.equal((await adminPost('plan_set', { floor_pct: 5, cap_pct: 30 })).status, 200);
  const after = Number((await query("SELECT points FROM member_months WHERE user_id = $1 AND month = '2026-01'", [ana.uid]))[0].points);
  assert.equal(after, before);
  await adminPost('plan_set', plan.DEFAULTS);
});

/* ------------------------------------------------------------ the owner's tools */

test('settings: the owner can read and change the plan, but not break the 48% rule', async () => {
  const got = (await adminGet('plan_get')).json;
  assert.equal(got.config.activation_mxn, 20000);
  assert.equal((await adminPost('plan_set', { discount_pct: 12 })).json.error, 'over_limit');
  assert.equal((await adminPost('plan_set', { wait_days: 'soon' })).json.error, 'bad_wait_days');
  const ok = await adminPost('plan_set', { own_cap_mxn: 8000 });
  assert.equal(ok.json.config.own_cap_mxn, 8000);
  assert.equal((await adminGet('plan_get')).json.config.own_cap_mxn, 8000);
  await adminPost('plan_set', { own_cap_mxn: null });
  assert.equal((await adminGet('plan_get')).json.config.own_cap_mxn, null);
  assert.equal((await call(admin, { query: { a: 'plan_get' } })).status, 401);
});

test('adjust: a correction is a new row with a reason, and shows in the balance', async () => {
  const r = await adminPost('points_adjust', { code_id: ivan.codeId, points: 500, note: 'Regalo de bienvenida' });
  assert.equal(r.status, 200);
  assert.equal(r.json.balance.available, 500);
  const neg = await adminPost('points_adjust', { code_id: ivan.codeId, points: -200, note: 'Corrección de error' });
  assert.equal(neg.json.balance.available, 300);
  assert.equal((await adminPost('points_adjust', { code_id: ivan.codeId, points: 100, note: '' })).json.error, 'note_required');
  assert.equal((await adminPost('points_adjust', { code_id: ivan.codeId, points: 0, note: 'nada' })).json.error, 'bad_points');
  assert.equal((await adminPost('points_adjust', { code_id: 99999, points: 100, note: 'x y z' })).status, 404);
  const o = (await adminGet('points_overview')).json.people.find(p => p.user_id === ivan.uid);
  assert.equal(o.available, 300);
});

test('adjust: someone with Points on record cannot be deleted, only deactivated', async () => {
  const r = await adminPost('code_delete', { id: ivan.codeId });
  assert.equal(r.status, 409);
  assert.equal((await query('SELECT 1 FROM affiliate_users WHERE id = $1', [ivan.uid])).length, 1);
});

/* ---------------------------------------------------------- what the affiliate sees */

test('portal: Beto sees his month, his level, how far the next one is, and his Points', async () => {
  const s = (await P('summary', { cookie: beto.cookie })).json;
  assert.equal(s.mode, 'plan');
  assert.equal(s.month, null, 'no cash figures for a Points affiliate');
  const pl = s.plan;
  assert.equal(pl.month, commission.monthNow());
  assert.equal(pl.volume_mxn, 0, 'this month has no sales yet');
  assert.equal(pl.balance.waiting, 6400);
  assert.equal(pl.level_max, 6);
  assert.equal(pl.levels.length, 6);
  assert.deepEqual(pl.levels.map(l => l.pct), [10, 15, 20, 25, 30, 35]);
  assert.deepEqual(pl.levels.map(l => l.from_mxn), [20000, 25000, 30000, 35000, 40000, 45000]);
  assert.ok(pl.floor_until, 'January\'s activation set a floor date');
  assert.equal(pl.floor_until, points.lastDayOf(points.addMonths('2026-01', 12)));
});

test('portal: this month so far, with what the whole month would pay at the next level', async () => {
  await order({ email: 'cliente6@x.co', codeId: beto.codeId, mxn: 27000, month: commission.monthNow() });
  const pl = (await P('summary', { cookie: beto.cookie })).json.plan;
  assert.equal(pl.volume_mxn, 27000);
  assert.equal(pl.rate_pct, 15);
  assert.equal(pl.level, 2);
  assert.equal(pl.points_now, 4050);
  assert.deepEqual([pl.next.volume, pl.next.pct, pl.next.missing, pl.next.points_at, pl.next.gain], [30000, 20, 3000, 6000, 1950]);
  assert.ok(pl.days_left >= 1 && pl.days_left <= 31);
});

test('portal: Points history and balance, and "Afiliados por mí" shows what each referral gave', async () => {
  const pts = (await P('points', { cookie: ana.cookie })).json;
  assert.equal(pts.balance.waiting, 2200 + 1500 + 900);
  assert.ok(pts.history.some(h => h.kind === 'earn_referral' && h.points === 1500 && h.from === 'Beto R.'));
  assert.ok(pts.history.every(h => typeof h.points === 'number'));
  const team = (await P('team', { cookie: ana.cookie })).json;
  assert.equal(team.people.length, 1);
  assert.equal(team.people[0].name, 'Beto R.');
  assert.equal(team.people[0].bonus_points, 1500);
  assert.doesNotMatch(JSON.stringify(pts), /beto@pts|ivan@pts/, 'no contact details in the history');
});

test('portal: nobody sees anyone else\'s Points', async () => {
  const a = (await P('points', { cookie: ana.cookie })).json;
  const c = (await P('points', { cookie: carla.cookie })).json;
  assert.equal(c.balance.waiting, 0);
  assert.notDeepEqual(a.history, c.history);
  assert.equal((await P('points')).status, 401);
});

test('portal: the history adds up a month instead of listing every order', async () => {
  // Ana's January was two orders of her own (400 + 1,800): one line of 2,200, not two
  const h = (await P('points', { cookie: ana.cookie })).json.history;
  const jan = h.filter(x => x.kind === 'earn_purchase' && x.month === '2026-01');
  assert.equal(jan.length, 1);
  assert.equal(jan[0].points, 2200);
  // the ledger itself still has one row per order
  assert.equal((await query("SELECT count(*)::int AS n FROM points_ledger WHERE user_id = $1 AND kind = 'earn_purchase' AND month = '2026-01'", [ana.uid]))[0].n, 2);
});
