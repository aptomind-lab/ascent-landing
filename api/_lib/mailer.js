/* ===========================================================================
   Outgoing email, through Resend's HTTP API (no extra package).

   RESEND_API_KEY   the key for this project (set by the owner in Vercel)
   MAIL_FROM        the sender, on a domain verified in Resend,
                    e.g. "Ascent Labs <no-reply@ascentcompounds.com>"

   When either is missing nothing is sent and send() says so; the callers then
   answer exactly as if it had worked, so the site never reveals whether an
   email exists. Tests and the local dev server replace the transport.
   =========================================================================== */

let transport = null;

function setTransport(fn) { transport = fn; }

const configured = () => Boolean(transport || (process.env.RESEND_API_KEY && process.env.MAIL_FROM));

async function send({ to, subject, text }) {
  if (transport) { await transport({ to, subject, text }); return { sent: true }; }
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return { sent: false, reason: 'not_configured' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text }),
  });
  if (!res.ok) {
    console.error('[mail] Resend answered', res.status);      // never log the body or the key
    return { sent: false, reason: 'provider_error' };
  }
  return { sent: true };
}

module.exports = { send, setTransport, configured };
