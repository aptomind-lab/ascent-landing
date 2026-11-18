const { call } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');

const portal = require('../api/affiliate');
const admin = require('../api/admin');
const checkout = require('../api/checkout');
const webhook = require('../api/wompi-webhook');
const { wompiEvent } = require('./helpers');
const { query } = require('../api/_lib/db');
const terms = require('../api/_lib/terms');
const mailer = require('../api/_lib/mailer');
const { quote } = require('../api/_lib/pricing');

const sent = [];
mailer.setTransport(async m => { sent.push(m); });

// each test uses its own "address" so the per-address limits of one never touch another
let ipN = 0;
const nextIp = () => `10.1.0.${++ipN}`;
const P = (a, { method = 'GET', body, cookie, ip, q = {} } = {}) =>
  call(portal, { method, query: { a, ...q }, body, headers: { ...(cookie ? { cookie } : {}), 'x-forwarded-for': ip || nextIp() } });
const cookieOf = r => r.headers['Set-Cookie'].split(';')[0];

const GOOD = {
  name: 'María Gómez', email: 'maria.gomez@example.com', password: 'una-clave-larga-1', country: 'CO',
  language: 'es', phone: '+57 300 123 4567', accept: true, terms_version: terms.VERSION,
};
const register = (over = {}, opts = {}) => P('register', { method: 'POST', body: { ...GOOD, ...over }, ...opts });

/* ---------------------------------------------------------------- policies */

test('terms: the policies are public, in both languages, and carry a version', async () => {
  const es = (await P('terms', { q: { lang: 'es' } })).json;
  const en = (await P('terms', { q: { lang: 'en' } })).json;
  assert.equal(es.version, terms.VERSION);
  assert.equal(es.points.length, 4);
  assert.match(es.points.join(' '), /RUO/);
  assert.match(es.points.join(' '), /uso/);
  assert.doesNotMatch(es.points.join(' '), /consumo/, '"uso", never "consumo": consumption would contradict RUO');
  assert.match(en.points.join(' '), /RUO/);
  assert.equal(en.language, 'en');
});

/* ------------------------------------------------------------- registration */

