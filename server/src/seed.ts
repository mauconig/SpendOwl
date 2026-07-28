import { transaction } from './db.ts';

// Demo fixtures mirroring the old src/store/mockData.ts, so a new account opens
// on a populated app rather than an empty one.
//
// One deliberate difference: the old fixtures were internally inconsistent.
// `CATS` in theme.ts claimed €1,116 of monthly spend across four categories,
// but the seven-row `TX` list only accounted for about €165 of it — the totals
// and the transaction list were separate inventions that never had to agree.
// Now that category totals are SUM()ed from real rows, they do have to agree,
// so this seeds a full month of transactions (~€1,212 spend against the €2,400
// budget) instead of seven. Category totals will therefore not match the old
// hardcoded literals exactly; they are computed from these rows.

type SeedTx = { merchant: string; category: string; minor: number; daysAgo: number; note?: string };

// Negative is spend, positive is income — matching the `amount_minor` convention.
const TRANSACTIONS: SeedTx[] = [
  // Food & Drink
  { merchant: 'Mercado Central', category: 'food', minor: -2380, daysAgo: 0, note: '3 items · Groceries' },
  { merchant: 'Blue Bottle Coffee', category: 'food', minor: -450, daysAgo: 0 },
  { merchant: 'Mercado Central', category: 'food', minor: -1240, daysAgo: 1, note: 'Lunch · logged from chat' },
  { merchant: 'Café Luna', category: 'food', minor: -380, daysAgo: 2 },
  { merchant: 'Panadería', category: 'food', minor: -620, daysAgo: 3 },
  { merchant: 'Mercado Central', category: 'food', minor: -4115, daysAgo: 5 },
  { merchant: 'Sushi Ya', category: 'food', minor: -2890, daysAgo: 6 },
  { merchant: 'Aldi', category: 'food', minor: -6230, daysAgo: 7 },
  { merchant: 'Trattoria', category: 'food', minor: -3450, daysAgo: 9 },
  { merchant: 'Mercado Central', category: 'food', minor: -3875, daysAgo: 10 },
  { merchant: 'Bar Central', category: 'food', minor: -960, daysAgo: 11 },
  { merchant: 'Aldi', category: 'food', minor: -5460, daysAgo: 12 },
  { merchant: 'Aldi', category: 'food', minor: -4720, daysAgo: 13 },
  { merchant: 'Café Luna', category: 'food', minor: -430, daysAgo: 14 },
  { merchant: 'Mercado Central', category: 'food', minor: -4030, daysAgo: 15 },

  // Bills & Subs
  { merchant: 'Internet fibra', category: 'bills', minor: -3800, daysAgo: 4 },
  { merchant: 'Netflix', category: 'bills', minor: -1399, daysAgo: 6 },
  { merchant: 'Basic Fit', category: 'bills', minor: -2499, daysAgo: 8 },
  { merchant: 'Endesa', category: 'bills', minor: -7840, daysAgo: 9 },
  { merchant: 'Vodafone', category: 'bills', minor: -4200, daysAgo: 11 },
  { merchant: 'Agua municipal', category: 'bills', minor: -2130, daysAgo: 13 },
  { merchant: 'iCloud+', category: 'bills', minor: -299, daysAgo: 14 },
  { merchant: 'Spotify', category: 'bills', minor: -1099, daysAgo: 15 },
  { merchant: 'Seguro hogar', category: 'bills', minor: -3410, daysAgo: 16 },
  { merchant: 'Gas Natural', category: 'bills', minor: -5199, daysAgo: 17 },

  // Shopping
  { merchant: 'IKEA', category: 'shopping', minor: -8990, daysAgo: 4 },
  { merchant: 'Zara', category: 'shopping', minor: -4590, daysAgo: 7 },
  { merchant: 'Farmacia Sol', category: 'shopping', minor: -845, daysAgo: 8 },
  { merchant: 'Librería', category: 'shopping', minor: -1860, daysAgo: 10 },
  { merchant: 'Decathlon', category: 'shopping', minor: -5200, daysAgo: 12 },
  { merchant: 'Papelería', category: 'shopping', minor: -2155, daysAgo: 15 },

  // Transport
  { merchant: 'Uber', category: 'transport', minor: -1120, daysAgo: 1 },
  { merchant: 'Uber', category: 'transport', minor: -890, daysAgo: 5 },
  { merchant: 'Gasolina', category: 'transport', minor: -6230, daysAgo: 9 },
  { merchant: 'Taller Motor', category: 'transport', minor: -14000, daysAgo: 10 },
  { merchant: 'Metro pass', category: 'transport', minor: -2250, daysAgo: 16 },

  // Income
  { merchant: 'Freelance invoice #114', category: 'income', minor: 185000, daysAgo: 3 },
];

