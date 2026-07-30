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
