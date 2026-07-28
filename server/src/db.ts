import pg from 'pg';
import { env } from './env.ts';

// node-postgres returns NUMERIC as a string to avoid precision loss. Every
// monetary column here is an INTEGER count of cents, so that concern does not
// apply — but BIGINT (OID 20) is parsed as a string for the same reason, and
// our aggregate SUM()s come back as BIGINT. Cents totals are far inside
// Number.MAX_SAFE_INTEGER, so parse them to numbers rather than hand strings
// to the arithmetic in the summary route.
pg.types.setTypeParser(pg.types.builtins.INT8, value => Number(value));

// DATE columns are calendar days with no time zone. node-postgres would hand
// them back as JS Date objects at local midnight, which shifts the day across
// a UTC boundary — a transaction dated the 1st can read back as the 31st.
// Keep them as the raw 'YYYY-MM-DD' string the client formats directly.
pg.types.setTypeParser(pg.types.builtins.DATE, value => value);

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export type Row = Record<string, unknown>;

export async function query<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

/** First row, or null. For lookups where zero rows is an expected outcome. */
export async function queryOne<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Runs `fn` inside a transaction, rolling back on any throw. */
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Postgres accepts connections a moment after the container reports healthy on
 * a cold `docker compose up`. Retry briefly so `npm run dev` right after
 * `db:up` doesn't fail on a race.
 */
export async function waitForDatabase(attempts = 10, delayMs = 1000): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}