test('register: creates the account, a 7% code, and records exactly what was accepted', async () => {
  const r = await register({}, { ip: '203.0.113.9' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const cookie = cookieOf(r);

  const me = (await P('me', { cookie })).json;
  assert.equal(me.authed, true);
  assert.equal(me.terms_needed, false, 'accepted at sign-up, so not asked again');
  assert.equal(me.mode, 'plan');
  assert.match(me.code, /^MARIA\d\d$/);
  assert.match(me.ref_code, /^[A-Z0-9]{8}$/);
  assert.equal(me.invite_url, `https://shop.example/afiliados?ref=${me.ref_code}`);

  const [code] = await query('SELECT * FROM codes WHERE code = $1', [me.code]);
  assert.equal(Number(code.discount_pct), 7);
  assert.equal(code.commission_mode, 'plan');
  assert.equal(code.payout_currency, 'COP');
  assert.equal(code.active, true);

  const [acc] = await query('SELECT * FROM terms_acceptances ORDER BY id DESC LIMIT 1');
  assert.equal(acc.version, terms.VERSION);
  assert.equal(acc.method, 'registro web');
  assert.equal(acc.ip, '203.0.113.9');
  assert.equal(acc.language, 'es');

  // the password is never stored as typed
  const [u] = await query('SELECT password_hash FROM affiliate_users WHERE email = $1', [GOOD.email]);
  assert.ok(u.password_hash && !u.password_hash.includes(GOOD.password));
});

test('register: a customer using that code gets 7% off', async () => {
  const me = (await P('me', { cookie: cookieOf(await P('login', { method: 'POST', body: { email: GOOD.email, password: GOOD.password } })) })).json;
  const q = await quote({ market: 'CO', items: [{ name: 'BPC-157', size: '40mg', qty: 1 }], code: me.code });
  assert.equal(q.discountPct, 7);
  assert.equal(q.chargeCop, Math.round(1022000 * 0.93));
});

test('register: the points affiliate sees no cash figures', async () => {
  const cookie = cookieOf(await P('login', { method: 'POST', body: { email: GOOD.email, password: GOOD.password } }));
  const s = (await P('summary', { cookie })).json;
  assert.equal(s.mode, 'plan');
  assert.equal(s.month, null);
  assert.deepEqual(s.months, []);
  assert.deepEqual(s.tiers, []);
  assert.equal(s.owed_cop, 0);
});

test('register: nothing is accepted without the policies, and bad data is refused', async () => {
  assert.equal((await register({ email: 'a1@example.com', accept: false })).json.error, 'terms_required');
  assert.equal((await register({ email: 'a2@example.com', accept: undefined })).json.error, 'terms_required');
  assert.equal((await register({ email: 'a3@example.com', terms_version: 'old' })).json.error, 'terms_required');
  assert.equal((await register({ email: 'not-an-email' })).json.error, 'bad_email');
  assert.equal((await register({ email: 'a4@example.com', password: 'short' })).json.error, 'weak_password');
  assert.equal((await register({ email: 'a5@example.com', country: 'FR' })).json.error, 'bad_country');
  assert.equal((await register({ email: 'a6@example.com', name: ' ' })).json.error, 'bad_name');
  assert.equal((await register({ email: 'a7@example.com', phone: 'call me' })).json.error, 'bad_phone');
  const n = (await query("SELECT count(*)::int AS n FROM affiliate_users WHERE email LIKE 'a_@example.com'"))[0].n;
  assert.equal(n, 0, 'none of those created anything');
  const codes = (await query("SELECT count(*)::int AS n FROM codes WHERE affiliate_name = ' '"))[0].n;
  assert.equal(codes, 0);
});

test('register: an email can only be used once, whatever the capitals', async () => {
  const r = await register({ email: 'MARIA.GOMEZ@Example.com' });
  assert.equal(r.status, 409);
  assert.equal(r.json.error, 'email_taken');
});

test('register: the country decides the currency, and the language is kept', async () => {
  const us = await register({ email: 'jake@example.com', name: 'Jake Miller', country: 'US', language: 'en' });
  assert.equal(us.status, 200);
  const [row] = await query(`SELECT c.payout_currency, au.language, au.country FROM affiliate_users au JOIN codes c ON c.id = au.code_id WHERE au.email = 'jake@example.com'`);
  assert.deepEqual([row.payout_currency, row.language, row.country], ['USD', 'en', 'US']);
  const me = (await P('me', { cookie: cookieOf(us) })).json;
  assert.equal(me.language, 'en');
  assert.equal((await P('set_language', { method: 'POST', cookie: cookieOf(us), body: { language: 'es' } })).status, 200);
  assert.equal((await P('me', { cookie: cookieOf(us) })).json.language, 'es');
  assert.equal((await P('set_language', { method: 'POST', cookie: cookieOf(us), body: { language: 'fr' } })).status, 400);
});

test('register: sign-ups from one address are limited', async () => {
  const ip = '198.51.100.77';
  for (let i = 0; i < 8; i++) await register({ email: `spam${i}@example.com`, password: 'x' }, { ip });   // refused, but each counts
  const r = await register({ email: 'spam-final@example.com' }, { ip });
  assert.equal(r.status, 429);
});

/* ---------------------------------------------------------------- invitations */

let ana, beto, anaCookie, anaRef;

test('invite: a link names only the first name of whoever invited you', async () => {
  const r = await register({ email: 'ana@example.com', name: 'Ana Lucía Pérez' });
  anaCookie = cookieOf(r);
  anaRef = (await P('me', { cookie: anaCookie })).json.ref_code;
  const inv = (await P('invite', { q: { ref: anaRef.toLowerCase() } })).json;
  assert.deepEqual(inv, { ok: true, sponsor: 'Ana' });
  assert.deepEqual((await P('invite', { q: { ref: 'NOPE0000' } })).json, { ok: false });
});

test('invite: signing up with a link records the sponsor once; a wrong link is refused', async () => {
  assert.equal((await register({ email: 'x@example.com', ref: 'NOPE0000' })).json.error, 'bad_invite');
  const b = await register({ email: 'beto@example.com', name: 'Beto Ruiz Díaz', ref: anaRef });
  assert.equal(b.status, 200);
  const [row] = await query(`SELECT b.sponsor_user_id, b.signup_source, a.id AS ana_id FROM affiliate_users b, affiliate_users a WHERE b.email = 'beto@example.com' AND a.email = 'ana@example.com'`);
  assert.equal(row.sponsor_user_id, row.ana_id);
  assert.equal(row.signup_source, 'invite');
  ana = row.ana_id;
  beto = cookieOf(b);
});

test('invite: "Afiliados por mí" shows one level only, shortened, with no contact details', async () => {
  // Carla signs up through Beto, not Ana
  const betoRef = (await P('me', { cookie: beto })).json.ref_code;
  await register({ email: 'carla@example.com', name: 'Carla Soto', ref: betoRef });

  const team = (await P('team', { cookie: anaCookie })).json;
  assert.equal(team.people.length, 1, 'Carla is Beto\'s, not Ana\'s: one level only');
  assert.equal(team.people[0].name, 'Beto D.');
  assert.equal(team.people[0].has_sales, false);
  assert.doesNotMatch(JSON.stringify(team), /beto@example|Ruiz|@|\d{7}/);

  const t2 = (await P('team', { cookie: beto })).json;
  assert.equal(t2.people.length, 1);
  assert.equal(t2.people[0].name, 'Carla S.');
});

test('invite: the sponsor cannot be changed afterwards', async () => {
  const before = (await query("SELECT sponsor_user_id FROM affiliate_users WHERE email = 'beto@example.com'"))[0].sponsor_user_id;
  // nothing in the API accepts a sponsor once the account exists
  await P('set_language', { method: 'POST', cookie: beto, body: { language: 'en', sponsor_user_id: 999, ref: 'ZZZZZZZZ' } });
  await P('change_password', { method: 'POST', cookie: beto, body: { current: 'una-clave-larga-1', next: 'otra-clave-larga-2', sponsor_user_id: 999 } });
  const after = (await query("SELECT sponsor_user_id FROM affiliate_users WHERE email = 'beto@example.com'"))[0].sponsor_user_id;
  assert.equal(after, before);
  assert.equal(after, ana);
});

/* --------------------------------------------------------------- admin-made */

test('policies: an account made by the admin must accept them before seeing anything', async () => {
  const login = await call(admin, { method: 'POST', query: { a: 'login' }, body: { password: process.env.ADMIN_PASSWORD } });
  const cookie = cookieOf(login);
  const code = (await call(admin, { method: 'POST', query: { a: 'code_save' }, headers: { cookie },
    body: { code: 'DIEGO7', affiliate_name: 'Diego Hernández', discount_pct: 7, commission_mode: 'plan' } })).json;
  assert.equal(code.status, undefined);
  const acc = (await call(admin, { method: 'POST', query: { a: 'affiliate_user_save' }, headers: { cookie },
    body: { code_id: code.id, email: 'diego@example.com' } })).json;
  const l = await P('login', { method: 'POST', body: { email: 'diego@example.com', password: acc.password } });
  const c = cookieOf(l);
  await P('change_password', { method: 'POST', cookie: c, body: { current: acc.password, next: 'nueva-clave-segura-9' } });
  const c2 = cookieOf(await P('login', { method: 'POST', body: { email: 'diego@example.com', password: 'nueva-clave-segura-9' } }));
  const me = (await P('me', { cookie: c2 })).json;
  assert.equal(me.terms_needed, true);
  assert.match(me.ref_code, /^[A-Z0-9]{8}$/, 'gets an invite code the first time it is needed');
  assert.equal((await P('summary', { cookie: c2 })).json.error, 'terms_needed');
  assert.equal((await P('team', { cookie: c2 })).json.error, 'terms_needed');
});

/* --------------------------------------------------------- forgot / reset */

const tokenIn = mail => mail.text.match(/reset=([0-9a-f]{64})/)[1];

test('forgot: the answer is the same for a real and an unknown address, and only a real one gets mail', async () => {
  sent.length = 0;
  const a = await P('forgot', { method: 'POST', body: { email: 'ana@example.com' } });
  const b = await P('forgot', { method: 'POST', body: { email: 'nadie@example.com' } });
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.deepEqual(a.json, b.json);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'ana@example.com');
  assert.match(sent[0].text, /^Hola Ana,/);
  assert.match(sent[0].text, /https:\/\/shop\.example\/afiliados\?reset=[0-9a-f]{64}/);
  assert.match(sent[0].subject, /contraseña/);
});

test('forgot: the mail is in the language of the account', async () => {
  sent.length = 0;
  await P('forgot', { method: 'POST', body: { email: 'jake@example.com' } });   // switched to es earlier
  await P('set_language', { method: 'POST', cookie: cookieOf(await P('login', { method: 'POST', body: { email: 'jake@example.com', password: GOOD.password } })), body: { language: 'en' } });
  sent.length = 0;
  await P('forgot', { method: 'POST', body: { email: 'jake@example.com' } });
  assert.match(sent[0].subject, /password/i);
  assert.match(sent[0].text, /^Hello Jake,/);
});

test('reset: the link sets a new password once, kills old sessions, and the token is stored only as a hash', async () => {
  sent.length = 0;
  await P('forgot', { method: 'POST', body: { email: 'ana@example.com' } });
  const token = tokenIn(sent[0]);
  const stored = await query('SELECT token_hash FROM password_resets');
  assert.ok(stored.every(r => r.token_hash !== token), 'the raw token is not in the database');

  assert.equal((await P('reset', { method: 'POST', body: { token, password: 'short' } })).json.error, 'weak_password');
  assert.equal((await P('reset', { method: 'POST', body: { token: 'f'.repeat(64), password: 'nueva-clave-larga-5' } })).json.error, 'bad_token');

  const ok = await P('reset', { method: 'POST', body: { token, password: 'nueva-clave-larga-5' } });
  assert.equal(ok.status, 200);
  assert.equal((await P('me', { cookie: anaCookie })).json.authed, false, 'the session from before is dead');
  assert.equal((await P('login', { method: 'POST', body: { email: 'ana@example.com', password: GOOD.password } })).status, 401);
  assert.equal((await P('login', { method: 'POST', body: { email: 'ana@example.com', password: 'nueva-clave-larga-5' } })).status, 200);
  assert.equal((await P('reset', { method: 'POST', body: { token, password: 'otra-clave-larga-6' } })).json.error, 'bad_token', 'a link works once');
});

test('reset: an expired link is refused', async () => {
  sent.length = 0;
  await P('forgot', { method: 'POST', body: { email: 'carla@example.com' } });
  const token = tokenIn(sent[0]);
  await query("UPDATE password_resets SET expires_at = now() - interval '1 minute'");
  assert.equal((await P('reset', { method: 'POST', body: { token, password: 'nueva-clave-larga-7' } })).json.error, 'bad_token');
});

test('forgot: asking again and again from one address is limited', async () => {
  const ip = '198.51.100.88';
  for (let i = 0; i < 8; i++) await P('forgot', { method: 'POST', body: { email: `q${i}@example.com` }, ip });
  assert.equal((await P('forgot', { method: 'POST', body: { email: 'q9@example.com' }, ip })).status, 429);
});

test('mail: with no provider configured nothing is sent and nothing breaks', async () => {
  mailer.setTransport(null);
  const keep = [process.env.RESEND_API_KEY, process.env.MAIL_FROM];
  delete process.env.RESEND_API_KEY; delete process.env.MAIL_FROM;
  try {
    assert.equal(mailer.configured(), false);
    const r = await P('forgot', { method: 'POST', body: { email: 'ana@example.com' } });
    assert.equal(r.status, 200);
    assert.deepEqual(await mailer.send({ to: 'a@b.co', subject: 's', text: 't' }), { sent: false, reason: 'not_configured' });
  } finally {
    [process.env.RESEND_API_KEY, process.env.MAIL_FROM] = keep;
    mailer.setTransport(async m => { sent.push(m); });
  }
});

/* ------------------------------------------------------------ sales appear */

test('team: "has sales" turns on once the invited affiliate\'s code is used for a paid order', async () => {
  // Beto changed his password in an earlier test, so his first session is gone: sign in again
  const betoNow = cookieOf(await P('login', { method: 'POST', body: { email: 'beto@example.com', password: 'otra-clave-larga-2' } }));
  const betoCode = (await P('me', { cookie: betoNow })).json.code;
  assert.ok(betoCode);
  const r = await call(checkout, { method: 'POST', body: {
    market: 'CO', items: [{ name: 'BPC-157', size: '40mg', qty: 1 }], code: betoCode, ack: true,
    customer: { name: 'Cliente Uno', email: 'cliente1@example.com', phone: '3001234567' },
    shipping: { country: 'CO', address: 'Calle 1 # 2-3', city: 'Medellín', region: 'Antioquia' } } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const q = await quote({ market: 'CO', items: [{ name: 'BPC-157', size: '40mg', qty: 1 }], code: betoCode });
  await call(webhook, { method: 'POST', body: wompiEvent({ id: 'tx-s1', reference: r.json.reference, amountInCents: q.chargeCop * 100 }) });
  const [o] = await query('SELECT status, charge_cop, code_id FROM orders WHERE reference = $1', [r.json.reference]);
  assert.equal(o.status, 'APPROVED', JSON.stringify([o, q.chargeCop]));
  const ana2 = cookieOf(await P('login', { method: 'POST', body: { email: 'ana@example.com', password: 'nueva-clave-larga-5' } }));
  const team = (await P('team', { cookie: ana2 })).json;
  assert.equal(team.people[0].has_sales, true);
});

/* ------------------------------------------------- sponsor by code (optional) */

test('sponsor code: the sign-up form can name whoever signed you up by their discount code', async () => {
  const [{ code, id }] = await query(`SELECT c.code, au.id FROM affiliate_users au JOIN codes c ON c.id = au.code_id WHERE au.email = 'ana@example.com'`);
  // typed any way a person would: lower case, stray spaces
  const r = await register({ email: 'elena@example.com', name: 'Elena Torres', sponsor_code: `  ${code.toLowerCase()} ` });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const [row] = await query(`SELECT sponsor_user_id, signup_source FROM affiliate_users WHERE email = 'elena@example.com'`);
  assert.equal(row.sponsor_user_id, id);
  assert.equal(row.signup_source, 'invite');
});

test('sponsor code: it is optional, and people signed up by Ascent itself have no sponsor', async () => {
  for (const blank of [undefined, '', '   ']) {
    const email = `solo${String(blank).length}@example.com`;
    assert.equal((await register({ email, name: 'Sin Patrocinador', sponsor_code: blank })).status, 200);
    const [row] = await query('SELECT sponsor_user_id, signup_source FROM affiliate_users WHERE email = $1', [email]);
    assert.equal(row.sponsor_user_id, null);
    assert.equal(row.signup_source, 'self');
  }
});

test('sponsor code: a code that does not exist is refused instead of silently ignored', async () => {
  const r = await register({ email: 'nadie2@example.com', sponsor_code: 'NOEXISTE99' });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'bad_invite');
  assert.equal((await query("SELECT 1 FROM affiliate_users WHERE email = 'nadie2@example.com'")).length, 0);
});

test('sponsor code: the form can check a code first, and only learns a first name', async () => {
  const [{ code }] = await query(`SELECT c.code FROM affiliate_users au JOIN codes c ON c.id = au.code_id WHERE au.email = 'ana@example.com'`);
  const ok = (await P('invite', { q: { code: code.toLowerCase() } })).json;
  assert.deepEqual(ok, { ok: true, sponsor: 'Ana' });
  assert.deepEqual((await P('invite', { q: { code: 'NOEXISTE99' } })).json, { ok: false });
});

test('sponsor code: checking codes over and over from one address is limited', async () => {
  const ip = '198.51.100.99';
  for (let i = 0; i < 8; i++) await P('invite', { q: { code: `GUESS${i}` }, ip });
  assert.equal((await P('invite', { q: { code: 'GUESS9' }, ip })).status, 429);
});

/* ------------------------------------------------ the owner sets the sponsor */

async function adminCookie() {
  const login = await call(admin, { method: 'POST', query: { a: 'login' }, body: { password: process.env.ADMIN_PASSWORD } });
  return cookieOf(login);
}
const codeOf = async email => (await query('SELECT c.id, c.code, au.id AS uid, au.sponsor_user_id FROM affiliate_users au JOIN codes c ON c.id = au.code_id WHERE au.email = $1', [email]))[0];

test('sponsor_set: only the owner can do it', async () => {
  const carla = await codeOf('carla@example.com');
  const anon = await call(admin, { method: 'POST', query: { a: 'sponsor_set' }, body: { code_id: carla.id, sponsor_code: 'X' } });
  assert.equal(anon.status, 401);
  // and an affiliate's own session is not an owner session
  const c = cookieOf(await P('login', { method: 'POST', body: { email: 'elena@example.com', password: GOOD.password } }));
  const asAffiliate = await call(admin, { method: 'POST', query: { a: 'sponsor_set' }, body: { code_id: carla.id, sponsor_code: 'X' }, headers: { cookie: c } });
  assert.equal(asAffiliate.status, 401);
});

test('sponsor_set: assign, change and remove, each written to the record', async () => {
  const cookie = await adminCookie();
  const set = body => call(admin, { method: 'POST', query: { a: 'sponsor_set' }, body, headers: { cookie } });
  const solo = await codeOf('solo0@example.com');        // signed up by Ascent: no sponsor
  const ana = await codeOf('ana@example.com');
  const beto = await codeOf('beto@example.com');
  assert.equal(solo.sponsor_user_id, null);
  const before = (await query('SELECT count(*)::int AS n FROM sponsor_changes'))[0].n;

  assert.equal((await set({ code_id: solo.id, sponsor_code: ana.code.toLowerCase() })).json.sponsor, 'Ana Lucía Pérez');
  assert.equal((await codeOf('solo0@example.com')).sponsor_user_id, ana.uid, 'assigned when there was none');

  assert.equal((await set({ code_id: solo.id, sponsor_code: beto.code })).status, 200);
  assert.equal((await codeOf('solo0@example.com')).sponsor_user_id, beto.uid, 'and changed afterwards: the owner decides');

  assert.equal((await set({ code_id: solo.id, sponsor_code: '' })).status, 200);
  assert.equal((await codeOf('solo0@example.com')).sponsor_user_id, null, 'and removed');

  const log = await query('SELECT old_sponsor_id, new_sponsor_id FROM sponsor_changes WHERE user_id = $1 ORDER BY id', [solo.uid]);
  assert.deepEqual(log.map(r => [r.old_sponsor_id, r.new_sponsor_id]), [[null, ana.uid], [ana.uid, beto.uid], [beto.uid, null]]);
  assert.equal((await query('SELECT count(*)::int AS n FROM sponsor_changes'))[0].n, before + 3);

  // setting the same one again changes nothing and logs nothing
  await set({ code_id: solo.id, sponsor_code: ana.code });
  const n = (await query('SELECT count(*)::int AS n FROM sponsor_changes'))[0].n;
  assert.equal((await set({ code_id: solo.id, sponsor_code: ana.code })).json.unchanged, true);
  assert.equal((await query('SELECT count(*)::int AS n FROM sponsor_changes'))[0].n, n);
});

test('sponsor_set: not oneself, no circles, and the code must exist', async () => {
  const cookie = await adminCookie();
  const set = body => call(admin, { method: 'POST', query: { a: 'sponsor_set' }, body, headers: { cookie } });
  const ana = await codeOf('ana@example.com');
  const beto = await codeOf('beto@example.com');      // Beto is under Ana
  assert.equal((await set({ code_id: ana.id, sponsor_code: ana.code })).json.error, 'self_sponsor');
  assert.equal((await set({ code_id: ana.id, sponsor_code: beto.code })).json.error, 'would_loop', 'Ana cannot go under her own referral');
  const carla = await codeOf('carla@example.com');   // Carla is under Beto, who is under Ana
  assert.equal((await set({ code_id: ana.id, sponsor_code: carla.code })).json.error, 'would_loop', 'nor under anyone further down');
  assert.equal((await set({ code_id: beto.id, sponsor_code: 'NOEXISTE99' })).json.error, 'bad_sponsor');
  assert.equal((await set({ code_id: 99999, sponsor_code: ana.code })).status, 404);
  assert.equal((await codeOf('ana@example.com')).sponsor_user_id, null, 'nothing changed');
});

test('sponsor_set: the owner\'s list shows who invited whom, and the sponsor\'s code', async () => {
  const cookie = await adminCookie();
  const list = (await call(admin, { query: { a: 'affiliates' }, headers: { cookie } })).json.affiliates;
  const beto = list.find(a => a.access_email === 'beto@example.com');
  assert.equal(beto.sponsor_name, 'Ana Lucía Pérez');
  assert.match(beto.sponsor_code, /^ANA/);

  // a sponsor whose account was made by the owner has no separate "name": the code's own name is used
  const diego = await codeOf('diego@example.com');
  const carla = await codeOf('carla@example.com');
  await call(admin, { method: 'POST', query: { a: 'sponsor_set' }, body: { code_id: carla.id, sponsor_code: diego.code }, headers: { cookie } });
  const again = (await call(admin, { query: { a: 'affiliates' }, headers: { cookie } })).json.affiliates.find(a => a.access_email === 'carla@example.com');
  assert.equal(again.sponsor_name, 'Diego Hernández');
});
