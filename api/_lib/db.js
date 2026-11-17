/* ===========================================================================
   Database access.

   One function, query(text, params) -> rows, so nothing else in the backend
   knows which driver is underneath:

     DATABASE_URL set          Neon Postgres over HTTP (production, previews)
     ASCENT_TEST_DB=pglite     an in-memory Postgres, for the test suite only

   Anything else is a hard error rather than a silent fallback. A backend that
   quietly "works" without a database would take orders it cannot record, and
   an order that is paid but not recorded is the worst failure this system can
   have.

   The schema is created on first use (CREATE TABLE IF NOT EXISTS), so there is
   no migration step between "create the Neon database" and "it works".
   =========================================================================== */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Only products switched OFF are stored. A product with no row is available,
-- so a brand-new catalogue entry is sellable without anyone adding a row.
CREATE TABLE IF NOT EXISTS stock_off (
  key         text PRIMARY KEY,           -- "Name|Size", same key as markets.js
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS codes (
  id                 serial PRIMARY KEY,
  code               text NOT NULL UNIQUE, -- stored upper-case
  affiliate_name     text NOT NULL,
  affiliate_contact  text,
  discount_pct       numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  commission_pct     numeric(5,2) NOT NULL DEFAULT 0 CHECK (commission_pct >= 0 AND commission_pct <= 100),
  commission_mode    text NOT NULL DEFAULT 'tiers' CHECK (commission_mode IN ('tiers', 'fixed')),
  payout_currency    text NOT NULL DEFAULT 'COP' CHECK (payout_currency IN ('COP', 'MXN', 'USD')),
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Every figure exists twice: *_local in the market's own currency (what the
-- buyer was quoted) and *_cop in pesos (what Wompi actually charged). Reports
-- and commissions run on the peso figures, because that is the money that moved.
CREATE TABLE IF NOT EXISTS orders (
  id                   serial PRIMARY KEY,
  reference            text NOT NULL UNIQUE,
  status               text NOT NULL DEFAULT 'PENDING',
  market               text NOT NULL,
  currency             text NOT NULL,
  items                jsonb NOT NULL,
  subtotal_local       numeric(14,2) NOT NULL,
  discount_pct         numeric(5,2) NOT NULL DEFAULT 0,
  discount_local       numeric(14,2) NOT NULL DEFAULT 0,
  total_local          numeric(14,2) NOT NULL,
  trm                  numeric(12,4),
  subtotal_cop         bigint NOT NULL,
  discount_cop         bigint NOT NULL DEFAULT 0,
  charge_cop           bigint NOT NULL,
  code_id              integer REFERENCES codes(id),
  code_text            text,
  commission_pct       numeric(5,2) NOT NULL DEFAULT 0,
  commission_cop       bigint NOT NULL DEFAULT 0,
  customer_name        text,
  customer_email       text,
  customer_phone       text,
  shipping             jsonb,
  wompi_tx_id          text,
  paid_at              timestamptz,
  commission_paid_at   timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_code_idx    ON orders (code_id);
CREATE INDEX IF NOT EXISTS orders_status_idx  ON orders (status);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders (created_at DESC);

-- One portal login per affiliate code. The password is stored only as a scrypt
-- hash; a temporary one is shown to the admin once and must be changed at first login.
CREATE TABLE IF NOT EXISTS affiliate_users (
  id             serial PRIMARY KEY,
  code_id        integer NOT NULL UNIQUE REFERENCES codes(id),
  email          text NOT NULL UNIQUE,
  password_hash  text NOT NULL,
  must_change    boolean NOT NULL DEFAULT true,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- A month of commission that has been paid out. The amount and rate are frozen
-- here, so changing the tiers later never rewrites what was actually paid.
CREATE TABLE IF NOT EXISTS commission_payouts (
  id          serial PRIMARY KEY,
  code_id     integer NOT NULL REFERENCES codes(id),
  month       text NOT NULL,
  sales_cop   bigint NOT NULL,
  rate_pct    numeric(5,2) NOT NULL,
  amount_cop  bigint NOT NULL,
  currency      text NOT NULL DEFAULT 'COP',
  amount_local  numeric(14,2),
  fx_rate       numeric(16,6) NOT NULL DEFAULT 1,
  paid_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code_id, month)
);

ALTER TABLE codes ADD COLUMN IF NOT EXISTS commission_mode text NOT NULL DEFAULT 'tiers';
ALTER TABLE codes ADD COLUMN IF NOT EXISTS payout_currency text NOT NULL DEFAULT 'COP';
ALTER TABLE commission_payouts ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'COP';
ALTER TABLE commission_payouts ADD COLUMN IF NOT EXISTS amount_local numeric(14,2);
ALTER TABLE commission_payouts ADD COLUMN IF NOT EXISTS fx_rate numeric(16,6) NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS login_fail (
  ip  text NOT NULL,
  at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_fail_ip_idx ON login_fail (ip, at DESC);
`;

let ready = null;

async function connect() {
  if (process.env.DATABASE_URL) {
    const { neon } = require('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    return (text, params = []) => sql.query(text, params);
  }
  if (process.env.ASCENT_TEST_DB === 'pglite') {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite();
    return async (text, params = []) => (await db.query(text, params)).rows;
  }
  throw new Error('DATABASE_URL is not set');
}

async function init() {
  const run = await connect();
  // one statement per call: the Neon HTTP driver does not accept a script
  // comments are removed first, so a semicolon inside one can never split a statement
  const script = SCHEMA.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
  for (const stmt of script.split(';').map(s => s.trim()).filter(Boolean)) {
    await run(stmt);
  }
  return run;
}

/* Memoised as a promise, so concurrent first requests share one schema pass. A
   failure is not cached: the next request tries again instead of the function
   instance staying broken until it is recycled. */
function db() {
  if (!ready) ready = init().catch(err => { ready = null; throw err; });
  return ready;
}

async function query(text, params) {
  const run = await db();
  return run(text, params);
}

// test hook: a fresh in-memory database
function _reset() { ready = null; }

const configured = () => Boolean(process.env.DATABASE_URL || process.env.ASCENT_TEST_DB === 'pglite');

module.exports = { query, configured, _reset };