type SeedReceipt = { merchant: string; minor: number; daysAgo: number; status: 'ok' | 'warn'; category: string };

const RECEIPTS: SeedReceipt[] = [
  { merchant: 'Mercado Central', minor: -2380, daysAgo: 4, status: 'ok', category: 'Food & Drink' },
  { merchant: 'Uber', minor: -1120, daysAgo: 5, status: 'ok', category: 'Transport' },
  { merchant: 'IKEA', minor: -8990, daysAgo: 6, status: 'warn', category: 'Shopping' },
  { merchant: 'Farmacia Sol', minor: -845, daysAgo: 8, status: 'ok', category: 'Health' },
  { merchant: 'Taller Motor', minor: -14000, daysAgo: 10, status: 'warn', category: 'Transport' },
  { merchant: 'Aldi', minor: -5460, daysAgo: 12, status: 'ok', category: 'Food & Drink' },
];

const SUBSCRIPTIONS = [
  { name: 'Spotify', color: '#4ADE80', minor: 1099, day: 3, muted: false },
  { name: 'Netflix', color: '#F0A878', minor: 1399, day: 12, muted: false },
  { name: 'iCloud+', color: '#78ADEE', minor: 299, day: 18, muted: true },
  { name: 'Basic Fit', color: '#C9B8F5', minor: 2499, day: 25, muted: false },
];

const CREDIT_CARDS = [
  { name: 'Visa Signature', last4: '4471', balance: 124000, limit: 500000, apr: 22.99, color: '#78ADEE' },
  { name: 'Mastercard World', last4: '8823', balance: 43000, limit: 250000, apr: 19.99, color: '#F0A878' },
];

const MESSAGES = [
  {
    kind: 'ai',
    payload: { text: "Morning. You're €38 under your usual pace this week — nice." },
    minutesAgo: 90,
  },
  { kind: 'user', payload: { text: 'add my lunch — 12.40 at the market' }, minutesAgo: 80 },
  {
    kind: 'card',
    payload: {
      merchant: 'Mercado Central',
      cat: 'food',
      amountMinor: -1240,
      note: 'Lunch · logged from chat',
    },
    minutesAgo: 79,
  },
];

/** Postgres DATE literal for `daysAgo` days before today, in UTC. */
function dateDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

// Users already provisioned this process — avoids a round-trip on every single
// authenticated request once the row exists. Seeding itself is guarded in the
// database, so a cold start after a restart is still safe.
const provisioned = new Set<string>();

/**
 * Creates the user row and seeds demo data on first sight. Safe to call on
 * every request and safe against two concurrent first-requests: the seed check
 * takes a row lock, so the loser waits and then observes `seeded = true`.
 */
export async function ensureUser(userId: string): Promise<void> {
  if (provisioned.has(userId)) return;

  await transaction(async client => {
    await client.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [userId]);

    const { rows } = await client.query<{ seeded: boolean }>(
      'SELECT seeded FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    if (rows[0]?.seeded) return;

    for (const tx of TRANSACTIONS) {
      await client.query(
        `INSERT INTO transactions (user_id, merchant, category, amount_minor, occurred_at, note)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, tx.merchant, tx.category, tx.minor, dateDaysAgo(tx.daysAgo), tx.note ?? null]
      );
    }

    for (const receipt of RECEIPTS) {
      await client.query(
        `INSERT INTO receipts (user_id, merchant, amount_minor, occurred_at, status, category)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, receipt.merchant, receipt.minor, dateDaysAgo(receipt.daysAgo), receipt.status, receipt.category]
      );
    }

    for (const sub of SUBSCRIPTIONS) {
      await client.query(
        `INSERT INTO subscriptions (user_id, name, color, price_minor, day_of_month, muted)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, sub.name, sub.color, sub.minor, sub.day, sub.muted]
      );
    }

    for (const card of CREDIT_CARDS) {
      await client.query(
        `INSERT INTO credit_cards (user_id, name, last4, balance_minor, credit_limit_minor, apr, color)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, card.name, card.last4, card.balance, card.limit, card.apr, card.color]
      );
    }

    for (const message of MESSAGES) {
      await client.query(
        `INSERT INTO messages (user_id, kind, payload, created_at)
         VALUES ($1, $2, $3, now() - ($4 || ' minutes')::interval)`,
        [userId, message.kind, JSON.stringify(message.payload), String(message.minutesAgo)]
      );
    }

    await client.query('UPDATE users SET seeded = TRUE WHERE id = $1', [userId]);
  });

  provisioned.add(userId);
}
