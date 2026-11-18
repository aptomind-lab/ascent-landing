const { call, wompiEvent } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');

const checkout = require('../api/checkout');
const webhook = require('../api/wompi-webhook');
const admin = require('../api/admin');
const portal = require('../api/affiliate');
const { query } = require('../api/_lib/db');

const PRICE = 919800;      // BPC-157 40mg in Colombia, less a 10% code
const SHIP = { country: 'CO', address: 'Carrera 43A # 1-50 Apto 802', city: 'Medellín', region: 'Antioquia' };

let adminCookie = '';
const adminPost = (a, body) => call(admin, { method: 'POST', query: { a }, body, headers: { cookie: adminCookie } });
const adminGet = (a, q = {}) => call(admin, { query: { a, ...q }, headers: { cookie: adminCookie } });

const P = (a, { method = 'GET', body, cookie, headers = {} } = {}) =>
  call(portal, { method, query: { a }, body, headers: { ...(cookie ? { cookie } : {}), ...headers } });
const cookieOf = r => r.headers['Set-Cookie'].split(';')[0];

let n = 0;
async function paidOrder(codeText, { name, email, phone = '3105557788', city = 'Medellín', paid = true } = {}) {
  n += 1;
  const r = await call(checkout, { method: 'POST', body: {
    market: 'CO', items: [{ name: 'BPC-157', size: '40mg', qty: 1 }], code: codeText, ack: true,
    customer: { name, email, phone }, shipping: { ...SHIP, city },
  } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  if (paid) await call(webhook, { method: 'POST', body: wompiEvent({ id: `tx-${n}`, reference: r.json.reference, amountInCents: PRICE * 100 }) });
  return r.json.reference;
}

let maria, carlos;           // code ids
let mariaPass, carlosPass;   // temporary passwords handed out by the admin
let mariaCookie;

test.before(async () => {
  const login = await call(admin, { method: 'POST', query: { a: 'login' }, body: { password: process.env.ADMIN_PASSWORD } });
  adminCookie = cookieOf(login);
  await adminPost('settings_set', { trm_override: 4000 });
  maria = (await adminPost('code_save', { code: 'MARIA10', affiliate_name: 'María Gómez', discount_pct: 10, commission_mode: 'fixed', commission_pct: 8 })).json.id;
  carlos = (await adminPost('code_save', { code: 'CARLOS10', affiliate_name: 'Carlos Ruiz', discount_pct: 10, commission_mode: 'fixed', commission_pct: 8 })).json.id;
});

/* ------------------------------------------------------------ access */

test('admin: creating a login returns a temporary password once, and stores only a hash', async () => {
  const r = await adminPost('affiliate_user_save', { code_id: maria, email: 'Maria@Example.com' });
  assert.equal(r.status, 200);
  assert.equal(r.json.email, 'maria@example.com', 'emails are stored lower-case');
  mariaPass = r.json.password;
  assert.match(mariaPass, /^[A-Za-z0-9]{12}$/);
  assert.doesNotMatch(mariaPass, /[0OIl1]/, 'no look-alike characters');

  const [row] = await query('SELECT password_hash FROM affiliate_users WHERE code_id = $1', [maria]);
  assert.match(row.password_hash, /^scrypt\$/);
  assert.ok(!row.password_hash.includes(mariaPass), 'the password itself is never stored');

  // and it is never shown again
  const list = JSON.stringify((await adminGet('affiliates')).json);
  assert.ok(!list.includes(mariaPass));
  assert.doesNotMatch(list, /scrypt|password_hash/);
  const entry = (await adminGet('affiliates')).json.affiliates.find(a => a.id === maria);
  assert.equal(entry.has_access, true);
  assert.equal(entry.access_email, 'maria@example.com');

  carlosPass = (await adminPost('affiliate_user_save', { code_id: carlos, email: 'carlos@example.com' })).json.password;
});

test('admin: a login cannot be created with a bad or already-used email', async () => {
  assert.equal((await adminPost('affiliate_user_save', { code_id: maria, email: 'not-an-email' })).json.error, 'bad_email');
  assert.equal((await adminPost('affiliate_user_save', { code_id: carlos, email: 'maria@example.com' })).status, 409);
  assert.equal((await adminPost('affiliate_user_save', { code_id: 99999, email: 'x@example.com' })).json.error, 'not_found');
});

test('login: wrong password and unknown email get the same answer', async () => {
  const wrong = await P('login', { method: 'POST', body: { email: 'maria@example.com', password: 'definitely-wrong' } });
  const unknown = await P('login', { method: 'POST', body: { email: 'nobody@example.com', password: 'definitely-wrong' } });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(wrong.json, unknown.json, 'no way to tell which emails have accounts');
});

test('login: a temporary password works, but forces a new one before any data is shown', async () => {
  const r = await P('login', { method: 'POST', body: { email: 'MARIA@example.com', password: mariaPass } });
  assert.equal(r.status, 200);
  assert.equal(r.json.must_change, true);
  mariaCookie = cookieOf(r);
  assert.match(r.headers['Set-Cookie'], /HttpOnly/);
  assert.match(r.headers['Set-Cookie'], /SameSite=Strict/);

  const blocked = await P('summary', { cookie: mariaCookie });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.json.error, 'must_change_password');
});

test('password change: checks the current one, enforces a minimum, and kills the old session', async () => {
  const noCurrent = await P('change_password', { method: 'POST', cookie: mariaCookie, body: { current: 'wrong', next: 'a-long-new-password' } });
  assert.equal(noCurrent.json.error, 'wrong_current');
  const weak = await P('change_password', { method: 'POST', cookie: mariaCookie, body: { current: mariaPass, next: 'short' } });
  assert.equal(weak.json.error, 'weak_password');
  const same = await P('change_password', { method: 'POST', cookie: mariaCookie, body: { current: mariaPass, next: mariaPass + '' } });
  assert.equal(same.json.error, 'same_password');

  const ok = await P('change_password', { method: 'POST', cookie: mariaCookie, body: { current: mariaPass, next: 'my-own-new-password' } });
  assert.equal(ok.status, 200);
  const fresh = cookieOf(ok);

  assert.equal((await P('summary', { cookie: mariaCookie })).status, 401, 'the session from before the change no longer works');
  // the policies come before anything else: until accepted, no figures at all
  const gated = await P('summary', { cookie: fresh });
  assert.equal(gated.status, 403);
  assert.equal(gated.json.error, 'terms_needed');
  assert.equal((await P('accept_terms', { method: 'POST', cookie: fresh, body: { version: 'an-old-version' } })).status, 400, 'only the version in force can be accepted');
  assert.equal((await P('accept_terms', { method: 'POST', cookie: fresh, body: { version: require('../api/_lib/terms').VERSION } })).status, 200);
  assert.equal((await P('summary', { cookie: fresh })).status, 200);
  assert.equal((await P('login', { method: 'POST', body: { email: 'maria@example.com', password: mariaPass } })).status, 401, 'the temporary password is dead');
  mariaCookie = cookieOf(await P('login', { method: 'POST', body: { email: 'maria@example.com', password: 'my-own-new-password' } }));
});

/* ------------------------------------------------------ what they can see */

test('portal: an affiliate sees their own customers, abbreviated, and nobody else\'s', async () => {
  await paidOrder('MARIA10', { name: 'Laura Restrepo Gómez', email: 'laura.secreta@example.com', phone: '3001112233', city: 'Medellín' });
  await paidOrder('MARIA10', { name: 'Andrés', email: 'andres.privado@example.com', phone: '3204445566', city: 'Bogotá' });
  await paidOrder('MARIA10', { name: 'Pedro Gil', email: 'pedro.pendiente@example.com', city: 'Cali', paid: false });
  await paidOrder('CARLOS10', { name: 'Sofía Herrera', email: 'sofia.de.carlos@example.com', phone: '3119990000', city: 'Pereira' });

  const r = await P('summary', { cookie: mariaCookie });
  assert.equal(r.status, 200);
  const names = r.json.people.map(p => p.name).sort();
  assert.deepEqual(names, ['Andrés', 'Laura G.', 'Pedro G.']);
  assert.equal(r.json.people_used, 3);
  assert.equal(r.json.people_bought, 2);
  assert.ok(!names.some(x => /Sofía|Herrera/.test(x)), 'Carlos\'s customer is invisible to María');
  assert.deepEqual(r.json.people.find(p => p.name === 'Laura G.').city, 'Medellín');
});

test('portal: no contact details of any customer ever leave the server', async () => {
  const body = (await P('summary', { cookie: mariaCookie })).json;
  assert.equal(body.profile.email, 'maria@example.com', 'her own login email is hers, and is fine');
  delete body.profile.email;
  const text = JSON.stringify(body);
  for (const secret of ['laura.secreta', 'andres.privado', 'pedro.pendiente', '3001112233', '3204445566',
    'Carrera 43A', 'Apto 802', 'Restrepo', 'Herrera']) {
    assert.ok(!text.includes(secret), 'leaked: ' + secret);
  }
  assert.ok(!text.includes('@'), 'no email address of anyone else appears anywhere');
  assert.doesNotMatch(text, /customer_email|customer_phone|shipping|address/i);
});

test('portal: figures are her own, and the order list carries her commission', async () => {
  const r = (await P('summary', { cookie: mariaCookie })).json;
  assert.equal(r.profile.code, 'MARIA10');
  assert.equal(r.mode, 'fixed');
  assert.equal(r.month.sales_cop, PRICE * 2, 'two paid orders; the pending one is not sales');
  assert.equal(r.month.rate_pct, 8);
  assert.equal(r.month.commission_cop, Math.round(PRICE * 2 * 0.08));
  assert.equal(r.paid_cop, 0);
  assert.equal(r.owed_cop, 0, 'the month is still open');

  const statuses = r.orders.map(o => o.status).sort();
  assert.deepEqual(statuses, ['APPROVED', 'APPROVED', 'PENDING']);
  const paid = r.orders.find(o => o.status === 'APPROVED');
  assert.equal(paid.commission_cop, Math.round(PRICE * 0.08));
  assert.equal(r.orders.find(o => o.status === 'PENDING').commission_cop, 0);
  assert.deepEqual(paid.items, [{ name: 'BPC-157', size: '40mg', qty: 1 }]);
});

test('portal: declined and voided orders are not shown at all', async () => {
  const ref = await paidOrder('MARIA10', { name: 'Julia Mora', email: 'julia@example.com', paid: false });
  await call(webhook, { method: 'POST', body: wompiEvent({ id: 'tx-declined', status: 'DECLINED', reference: ref, amountInCents: PRICE * 100 }) });
  const r = (await P('summary', { cookie: mariaCookie })).json;
  assert.ok(!r.people.some(p => p.name.startsWith('Julia')));
  assert.ok(!r.orders.some(o => o.reference === ref));
});

test('portal: on the escalating method she sees her level and how far the next one is', async () => {
  // switch María from a flat 8% to the standard schedule; the percentage she had stays stored
  assert.equal((await adminPost('code_save', { id: maria, code: 'MARIA10', affiliate_name: 'María Gómez', discount_pct: 10, commission_mode: 'tiers' })).status, 200);
  const r = (await P('summary', { cookie: mariaCookie })).json;
  assert.equal(r.mode, 'tiers');
  assert.equal(r.month.sales_cop, PRICE * 2);
  assert.equal(r.month.rate_pct, 20, '1,839,600 passed the COP 1,000,000 level of the standard schedule');
  assert.equal(r.month.level.level, 2);
  assert.equal(r.month.level.levels, 6);
  assert.equal(r.month.level.next.pct, 25);
  assert.equal(r.month.level.next.missing_cop, 2000000 - PRICE * 2);
  assert.equal(r.tiers.length, 6);
  assert.equal(r.profile.fixed_commission_pct, 8, 'the flat percentage is kept for switching back');
});

/* ------------------------------------------------------------ isolation */

test('isolation: no request can name another affiliate\'s code or user', async () => {
  const carlosLogin = await P('login', { method: 'POST', body: { email: 'carlos@example.com', password: carlosPass } });
  assert.equal(carlosLogin.json.must_change, true);
  // asking for someone else's data by parameter changes nothing: the session decides
  const sneaky = await call(portal, { query: { a: 'summary', code_id: String(maria), user_id: '1', email: 'maria@example.com' },
    headers: { cookie: cookieOf(carlosLogin) } });
  assert.equal(sneaky.status, 403, 'still locked behind the password change, and never María\'s data');
});

test('isolation: a session cookie cannot be reassigned to another user', async () => {
  const [id, expires, mac] = mariaCookie.split('=')[1].split('.');
  const other = String(Number(id) + 1);
  assert.equal((await P('summary', { cookie: `ascent_aff=${other}.${expires}.${mac}` })).status, 401);
  assert.equal((await P('summary', { cookie: `ascent_aff=${id}.${Date.now() + 1e9}.${mac}` })).status, 401, 'a longer expiry breaks the signature');
  assert.equal((await P('summary', { cookie: 'ascent_aff=garbage' })).status, 401);
  assert.equal((await P('summary')).status, 401);
});

test('isolation: an affiliate session grants nothing in the admin panel, and vice versa', async () => {
  for (const a of ['affiliates', 'orders', 'products', 'settings']) {
    assert.equal((await call(admin, { query: { a }, headers: { cookie: mariaCookie } })).status, 401, a);
  }
  assert.equal((await P('summary', { cookie: adminCookie })).status, 401);
});

test('login: eight misses lock the account\'s email out, even for the right password', async () => {
  for (let i = 0; i < 8; i++) {
    const r = await P('login', { method: 'POST', body: { email: 'carlos@example.com', password: `wrong-${i}` }, headers: { 'x-forwarded-for': `7.7.7.${i}` } });
    assert.equal(r.status, 401);
  }
  const locked = await P('login', { method: 'POST', body: { email: 'carlos@example.com', password: carlosPass }, headers: { 'x-forwarded-for': '7.7.7.99' } });
  assert.equal(locked.status, 429);
});

test('login: a cross-origin POST is refused', async () => {
  const r = await P('login', { method: 'POST', body: { email: 'maria@example.com', password: 'x' }, headers: { origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
});

/* ------------------------------------------------------- admin controls */

test('admin: issuing a new password signs the affiliate out and forces another change', async () => {
  const reset = await adminPost('affiliate_user_save', { code_id: maria, email: 'maria@example.com' });
  assert.equal(reset.status, 200);
  assert.notEqual(reset.json.password, mariaPass);
  assert.equal((await P('summary', { cookie: mariaCookie })).status, 401, 'the old session is dead');
  const again = await P('login', { method: 'POST', body: { email: 'maria@example.com', password: reset.json.password } });
  assert.equal(again.json.must_change, true);
});

test('admin: removing access ends the login; a code with a login but no orders can be deleted', async () => {
  assert.equal((await adminPost('affiliate_user_delete', { code_id: maria })).status, 200);
  assert.equal((await P('login', { method: 'POST', body: { email: 'maria@example.com', password: 'anything-at-all' } })).status, 401);
  assert.equal((await adminPost('affiliate_user_delete', { code_id: maria })).status, 404);

  const spare = (await adminPost('code_save', { code: 'SPARE5', affiliate_name: 'Sin pedidos', discount_pct: 5, commission_pct: 5 })).json.id;
  await adminPost('affiliate_user_save', { code_id: spare, email: 'spare@example.com' });
  assert.equal((await adminPost('code_delete', { id: spare })).status, 200, 'the foreign key does not block it');
});

test('admin: portal logins are admin-only actions', async () => {
  assert.equal((await call(admin, { method: 'POST', query: { a: 'affiliate_user_save' }, body: { code_id: maria, email: 'x@example.com' } })).status, 401);
  assert.equal((await call(admin, { method: 'POST', query: { a: 'affiliate_user_delete' }, body: { code_id: maria } })).status, 401);
});
