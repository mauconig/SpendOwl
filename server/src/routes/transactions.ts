import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../auth.ts';
import { materializeDueCharges } from '../charges.ts';
import { query, queryOne, transaction } from '../db.ts';

// Exported so the chat coach's propose_expense tool offers exactly these — a
// proposal carrying a category this endpoint would reject turns into a card the
// user can tap "Approve & log" on and get a 400.
export const CATEGORIES = ['food', 'bills', 'shopping', 'transport', 'income', 'debt'] as const;

const createSchema = z.object({
  merchant: z.string().trim().min(1).max(120),
  category: z.enum(CATEGORIES),
  // Signed cents. Integer-only: a float here is the bug this whole
  // minor-units convention exists to prevent.
  amountMinor: z.int(),
  occurredAt: z.iso.date().optional(),
  note: z.string().trim().max(280).nullish(),
  taxDeductible: z.boolean().optional(),
  cardId: z.uuid().optional(),
  // Which card this row paid *down*, set only on a card payment. The opposite
  // of cardId in every way that matters — see migration 12 — and what makes
  // deleting the payment give the debt back.
  paidCardId: z.uuid().optional(),
  // Set by the coach when a bank promo was applied (see ../cardDiscounts.ts).
  // amountMinor is already net of this; these record what came off and why.
  discountBank: z.string().trim().max(40).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  discountMinor: z.int().nonnegative().optional(),
});

const updateSchema = createSchema.partial();

const SELECT = `
  SELECT id,
         merchant,
         category,
         amount_minor    AS "amountMinor",
         occurred_at     AS "occurredAt",
         note,
         tax_deductible  AS "taxDeductible",
         card_id         AS "cardId",
         paid_card_id    AS "paidCardId",
         subscription_id AS "subscriptionId",
         original_minor  AS "originalMinor",
         original_currency AS "originalCurrency",
         fx_rate::float8 AS "fxRate",
         discount_bank    AS "discountBank",
         discount_percent AS "discountPercent",
         discount_minor   AS "discountMinor"
  FROM transactions
`;

/**
 * cardId only ever comes from a client's own already-loaded card list (or the
 * coach's server-side resolveByName in chat.ts), but this is a general REST
 * endpoint — verify it before writing rather than trusting the caller, the
 * same way chat.ts already scopes card lookups to the requesting user.
 */
async function ownsCard(userId: string, cardId: string): Promise<boolean> {
  const row = await queryOne('SELECT id FROM credit_cards WHERE id = $1 AND user_id = $2', [cardId, userId]);
  return row !== null;
}

