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
  commission_mode    text NOT NULL DEFAULT 'tiers' CHECK (commission_mode IN ('tiers', 'fixed', 'plan')),
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

-- Self-service affiliates (Stage 1 of the Points plan). An affiliate account is
-- still affiliate_users; these columns say who the person is and who invited them.
-- sponsor_user_id is set once, at sign-up, and is never updated afterwards.
ALTER TABLE affiliate_users ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE affiliate_users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE affiliate_users ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE affiliate_users ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'es';
ALTER TABLE affiliate_users ADD COLUMN IF NOT EXISTS ref_code text;
ALTER TABLE affiliate_users ADD COLUMN IF NOT EXISTS sponsor_user_id integer REFERENCES affiliate_users(id);
ALTER TABLE affiliate_users ADD COLUMN IF NOT EXISTS signup_source text NOT NULL DEFAULT 'admin';
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_users_ref_idx ON affiliate_users (ref_code) WHERE ref_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS affiliate_users_sponsor_idx ON affiliate_users (sponsor_user_id);

-- The commission mode 'plan' (Points) joins 'tiers' and 'fixed'.
ALTER TABLE codes DROP CONSTRAINT IF EXISTS codes_commission_mode_check;
ALTER TABLE codes DROP CONSTRAINT IF EXISTS codes_mode_chk, ADD CONSTRAINT codes_mode_chk CHECK (commission_mode IN ('tiers', 'fixed', 'plan'));

-- Every time the owner changes who an affiliate's sponsor is, for the record.
CREATE TABLE IF NOT EXISTS sponsor_changes (
  id              serial PRIMARY KEY,
  user_id         integer NOT NULL REFERENCES affiliate_users(id) ON DELETE CASCADE,
  old_sponsor_id  integer,
  new_sponsor_id  integer,
  source          text NOT NULL DEFAULT 'admin',
  changed_at      timestamptz NOT NULL DEFAULT now()
);

-- Proof that an affiliate accepted the policies: which version, when, how and from where.
CREATE TABLE IF NOT EXISTS terms_acceptances (
  id           serial PRIMARY KEY,
  user_id      integer NOT NULL REFERENCES affiliate_users(id) ON DELETE CASCADE,
  version      text NOT NULL,
  language     text NOT NULL,
  method       text NOT NULL,
  ip           text,
  accepted_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS terms_acceptances_user_idx ON terms_acceptances (user_id, accepted_at DESC);

-- One-time links to choose a new password. Only a hash of the token is stored.
CREATE TABLE IF NOT EXISTS password_resets (
  id          serial PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES affiliate_users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- Points plan (Stage 2)
-- The value of an order in MXN, frozen the first time a month that counts it is closed.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_mxn numeric(14,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_mxn_at timestamptz;

-- One row per closed month. Months close in order, one at a time.
CREATE TABLE IF NOT EXISTS monthly_closes (
  month            text PRIMARY KEY,
  status           text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'closed')),
  closed_by        text,
  closed_at        timestamptz NOT NULL DEFAULT now(),
  orders           integer NOT NULL DEFAULT 0,
  volume_mxn       numeric(16,2) NOT NULL DEFAULT 0,
  points           bigint NOT NULL DEFAULT 0,
  referral_points  bigint NOT NULL DEFAULT 0
);

-- What each affiliate did in a closed month: volume, level reached, percentage and Points.
CREATE TABLE IF NOT EXISTS member_months (
  user_id              integer NOT NULL REFERENCES affiliate_users(id),
  month                text NOT NULL REFERENCES monthly_closes(month),
  own_mxn              numeric(16,2) NOT NULL,
  sales_mxn            numeric(16,2) NOT NULL,
  volume_mxn           numeric(16,2) NOT NULL,
  qualified            boolean NOT NULL,
  floor_running        boolean NOT NULL,
  rate_pct             numeric(5,2) NOT NULL,
  level                integer NOT NULL,
  points               bigint NOT NULL,
  referral_points      bigint NOT NULL,
  referral_volume_mxn  numeric(16,2) NOT NULL,
  PRIMARY KEY (user_id, month)
);

-- The Points ledger. It only ever grows: the two rules below make the database ignore any
-- attempt to change or delete a row. A mistake is fixed by adding an 'adjust' row.
CREATE TABLE IF NOT EXISTS points_ledger (
  id              bigserial PRIMARY KEY,
  user_id         integer NOT NULL REFERENCES affiliate_users(id),
  kind            text NOT NULL CHECK (kind IN ('earn_purchase', 'earn_referral', 'redeem', 'release', 'expire', 'adjust')),
  points          integer NOT NULL,
  order_id        integer REFERENCES orders(id),
  month           text,
  source_user_id  integer REFERENCES affiliate_users(id),
  available_at    timestamptz NOT NULL DEFAULT now(),
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS points_ledger_order_kind_idx ON points_ledger (order_id, kind) WHERE kind IN ('earn_purchase', 'earn_referral');
CREATE INDEX IF NOT EXISTS points_ledger_user_idx ON points_ledger (user_id, id DESC);
CREATE OR REPLACE RULE points_ledger_no_update AS ON UPDATE TO points_ledger DO INSTEAD NOTHING;
CREATE OR REPLACE RULE points_ledger_no_delete AS ON DELETE TO points_ledger DO INSTEAD NOTHING;

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
