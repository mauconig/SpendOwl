import { pool } from './db.ts';

type Migration = { version: number; name: string; sql: string };

// Money is stored as INTEGER cents in EUR, the app's canonical currency —
// never floats. The client converts for display with the existing
// convertFromEUR()/formatMoney() helpers in src/theme.ts, which already
// take EUR. This replaces the hand-computed eur/usd/pyg triples that the
// old mockData.ts carried on every row.
const migrations: Migration[] = [
  {
    version: 1,
    name: 'init',
    sql: /* sql */ `
      CREATE TABLE users (
        id                   TEXT PRIMARY KEY,
        base_currency        TEXT NOT NULL DEFAULT 'EUR' CHECK (base_currency IN ('EUR', 'USD', 'PYG')),
        monthly_budget_minor INTEGER NOT NULL DEFAULT 240000,
        notif                BOOLEAN NOT NULL DEFAULT TRUE,
        bio                  BOOLEAN NOT NULL DEFAULT FALSE,
        seeded               BOOLEAN NOT NULL DEFAULT FALSE,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE transactions (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        merchant       TEXT NOT NULL,
        category       TEXT NOT NULL
                       CHECK (category IN ('food', 'bills', 'shopping', 'transport', 'income', 'debt')),
        -- Signed: negative is spend, positive is income.
        amount_minor   INTEGER NOT NULL,
        occurred_at    DATE NOT NULL,
        note           TEXT,
        tax_deductible BOOLEAN NOT NULL DEFAULT FALSE,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX transactions_user_date_idx ON transactions (user_id, occurred_at DESC);

      -- Receipts carry a free-text display category ('Food & Drink', 'Health')
      -- rather than a CatKey — the existing vault fixtures use labels outside
      -- the six transaction categories, so no CHECK here.
      CREATE TABLE receipts (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
        merchant       TEXT NOT NULL,
        amount_minor   INTEGER NOT NULL,
        occurred_at    DATE NOT NULL,
        status         TEXT NOT NULL CHECK (status IN ('ok', 'warn')),
        category       TEXT NOT NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX receipts_user_date_idx ON receipts (user_id, occurred_at DESC);

      -- 'cancelled' rather than 'off': clearer, and avoids quoting a column
      -- named after a Postgres keyword. The API still exposes it as "off" so
      -- the client's useSpendOwl() surface is unchanged.
      CREATE TABLE subscriptions (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name         TEXT NOT NULL,
        color        TEXT NOT NULL,
        price_minor  INTEGER NOT NULL CHECK (price_minor >= 0),
        day_of_month SMALLINT NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
        muted        BOOLEAN NOT NULL DEFAULT FALSE,
        cancelled    BOOLEAN NOT NULL DEFAULT FALSE,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX subscriptions_user_idx ON subscriptions (user_id);

      -- apr is DOUBLE PRECISION, not NUMERIC: node-postgres hands NUMERIC back
      -- as a string, and this value feeds straight into the float math in
      -- src/utils/payoff.ts.
      CREATE TABLE credit_cards (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name               TEXT NOT NULL,
        last4              TEXT NOT NULL CHECK (char_length(last4) = 4),
        balance_minor      INTEGER NOT NULL CHECK (balance_minor >= 0),
        credit_limit_minor INTEGER NOT NULL CHECK (credit_limit_minor >= 0),
        apr                DOUBLE PRECISION NOT NULL CHECK (apr >= 0),
        color              TEXT NOT NULL,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX credit_cards_user_idx ON credit_cards (user_id);

      -- 'scanning' is deliberately absent: it is a transient animation state
      -- the client shows while a receipt uploads, never a persisted message.
      CREATE TABLE messages (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind       TEXT NOT NULL CHECK (kind IN ('ai', 'user', 'voice', 'receipt', 'card')),
        payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX messages_user_created_idx ON messages (user_id, created_at);
    `,
  },
  {
    version: 2,
    name: 'insights',
    sql: /* sql */ `
      -- The "For you today" cards, written by the model once a day and cached
      -- here. Unlike every other table this holds *rendered prose*, not figures:
      -- the amounts are already formatted into title/body.
      --
      -- That is why 'currency' is a column. A card reading "₲1.850.000 left"
      -- becomes a lie the moment someone switches to EUR in Settings, so
      -- freshness is (generated_on = today AND currency = the user's current
      -- one) — a currency change invalidates the day for free, with no
      -- invalidation machinery anywhere else in the stack.
      CREATE TABLE insights (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        generated_on DATE NOT NULL,
        currency     TEXT NOT NULL CHECK (currency IN ('EUR', 'USD', 'PYG')),
        rank         SMALLINT NOT NULL,
        title        TEXT NOT NULL,
        body         TEXT NOT NULL,
        cta          TEXT NOT NULL,
        icon         TEXT NOT NULL,
        action       TEXT NOT NULL CHECK (action IN ('chat', 'dashboard', 'subscriptions', 'vault')),
        -- Optional deep-link target, currently only a receipt id for the vault
        -- action. ON DELETE CASCADE would take the whole card with the receipt;
        -- SET NULL correctly degrades it to "open the vault".
        target_id    UUID REFERENCES receipts(id) ON DELETE SET NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Makes regeneration idempotent: two Home mounts racing on app open
      -- cannot leave a day with eight cards instead of four.
      CREATE UNIQUE INDEX insights_user_day_rank_idx ON insights (user_id, generated_on, rank);
    `,
  },
  {
    version: 3,
    name: 'optional_card_last4',
    sql: /* sql */ `
      -- The last four digits are no longer asked for when adding a card: they
      -- identify nothing the app needs and are a chore to type off a physical
      -- card. The column stays because seeded and previously-entered cards do
      -- have them and still render "•••• 4471", so this only stops requiring it.
      ALTER TABLE credit_cards ALTER COLUMN last4 DROP NOT NULL;
      ALTER TABLE credit_cards DROP CONSTRAINT IF EXISTS credit_cards_last4_check;
      ALTER TABLE credit_cards
        ADD CONSTRAINT credit_cards_last4_check
        CHECK (last4 IS NULL OR char_length(last4) = 4);
    `,
  },
  {
    version: 4,
    name: 'bank_discounts',
    sql: /* sql */ `
      -- Card discounts/"reintegros" scraped from banks' own public promo pages
      -- (server/src/scraper/). Global, not user-scoped: every user sees the
      -- same bank offers, so there is no user_id here. A scraper run upserts on
      -- (bank, external_id) and deletes rows for promos no longer listed, so
      -- this table always mirrors the bank's current page rather than
      -- accumulating stale offers.
      --
      -- 'percent' is always the LOWER of a bank's tiered rates (e.g. GNB's
      -- Bases y Condiciones PDFs list a higher rate for Black/Premier cards
      -- and a lower one for Clasica/Oro) — the extraction step in
      -- scraper/extract.ts enforces that, never this table.
      CREATE TABLE bank_discounts (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bank                 TEXT NOT NULL,
        external_id          TEXT NOT NULL,
        merchant             TEXT NOT NULL,
        category             TEXT,
        percent              NUMERIC,
        installments         SMALLINT,
        eligible_days        TEXT,
        monthly_cap_minor    INTEGER,
        monthly_cap_currency TEXT CHECK (monthly_cap_currency IS NULL OR monthly_cap_currency IN ('EUR', 'USD', 'PYG')),
        valid_from           DATE,
        valid_until          DATE,
        description          TEXT NOT NULL,
        source_url           TEXT NOT NULL,
        bases_url            TEXT,
        scraped_at           TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX bank_discounts_bank_external_idx ON bank_discounts (bank, external_id);
    `,
  },
  {
    version: 5,
    name: 'transaction_card_link',
    sql: /* sql */ `
      -- Which card (if any) a transaction was paid with. SET NULL rather than
      -- CASCADE, mirroring the receipts.transaction_id precedent above:
      -- deleting a card should drop the tag, never the transaction history.
      ALTER TABLE transactions ADD COLUMN card_id UUID REFERENCES credit_cards(id) ON DELETE SET NULL;
    `,
  },
  {
    version: 6,
    name: 'bank_discounts_multi_merchant',
    sql: /* sql */ `
      -- Some promos are umbrellas covering dozens of affiliated merchants (e.g.
      -- GNB's "La Ruta Gastronómica" lists 112 restaurants in its Bases y
      -- Condiciones PDF) rather than being a single merchant themselves.
      -- scraper/extract.ts now expands those into one row per merchant, all
      -- sharing the same external_id — so external_id alone can no longer be
      -- unique; merchant joins it.
      DROP INDEX bank_discounts_bank_external_idx;
      CREATE UNIQUE INDEX bank_discounts_bank_external_merchant_idx ON bank_discounts (bank, external_id, merchant);
    `,
  },
  {
    version: 7,
    name: 'fx_rates',
    sql: /* sql */ `
      -- Daily FX snapshot, so a rate is fetched from the network at most once
      -- per day and every conversion after that is a local read.
      --
      -- DOUBLE PRECISION, not NUMERIC: node-postgres hands NUMERIC back as a
      -- string, and these values go straight into float arithmetic — the same
      -- trap already documented on credit_cards.apr.
      CREATE TABLE fx_rates (
        as_of DATE NOT NULL,
        base  TEXT NOT NULL,
        quote TEXT NOT NULL,
        rate  DOUBLE PRECISION NOT NULL CHECK (rate > 0),
        PRIMARY KEY (as_of, base, quote)
      );
    `,
  },
  {
    version: 8,
    name: 'subscriptions_charge_real_transactions',
    sql: /* sql */ `
      -- A subscription stops being a number and becomes a template: it holds
      -- the price in the currency it is actually billed in, and each month
      -- stamps out a real transaction converted at that month's rate.
      ALTER TABLE subscriptions
        ADD COLUMN currency     TEXT NOT NULL DEFAULT 'EUR',
        ADD COLUMN card_id      UUID REFERENCES credit_cards(id) ON DELETE SET NULL,
        ADD COLUMN charge_start DATE NOT NULL DEFAULT CURRENT_DATE;

      -- Existing rows keep meaning exactly what they meant before this
      -- migration: a plain amount in the user's own base currency.
      UPDATE subscriptions s
         SET currency = u.base_currency
        FROM users u
       WHERE u.id = s.user_id;

      -- charge_start defaults to today, so no historical charge is ever
      -- invented for a subscription that already existed. Backfilling would
      -- put amounts into the spend chart that never actually happened.

      -- Where a transaction came from, and how it got to this amount. Keeping
      -- the original alongside the converted figure is what makes a charge
      -- auditable — and what survives the user switching base currency later.
      ALTER TABLE transactions
        ADD COLUMN subscription_id   UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
        ADD COLUMN charge_period     TEXT,
        ADD COLUMN original_minor    INTEGER,
        ADD COLUMN original_currency TEXT,
        ADD COLUMN fx_rate           DOUBLE PRECISION;

      -- The idempotency key for the whole feature. materializeDueCharges runs
      -- on every read, so this index — not application logic — is what
      -- guarantees a subscription can never charge twice for the same month.
      -- Partial, because ordinary transactions have no subscription_id.
      CREATE UNIQUE INDEX transactions_sub_period_idx
        ON transactions (subscription_id, charge_period)
        WHERE subscription_id IS NOT NULL;
    `,
  },
];

export async function runMigrations(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const client = await pool.connect();
  try {
    // `node --watch` can restart the server mid-migration; the advisory lock
    // makes a second process wait rather than race on CREATE TABLE.
    await client.query('SELECT pg_advisory_lock($1)', [727_001]);

    const { rows } = await client.query<{ version: number }>('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map(row => row.version));

    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      console.log(`[migrate] applying ${migration.version}_${migration.name}`);
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [
          migration.version,
          migration.name,
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [727_001]);
    client.release();
  }
}
