/* ===========================================================================
   Affiliate portal API.   /api/affiliate?a=<action>

     public     terms (GET)  invite (GET)  register (POST)  forgot (POST)  reset (POST)
     session    login (POST)  logout (POST)  me (GET)  change_password (POST)
     signed in  summary (GET)  team (GET)  accept_terms (POST)  set_language (POST)

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
const { json, body, guard, siteOrigin } = require('./_lib/http');
const crypto = require('crypto');
const plan = require('./_lib/plan');
const terms = require('./_lib/terms');
const mailer = require('./_lib/mailer');

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
  const mode = user.commission_mode === 'fixed' ? 'fixed' : (user.commission_mode === 'plan' ? 'plan' : 'tiers');
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

  const out = {
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

  /* Points affiliates do not see cash figures: the old cash ladder does not apply to
     them, and showing it would promise something the programme does not pay. */
  if (mode === 'plan') {
    out.month = null; out.tiers = []; out.months = [];
    out.owed_cop = out.owed_local = out.paid_cop = out.paid_local = 0;
    out.fx = { currency: cur, cop_per_unit: perUnit, source: null };
    out.orders = out.orders.map(o => { const { commission_cop, commission_local, ...rest } = o; return rest; });
  }
  return out;
}

/* Who is being named as the person that signed you up. Accepts either their discount
   code (the one they already know and share, e.g. MARIA47) or the code inside their
   invitation link. Returns { id, name } or null. */
