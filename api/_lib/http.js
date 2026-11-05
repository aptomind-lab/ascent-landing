/* Small helpers shared by the API handlers. */

function json(res, status, body, headers) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers || {})) res.setHeader(k, v);
  res.status(status).send(JSON.stringify(body));
}

/* Vercel parses a JSON body into req.body. Anything that is not a plain object
   (a string, an array, nothing) is treated as an empty body rather than
   trusted. */
function body(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  return b && typeof b === 'object' && !Array.isArray(b) ? b : {};
}

function siteOrigin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  return `${proto}://${host}`;
}

/* The handler's last line of defence. The real error goes to the server log;
   the client gets a generic one, so a failure never leaks a table name or a
   connection string. */
function guard(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (e) {
      console.error('[api error]', req.url, e && e.stack ? e.stack : e);
      if (!res.headersSent) json(res, 500, { error: 'server_error' });
    }
  };
}

module.exports = { json, body, siteOrigin, guard };