export const transactionsRoute = new Hono<AppEnv>()

  .get('/', async c => {
    // Any subscription renewal that has come due appears in this list as an
    // ordinary transaction — see ../charges.ts.
    await materializeDueCharges(c.get('userId'));
    const rows = await query(`${SELECT} WHERE user_id = $1 ORDER BY occurred_at DESC, created_at DESC`, [
      c.get('userId'),
    ]);
    return c.json(rows);
  })

  .post('/', async c => {
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid body', issues: parsed.error.issues }, 400);
    const body = parsed.data;
    const userId = c.get('userId');

    for (const cardId of [body.cardId, body.paidCardId]) {
      if (cardId && !(await ownsCard(userId, cardId))) {
        return c.json({ error: 'Unknown card' }, 400);
      }
    }

    const row = await queryOne(
      `INSERT INTO transactions (user_id, merchant, category, amount_minor, occurred_at, note, tax_deductible, card_id,
                                 discount_bank, discount_percent, discount_minor, paid_card_id)
       VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6, COALESCE($7, FALSE), $8, $9, $10, $11, $12)
       RETURNING id, merchant, category, amount_minor AS "amountMinor", occurred_at AS "occurredAt",
                 note, tax_deductible AS "taxDeductible", card_id AS "cardId",
                 paid_card_id AS "paidCardId",
                 subscription_id AS "subscriptionId", original_minor AS "originalMinor",
                 original_currency AS "originalCurrency", fx_rate::float8 AS "fxRate",
                 discount_bank AS "discountBank", discount_percent AS "discountPercent",
                 discount_minor AS "discountMinor"`,
      [
        userId,
        body.merchant,
        body.category,
        body.amountMinor,
        body.occurredAt ?? null,
        body.note ?? null,
        body.taxDeductible ?? null,
        body.cardId ?? null,
        body.discountBank ?? null,
        body.discountPercent ?? null,
        body.discountMinor ?? null,
        body.paidCardId ?? null,
      ]
    );
    return c.json(row, 201);
  })

  .patch('/:id', async c => {
    const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid body', issues: parsed.error.issues }, 400);
    const body = parsed.data;
    const userId = c.get('userId');

    for (const cardId of [body.cardId, body.paidCardId]) {
      if (cardId && !(await ownsCard(userId, cardId))) {
        return c.json({ error: 'Unknown card' }, 400);
      }
    }

    // COALESCE keeps every omitted field at its current value, so a partial
    // patch never blanks a column.
    const row = await queryOne(
      `UPDATE transactions
          SET merchant       = COALESCE($3, merchant),
              category       = COALESCE($4, category),
              amount_minor   = COALESCE($5, amount_minor),
              occurred_at    = COALESCE($6::date, occurred_at),
              note           = COALESCE($7, note),
              tax_deductible = COALESCE($8, tax_deductible),
              card_id        = COALESCE($9, card_id),
              paid_card_id   = COALESCE($10, paid_card_id)
        WHERE id = $1 AND user_id = $2
        RETURNING id, merchant, category, amount_minor AS "amountMinor", occurred_at AS "occurredAt",
                  note, tax_deductible AS "taxDeductible", card_id AS "cardId",
                  paid_card_id AS "paidCardId",
                 subscription_id AS "subscriptionId", original_minor AS "originalMinor",
                 original_currency AS "originalCurrency", fx_rate::float8 AS "fxRate",
                 discount_bank AS "discountBank", discount_percent AS "discountPercent",
                 discount_minor AS "discountMinor"`,
      [
        c.req.param('id'),
        userId,
        body.merchant ?? null,
        body.category ?? null,
        body.amountMinor ?? null,
        body.occurredAt ?? null,
        body.note ?? null,
        body.taxDeductible ?? null,
        body.cardId ?? null,
        body.paidCardId ?? null,
      ]
    );
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(row);
  })

  /**
   * Deleting a movement puts the money back where it came from.
   *
   * The account balance needs nothing done to it: summary.ts derives it by
   * summing the transactions table, so a row that is gone is already refunded.
   * Everything below is about the two places money lives that are *not* derived
   * from this table — a card's balance, and a subscription's sense of which
   * months it has already charged.
   *
   * All of it in one database transaction: a delete that removed the row but
   * failed to lower the card would leave the debt owed forever, with nothing on
   * screen to explain it or any way to undo it.
   */
  .delete('/:id', async c => {
    const userId = c.get('userId');

    const removed = await transaction(async client => {
      const { rows } = await client.query<{
        amountMinor: number;
        cardId: string | null;
        paidCardId: string | null;
        subscriptionId: string | null;
        chargePeriod: string | null;
      }>(
        `DELETE FROM transactions
          WHERE id = $1 AND user_id = $2
        RETURNING amount_minor    AS "amountMinor",
                  card_id         AS "cardId",
                  paid_card_id    AS "paidCardId",
                  subscription_id AS "subscriptionId",
                  charge_period   AS "chargePeriod"`,
        [c.req.param('id'), userId]
      );
      const row = rows[0];
      if (!row) return null;

      // Buying with a card raised what that card owes. Un-buying lowers it.
      if (row.cardId && row.amountMinor < 0) {
        await client.query(
          `UPDATE credit_cards SET balance_minor = balance_minor - $3 WHERE id = $1 AND user_id = $2`,
          [row.cardId, userId, Math.abs(row.amountMinor)]
        );
      }

      // A payment *towards* a card is the mirror image: it lowered the balance,
      // so undoing it owes the money again. Never both — a row is either a
      // purchase on a card or a payment to one.
      if (row.paidCardId) {
        await client.query(
          `UPDATE credit_cards SET balance_minor = balance_minor + $3 WHERE id = $1 AND user_id = $2`,
          [row.paidCardId, userId, Math.abs(row.amountMinor)]
        );
      }

      // The row was stamped out by a subscription, and ../charges.ts refills any
      // month it finds empty on the next read. Without this the delete survives
      // exactly until the list is refetched, which is roughly a second.
      if (row.subscriptionId && row.chargePeriod) {
        await client.query(
          `INSERT INTO subscription_charge_skips (subscription_id, charge_period)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [row.subscriptionId, row.chargePeriod]
        );
      }

      return row;
    });

    if (!removed) return c.json({ error: 'Not found' }, 404);
    return c.body(null, 204);
  });