async function findSponsor(raw) {
  const code = String(raw || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
  if (!code) return null;
  const rows = await query(
    `SELECT au.id, au.name, c.affiliate_name FROM affiliate_users au JOIN codes c ON c.id = au.code_id
      WHERE au.ref_code = $1 OR c.code = $1 LIMIT 1`, [code]);
  return rows.length ? { id: rows[0].id, name: rows[0].name || rows[0].affiliate_name || '' } : null;
}

const INVALID_PHONE = /[^0-9+()\s-]/;

function mailBody(lang, first, link) {
  return lang === 'en'
    ? { subject: 'Choose a new password for Ascent',
      text: `Hello ${first},\n\nYou asked to choose a new password. Open this link (it works for 1 hour):\n\n${link}\n\nIf you did not ask for this, you can ignore this message: your password has not changed.\n\nAscent Labs` }
    : { subject: 'Elige una contraseña nueva para Ascent',
      text: `Hola ${first},\n\nPediste elegir una contraseña nueva. Abre este enlace (sirve por 1 hora):\n\n${link}\n\nSi no fuiste tú, ignora este mensaje: tu contraseña no ha cambiado.\n\nAscent Labs` };
}

/* Ascent's own sign-up: the person, their code (7% for their customers) and who invited them. */
async function register(req, res) {
  const b = body(req);
  const ip = auth.clientIp(req);
  const key = `aff-reg:${ip}`;
  if (await auth.lockedOut(key)) return json(res, 429, { error: 'too_many_attempts' });
  await auth.recordFail(key);                         // every attempt counts, so sign-ups cannot be spammed

  const name = String(b.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const email = String(b.email || '').trim().toLowerCase().slice(0, 254);
  const password = String(b.password || '');
  const country = String(b.country || '').toUpperCase();
  const language = plan.LANGUAGES.includes(b.language) ? b.language : 'es';
  const phone = String(b.phone || '').trim().slice(0, 25);
  if (name.length < 2) return json(res, 400, { error: 'bad_name' });
  if (!EMAIL.test(email)) return json(res, 400, { error: 'bad_email' });
  if (password.length < MIN_LENGTH || password.length > 200) return json(res, 400, { error: 'weak_password' });
  if (!plan.COUNTRIES[country]) return json(res, 400, { error: 'bad_country' });
  if (phone && (INVALID_PHONE.test(phone) || phone.replace(/\D/g, '').length < 7)) return json(res, 400, { error: 'bad_phone' });
  if (b.accept !== true || b.terms_version !== terms.VERSION) return json(res, 400, { error: 'terms_required' });

  // optional: the code of whoever signed this person up. Left empty, the person was signed up by Ascent itself.
  let sponsorId = null;
  const given = String(b.sponsor_code || b.ref || '').trim();
  if (given) {
    const sp = await findSponsor(given);
    if (!sp) return json(res, 400, { error: 'bad_invite' });
    sponsorId = sp.id;
  }
  if ((await query('SELECT 1 FROM affiliate_users WHERE email = $1', [email])).length) return json(res, 409, { error: 'email_taken' });

  // their code, e.g. MARIA47: retried if that one is already taken
  let codeId = null;
  for (let i = 0; i < 10 && !codeId; i++) {
    try {
      const r = await query(
        `INSERT INTO codes (code, affiliate_name, discount_pct, commission_pct, active, commission_mode, payout_currency)
         VALUES ($1, $2, $3, 0, true, 'plan', $4) RETURNING id`,
        [plan.codeFromName(name), name, plan.PLAN_DISCOUNT_PCT, plan.COUNTRIES[country]]);
      codeId = r[0].id;
    } catch (e) { if (!(e && e.code === '23505')) throw e; }
  }
  if (!codeId) return json(res, 500, { error: 'server_error' });

  const hash = await hashPassword(password);
  let user = null;
  for (let i = 0; i < 10 && !user; i++) {
    try {
      const r = await query(
        `INSERT INTO affiliate_users (code_id, email, password_hash, must_change, name, phone, country, language, ref_code, sponsor_user_id, signup_source)
         VALUES ($1, $2, $3, false, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [codeId, email, hash, name, phone || null, country, language, plan.refCode(), sponsorId, sponsorId ? 'invite' : 'self']);
      user = { id: r[0].id, password_hash: hash };
    } catch (e) {
      if (!(e && e.code === '23505')) { await query('DELETE FROM codes WHERE id = $1', [codeId]); throw e; }
      if (/email/.test(String(e.constraint || e.detail || e.message))) {           // lost a race for the same email
        await query('DELETE FROM codes WHERE id = $1', [codeId]);
        return json(res, 409, { error: 'email_taken' });
      }                                                                            // otherwise the invite code collided: try another
    }
  }
  if (!user) { await query('DELETE FROM codes WHERE id = $1', [codeId]); return json(res, 500, { error: 'server_error' }); }

  await terms.record(user.id, { language, method: 'registro web', ip });
  return json(res, 200, { ok: true }, { 'Set-Cookie': aff.sessionCookie(req, user) });
}

async function forgot(req, res) {
  const b = body(req);
  const email = String(b.email || '').trim().toLowerCase().slice(0, 254);
  const keys = [`aff-forgot-ip:${auth.clientIp(req)}`, `aff-forgot-mail:${email}`];
  for (const k of keys) if (await auth.lockedOut(k)) return json(res, 429, { error: 'too_many_attempts' });
  for (const k of keys) await auth.recordFail(k);

  if (EMAIL.test(email)) {
    const rows = await query('SELECT id, name, language FROM affiliate_users WHERE email = $1', [email]);
    if (rows.length) {
      const u = rows[0];
      const token = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      await query(`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '60 minutes')`, [u.id, hash]);
      const link = `${siteOrigin(req)}/afiliados?reset=${token}`;
      const first = String(u.name || '').trim().split(/\s+/)[0] || '';
      const m = mailBody(u.language === 'en' ? 'en' : 'es', first, link);
      await mailer.send({ to: email, subject: m.subject, text: m.text });
    }
  }
  // the same answer whether or not the address has an account
  return json(res, 200, { ok: true });
}

async function reset(req, res) {
  const b = body(req);
  const key = `aff-reset:${auth.clientIp(req)}`;
  if (await auth.lockedOut(key)) return json(res, 429, { error: 'too_many_attempts' });
  const password = String(b.password || '');
  if (password.length < MIN_LENGTH || password.length > 200) return json(res, 400, { error: 'weak_password' });
  const hash = crypto.createHash('sha256').update(String(b.token || '')).digest('hex');
  const rows = await query(
    'SELECT id, user_id FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()', [hash]);
  if (!rows.length) { await auth.recordFail(key); return json(res, 400, { error: 'bad_token' }); }
  await query('UPDATE affiliate_users SET password_hash = $1, must_change = false WHERE id = $2', [await hashPassword(password), rows[0].user_id]);
  await query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [rows[0].user_id]);
  return json(res, 200, { ok: true });                 // every session issued before this is dead: it was signed with the old hash
}

module.exports = guard(async (req, res) => {
  const a = String((req.query && req.query.a) || '');
  const isPost = req.method === 'POST';
  if (!process.env.ADMIN_PASSWORD) return json(res, 503, { error: 'not_configured' });
  if (isPost && !auth.sameOrigin(req)) return json(res, 403, { error: 'bad_origin' });

  if (a === 'terms' && !isPost) return json(res, 200, terms.current(String(req.query.lang || 'es')));
  if (a === 'invite' && !isPost) {
    // lets the sign-up form say "Lucía is signing you up" so a mistyped code is caught; first name only, and limited per address
    const key = `aff-inv:${auth.clientIp(req)}`;
    if (await auth.lockedOut(key)) return json(res, 429, { error: 'too_many_attempts' });
    await auth.recordFail(key);
    const sp = await findSponsor(req.query.code || req.query.ref);
    return json(res, 200, sp ? { ok: true, sponsor: String(sp.name).trim().split(/\s+/)[0] || '' } : { ok: false });
  }
  if (a === 'register' && isPost) return register(req, res);
  if (a === 'forgot' && isPost) return forgot(req, res);
  if (a === 'reset' && isPost) return reset(req, res);

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
    if (!user) return json(res, 200, { authed: false });
    let ref = user.ref_code;
    if (!ref) {                                   // accounts made by the admin get their invite code the first time it is needed
      for (let i = 0; i < 10 && !ref; i++) {
        const cand = plan.refCode();
        try { await query('UPDATE affiliate_users SET ref_code = $1 WHERE id = $2 AND ref_code IS NULL', [cand, user.id]); ref = cand; }
        catch (e) { if (!(e && e.code === '23505')) throw e; }
      }
    }
    return json(res, 200, {
      authed: true, must_change: user.must_change, name: user.name || user.affiliate_name,
      language: user.language === 'en' ? 'en' : 'es', terms_needed: await terms.needed(user.id),
      mode: user.commission_mode, code: user.code, ref_code: ref, invite_url: ref ? `${siteOrigin(req)}/afiliados?ref=${ref}` : null,
    });
  }
  if (!user) return json(res, 401, { error: 'unauthorized' });

  if (a === 'accept_terms' && isPost) {
    if (body(req).version !== terms.VERSION) return json(res, 400, { error: 'terms_required' });
    await terms.record(user.id, { language: user.language, method: 'portal', ip: auth.clientIp(req) });
    return json(res, 200, { ok: true });
  }
  if (a === 'set_language' && isPost) {
    const language = plan.LANGUAGES.includes(body(req).language) ? body(req).language : null;
    if (!language) return json(res, 400, { error: 'bad_language' });
    await query('UPDATE affiliate_users SET language = $1 WHERE id = $2', [language, user.id]);
    return json(res, 200, { ok: true });
  }

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

  if ((a === 'summary' || a === 'team') && !isPost) {
    if (user.must_change) return json(res, 403, { error: 'must_change_password' });
    if (await terms.needed(user.id)) return json(res, 403, { error: 'terms_needed' });
    if (a === 'summary') return json(res, 200, await summary(user));

    // "Afiliados por mí": the people this affiliate invited, one level only, name shortened
    const rows = await query(
      `SELECT au.name, au.country, au.created_at,
              (SELECT count(*) FROM orders o WHERE o.code_id = au.code_id AND o.status = 'APPROVED')::int AS orders_paid
         FROM affiliate_users au WHERE au.sponsor_user_id = $1 ORDER BY au.created_at DESC LIMIT 500`, [user.id]);
    return json(res, 200, { people: rows.map(r => ({
      name: maskName(r.name), country: r.country, since: r.created_at, has_sales: r.orders_paid > 0 })) });
  }

  json(res, 404, { error: 'not_found' });
});
