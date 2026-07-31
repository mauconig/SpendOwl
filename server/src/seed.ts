import { query } from './db.ts';

/**
 * Creates the user row on first sight. Safe to call on every authenticated
 * request.
 *
 * This used to seed a month of demo transactions, receipts, subscriptions,
 * cards and chat messages, so a new account opened on a populated app rather
 * than an empty one. That is the wrong trade for a real release: a finance app
 * showing someone spending they never did is alarming rather than helpful, and
 * nothing on screen tells them which rows are invented. A new account now
 * starts genuinely empty, and every figure on the Dashboard is something the
 * user actually logged.
 *
 * `users.seeded` survives as a column because the migration list only ever
 * appends, but nothing reads it any more.
 */

// Users already provisioned in this process — avoids a round-trip on every
// authenticated request once the row exists.
const provisioned = new Set<string>();

export async function ensureUser(userId: string): Promise<void> {
  if (provisioned.has(userId)) return;
  // ON CONFLICT makes two concurrent first-requests harmless: whichever loses
  // the race simply finds the row already there.
  await query('INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [userId]);
  provisioned.add(userId);
}
