/* ===========================================================================
   Admin authentication.

   One administrator, one password, held in the ADMIN_PASSWORD environment
   variable. A correct password earns a signed, expiring, HttpOnly cookie.

     - The cookie is an expiry timestamp plus an HMAC of it. The key is derived
       from the password, so rotating the password signs every session out and
       there is no second secret to configure.
     - HttpOnly keeps page scripts from reading it; SameSite=Strict keeps other
       sites from riding it; Secure is set whenever the request came over HTTPS.
     - Wrong passwords are counted per IP in the database, so the limit holds
       across serverless instances. Eight misses in fifteen minutes locks that
       address out for the rest of the window.
     - Every state-changing request must come from this site (Origin check) and
       carry a JSON body, which a cross-site form cannot send.
   =========================================================================== */

const crypto = require('crypto');
const { query } = require('./db');

const COOKIE = 'ascent_admin';
const SESSION_HOURS = 8;
const MAX_FAILS = 8;
const WINDOW_MIN = 15;

const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest();

function secret() {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || pw.length < 10) throw new Error('ADMIN_PASSWORD must be set (10+ characters)');
  return sha(`ascent-admin-session|${pw}`);
}

function sign(expires) {
  return crypto.createHmac('sha256', secret()).update(String(expires)).digest('hex');
}

function passwordMatches(candidate) {
  const pw = process.env.ADMIN_PASSWORD || '';
  // compare fixed-length digests, so length and content leak nothing by timing
  return crypto.timingSafeEqual(sha(String(candidate)), sha(pw));
}

function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.headers['x-real-ip'] || 'unknown';
}

async function lockedOut(ip) {
  const rows = await query(
    "SELECT count(*)::int AS n FROM login_fail WHERE ip = $1 AND at > now() - ($2 || ' minutes')::interval",
    [ip, String(WINDOW_MIN)]
  );
  return rows[0].n >= MAX_FAILS;
}

async function recordFail(ip) {
  await query('INSERT INTO login_fail (ip) VALUES ($1)', [ip]);
  await query("DELETE FROM login_fail WHERE at < now() - interval '1 day'");
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function isAuthed(req) {
  try {
    const raw = parseCookies(req)[COOKIE];
    if (!raw) return false;
    const [expires, mac] = raw.split('.');
    if (!expires || !mac || Number(expires) < Date.now()) return false;
    const a = Buffer.from(sign(expires));
    const b = Buffer.from(mac);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

function sessionCookie(req) {
  const expires = Date.now() + SESSION_HOURS * 3600 * 1000;
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
  return `${COOKIE}=${expires}.${sign(expires)}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}${secure}`;
}

const clearCookie = () => `${COOKIE}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0`;

/* A request that changes state must be a same-origin JSON request. Browsers
   always send Origin on cross-site POSTs, so a mismatch is a forged request. A
   missing Origin (curl, server-to-server) carries no session cookie of a
   victim, so it is let through to the normal auth check. */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch (e) { return false; }
}

module.exports = {
  isAuthed, passwordMatches, sessionCookie, clearCookie,
  lockedOut, recordFail, clientIp, sameOrigin,
};
