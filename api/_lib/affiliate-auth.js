/* ===========================================================================
   Affiliate sessions.

   Separate from the admin session on purpose: a different cookie, scoped to
   /api, that can only ever read ONE affiliate's own data.

     cookie   <userId>.<expires>.<mac>     HttpOnly, SameSite=Strict
     mac      HMAC over id, expiry and a fingerprint of the stored password hash

   Because the fingerprint is part of the signature, changing or resetting a
   password immediately invalidates every session issued before it. The signing
   key is derived from ADMIN_PASSWORD, so there is no extra secret to configure;
   rotating that password signs every affiliate out too, which is acceptable.
   =========================================================================== */

const crypto = require('crypto');
const { query } = require('./db');

const COOKIE = 'ascent_aff';
const SESSION_HOURS = 12;

const sha = s => crypto.createHash('sha256').update(s, 'utf8');

function key() {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || pw.length < 10) throw new Error('ADMIN_PASSWORD must be set (10+ characters)');
  return sha(`ascent-affiliate-session|${pw}`).digest();
}

const fingerprint = hash => sha(String(hash)).digest('hex').slice(0, 24);
const mac = (id, expires, hash) =>
  crypto.createHmac('sha256', key()).update(`${id}.${expires}.${fingerprint(hash)}`).digest('hex');

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function sessionCookie(req, user) {
  const expires = Date.now() + SESSION_HOURS * 3600 * 1000;
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
  return `${COOKIE}=${user.id}.${expires}.${mac(user.id, expires, user.password_hash)}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}${secure}`;
}

const clearCookie = () => `${COOKIE}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0`;

/* The signed-in affiliate, or null. Loads the account and its code in one go. */
async function currentUser(req) {
  try {
    const raw = parseCookies(req)[COOKIE];
    if (!raw) return null;
    const [id, expires, given] = raw.split('.');
    if (!/^\d+$/.test(id || '') || !expires || !given || Number(expires) < Date.now()) return null;
    const rows = await query(
      `SELECT au.id, au.code_id, au.email, au.password_hash, au.must_change,
              c.code, c.affiliate_name, c.discount_pct, c.commission_pct, c.commission_mode, c.payout_currency, c.active
         FROM affiliate_users au JOIN codes c ON c.id = au.code_id
        WHERE au.id = $1`, [Number(id)]);
    if (!rows.length) return null;
    const user = rows[0];
    const a = Buffer.from(mac(user.id, expires, user.password_hash));
    const b = Buffer.from(given);
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? user : null;
  } catch (e) {
    return null;
  }
}

module.exports = { sessionCookie, clearCookie, currentUser };
