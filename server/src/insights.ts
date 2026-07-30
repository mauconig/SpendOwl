import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { type Currency, decimalsFor, minorToDisplay } from './currency.ts';
import { query, transaction } from './db.ts';
import { env } from './env.ts';
import { getSummary } from './summary.ts';

/**
 * The Home screen's "For you today" cards.
 *
 * HomeScreen used to build these from four hardcoded rules — pace, top
 * category, upcoming renewals, facturas needing review. Every figure was real,
 * but the app could only ever notice the four things someone thought to write
 * an `if` for. This lets it notice the rest: a merchant that has quietly become
 * the second-biggest line item, three renewals landing on the same day, a week
 * that looks nothing like the last three.
 *
 * Two things separate this from the chat coach in routes/chat.ts:
 *
 * 1. **No tool loop.** We already know exactly which data is relevant, so we
 *    gather it and hand it over in one call. The model's only job is to notice
 *    and phrase — it never decides what to fetch. One request, bounded latency.
 * 2. **The tool is the output schema, not an action.** `emit_insights` is
 *    forced with tool_choice, so a card is a validated object rather than prose
 *    to be parsed. Free-text JSON was the alternative and is markedly less
 *    reliable through the compatibility shim.
 *
 * Those four rules still exist in the client and render whenever this produces
 * nothing — no API key, failed call, generation not yet run. Home is never
 * blank and never wrong; the AI is an upgrade over the floor, not a dependency.
 */

const MAX_TOKENS = 2048;
const MAX_CARDS = 4;
const TX_SAMPLE = 25;

// Names that already exist in src/icons.tsx. The client maps each to a palette
// colour — deliberately not a model choice, since a model picking hex values
// only ever drifts off-palette.
const ICONS = ['trendUp', 'trendDown', 'pie', 'bars', 'warn', 'spark', 'card'] as const;

// A card cannot carry a closure, so it names a destination and the client
// resolves it to the same navigation the rule cards already used.
const ACTIONS = ['chat', 'dashboard', 'subscriptions', 'vault'] as const;

/**
 * Facturas are parked — mirrors FACTURAS_ENABLED in src/store/constants.ts,
 * which explains the whole switch-off. Client and server share no module, so
 * turning facturas back on means turning both back on.
 *
 * Here it does two things: the `vault` action is not offered, and facturas are
 * left out of the snapshot entirely. The second matters more than the first —
 * a model that can see unreviewed facturas will write a card urging you to
 * review them no matter which action it is allowed to attach.
 */
const FACTURAS_ENABLED: boolean = false;

const OFFERED_ACTIONS = ACTIONS.filter(a => a !== 'vault' || FACTURAS_ENABLED);

export type Insight = {
  title: string;
  body: string;
  cta: string;
  icon: (typeof ICONS)[number];
  action: (typeof ACTIONS)[number];
  targetId: string | null;
};

const cardSchema = z.object({
  title: z.string().trim().min(1).max(60),
  body: z.string().trim().min(1).max(240),
  cta: z.string().trim().min(1).max(40),
  icon: z.enum(ICONS),
  action: z.enum(ACTIONS),
  targetId: z.string().trim().optional(),
});

const argsSchema = z.object({ insights: z.array(cardSchema).min(1).max(MAX_CARDS) });

// ---------------------------------------------------------------------------
// Reading the cache
// ---------------------------------------------------------------------------

export type InsightSet = {
  generatedOn: string | null;
  currency: Currency | null;
  /** True when Home should ask for a regeneration. */
  stale: boolean;
  insights: Insight[];
};

type InsightRow = Insight & { generatedOn: string; currency: Currency };

const SELECT_FRESH = /* sql */ `
  SELECT generated_on AS "generatedOn", currency, title, body, cta, icon, action,
         target_id AS "targetId"
    FROM insights
   WHERE user_id = $1 AND generated_on = CURRENT_DATE AND currency = $2
   ORDER BY rank`;

/** Cache only — never calls the model, so Home always renders immediately. */
export async function readInsights(userId: string, currency: Currency): Promise<InsightSet> {
  const rows = await query<InsightRow>(SELECT_FRESH, [userId, currency]);
  const first = rows[0];
  return {
    generatedOn: first?.generatedOn ?? null,
    currency: first?.currency ?? null,
    stale: rows.length === 0,
    insights: rows.map(({ title, body, cta, icon, action, targetId }) => ({
      title,
      body,
      cta,
      icon,
      action,
      targetId,
    })),
  };
}

// ---------------------------------------------------------------------------
// Generating
// ---------------------------------------------------------------------------

const CURRENCY_NAMES: Record<Currency, string> = {
  EUR: 'euros (EUR, symbol €)',
  USD: 'US dollars (USD, symbol $)',
  PYG: 'Paraguayan guaraní (PYG, symbol ₲)',
};

function systemPrompt(currency: Currency): string {
  const format =
    decimalsFor(currency) === 0
      ? 'Guaraní has no decimal subunit. Write whole numbers with dots for thousands — ₲1.850.000, never ₲1,850,000 and never ₲1.85M.'
      : 'Write amounts with two decimals and a comma for thousands — €1,850.00.';

  return `You write the "For you today" cards on the home screen of SpendOwl, a personal
finance app. You are given a snapshot of one person's money and you return two to
${MAX_CARDS} short cards about it.

CURRENCY. Their currency is ${CURRENCY_NAMES[currency]}. Every figure you are given is
already in ${currency} and every figure you write must be too. ${format} Never convert
and never mention another currency.

WHAT MAKES A GOOD CARD. The app can already state the obvious by itself: how much is
left, which category is biggest, which subscriptions renew. Those are worth a card only
when something about them is genuinely notable right now. Prefer what a rule cannot
see — a merchant that has quietly become a large share of the month, several renewals
landing on the same few days, a category that has stopped or started, spending that
does not look like the rest of the month, a card balance that costs real interest.

NEVER DO ARITHMETIC. This is the rule that matters most, because you are reliably bad
at it and a wrong number here is worse than no card at all. Every figure you write must
appear, digit for digit, somewhere in the data you were given. Do not add, subtract,
multiply, average, total, or take a percentage of anything — every total, share and
per-day figure you could want has already been worked out for you. Copy the number,
never derive it.

In particular: recentTransactionsSample is the newest few transactions, NOT the whole
month. Never add its rows together and never describe a figure taken from it as a
monthly total. For per-merchant totals use topMerchantsThisMonth; for per-category
totals use categoriesThisMonth. Likewise, if you talk about how many subscriptions
someone has, use activeSubscriptionCount — do not count the list yourself.

Copy amounts exactly as given, digit for digit. Dropping or adding a digit turns a
helpful card into a false one.

If the data is thin — a nearly empty month — say less rather than padding: two honest
cards beat four hollow ones.

VOICE. Second person, warm, specific, no scolding. Title at most six words. Body one or
two sentences, always containing the actual figure. cta is a short action label like
"Review subscriptions" — a label on a button, not a sentence.

PLAIN TEXT ONLY. No markdown whatsoever: no **bold**, no *italics*, no backticks, no
bullet points, no headings. The card is rendered as raw text and every asterisk you
write is shown to the user as an asterisk.

icon — pick the one that fits: trendUp good/improving, trendDown worsening, warn needs
attention, pie category mix, bars subscriptions or comparisons, card credit cards,
spark anything else.

DISCOUNTS. discountsForYourMerchants lists Banco GNB reintegro/discount offers currently
active at places this person actually shops (already matched against their own merchant
history — never invent one not in this list). Mention one only when it is genuinely
notable: a place they visit often, a meaningful percent, or a deadline worth acting on.
State the percent plainly and mention eligibleDays or monthlyCapGuaranies only if present.
monthlyCapGuaranies, when present, is ALWAYS in Paraguayan guaranies regardless of this
person's account currency (${currency}) — write it as "₲" with dots for thousands (e.g.
₲1.000.000), never convert it and never imply it is in ${currency}.

action — where tapping the card should take them, and it must match what your cta
promises: dashboard for spending, budget, categories and credit cards;
subscriptions for renewals; chat only when the cta actually invites them to talk to
you.${
    FACTURAS_ENABLED
      ? ' Use vault for facturas and receipts, and set targetId only on a vault card, only to the exact id of a factura you were given.'
      : ' Facturas and receipt scanning are not available yet, so never mention them.'
  }

Answer only by calling emit_insights.`;
}

const emitTool: Anthropic.Tool = {
  name: 'emit_insights',
  description: 'Return the insight cards for the home screen. This is the only way to answer.',
  input_schema: {
    type: 'object',
    properties: {
      insights: {
        type: 'array',
        description: `Two to ${MAX_CARDS} cards, most important first.`,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'At most six words.' },
            body: { type: 'string', description: 'One or two sentences containing the real figure. Plain text.' },
            cta: { type: 'string', description: 'Short button label, e.g. "Review subscriptions".' },
            icon: { type: 'string', enum: [...ICONS] },
            action: { type: 'string', enum: [...OFFERED_ACTIONS] },
            ...(FACTURAS_ENABLED
              ? {
                  targetId: {
                    type: 'string',
                    description: 'Only on a vault card: the id of a factura listed in facturasNeedingReview.',
                  },
                }
              : {}),
          },
          required: ['title', 'body', 'cta', 'icon', 'action'],
        },
      },
    },
    required: ['insights'],
  },
};

/**
 * Everything the model gets to see, already in display currency. This is the
 * same boundary runTool() enforces in routes/chat.ts: storage is minor units,
 * but a model reasoning in euro cents about a guaraní account gets every
 * amount wrong by two orders of magnitude.
 */
async function buildSnapshot(userId: string, currency: Currency) {
  const money = (minor: number) => minorToDisplay(minor, currency);

  const [summary, transactions, merchants, subscriptions, cards, facturas, discounts] = await Promise.all([
    getSummary(userId),
    query<{ merchant: string; category: string; amountMinor: number; occurredAt: string; note: string | null }>(
      `SELECT merchant, category, amount_minor AS "amountMinor", occurred_at AS "occurredAt", note
         FROM transactions WHERE user_id = $1
        ORDER BY occurred_at DESC, created_at DESC LIMIT $2`,
      [userId, TX_SAMPLE]
    ),
    // Aggregated over the *whole month*, not the sample above. Without this the
    // model sums the 25 recent rows and calls the result a monthly total —
    // measured, and wrong by 20% on the first live run.
    query<{ merchant: string; category: string; spentMinor: number; visits: number }>(
      `SELECT merchant, MIN(category) AS category, SUM(-amount_minor)::bigint AS "spentMinor",
              COUNT(*)::int AS visits
         FROM transactions
        WHERE user_id = $1 AND amount_minor < 0
          AND occurred_at >= date_trunc('month', CURRENT_DATE)::date
          AND occurred_at <= CURRENT_DATE
        GROUP BY merchant
        ORDER BY "spentMinor" DESC
        LIMIT 8`,
      [userId]
    ),
    query<{ name: string; priceMinor: number; dayOfMonth: number; off: boolean }>(
      `SELECT name, price_minor AS "priceMinor", day_of_month AS "dayOfMonth", cancelled AS "off"
         FROM subscriptions WHERE user_id = $1 ORDER BY price_minor DESC`,
      [userId]
    ),
    query<{ name: string; balanceMinor: number; limitMinor: number; apr: number }>(
      `SELECT name, balance_minor AS "balanceMinor", credit_limit_minor AS "limitMinor", apr
         FROM credit_cards WHERE user_id = $1 ORDER BY balance_minor DESC`,
      [userId]
    ),
    FACTURAS_ENABLED
      ? query<{ id: string; merchant: string; amountMinor: number }>(
          `SELECT id, merchant, amount_minor AS "amountMinor"
             FROM receipts WHERE user_id = $1 AND status = 'warn'
            ORDER BY occurred_at DESC LIMIT 5`,
          [userId]
        )
      : Promise.resolve([]),
    // Global, not user-scoped — every user reads the same currently-valid
    // rows scraped by server/src/scraper/. Filtered down to the user's own
    // merchants in JS below, not here, since that's a fuzzy match rather
    // than something SQL can express cleanly.
    query<{
      merchant: string;
      category: string | null;
      percent: number | null;
      installments: number | null;
      eligibleDays: string | null;
      monthlyCapMinor: number | null;
    }>(
      `SELECT merchant, category, percent, installments, eligible_days AS "eligibleDays",
              monthly_cap_minor AS "monthlyCapMinor"
         FROM bank_discounts
        WHERE valid_until IS NULL OR valid_until >= CURRENT_DATE`
    ),
  ]);

  if (!summary) return null;

  // Percentages are computed here for the same reason amounts are converted
  // here: it is arithmetic, and arithmetic in the model's head is where every
  // wrong figure on the first live run came from.
  const share = (minor: number) =>
    summary.spentMinor > 0 ? Math.round((minor / summary.spentMinor) * 100) : 0;

  const active = subscriptions.filter(s => !s.off);
  const daysLeft = Math.max(summary.daysLeft, 1);

  // Fuzzy, case-insensitive substring match against merchants the user has
  // actually transacted with — a scraped GNB discount is only worth a card
  // when it applies somewhere they actually shop, not just because it exists.
  const userMerchants = new Set(
    [...transactions, ...merchants].map(t => t.merchant.toLowerCase().trim())
  );
  const matchesUser = (discountMerchant: string): boolean => {
    const lower = discountMerchant.toLowerCase().trim();
    for (const u of userMerchants) {
      if (u.includes(lower) || lower.includes(u)) return true;
    }
    return false;
  };

  return {
    // `trend` is omitted for the same reason the coach omits it: 30 rows of
    // cumulative chart series answer no question and crowd out the rest.
    snapshot: {
      currency,
      today: new Date().toISOString().slice(0, 10),
      month: summary.month,
      daysLeft: summary.daysLeft,
      budget: money(summary.budgetMinor),
      spent: money(summary.spentMinor),
      income: money(summary.incomeMinor),
      safeToSpend: money(summary.safeToSpendMinor),
      safeToSpendPerRemainingDay: money(Math.round(summary.safeToSpendMinor / daysLeft)),
      overBudget: summary.overBudget,
      percentOfBudget: Math.round(summary.percentOfBudget),
      aheadOfPaceBy: money(summary.paceDeltaMinor),
      categoriesThisMonth: summary.categories.map(c => ({
        category: c.key,
        spent: money(c.spentMinor),
        percentOfSpending: share(c.spentMinor),
      })),
      topMerchantsThisMonth: merchants.map(m => ({
        merchant: m.merchant,
        category: m.category,
        spent: money(m.spentMinor),
        visits: m.visits,
        percentOfSpending: share(m.spentMinor),
      })),
      // Named a sample on purpose — it is the newest 25 rows, not the month.
      // The prompt forbids adding these up; topMerchantsThisMonth is the
      // aggregate to quote instead.
      recentTransactionsSample: transactions.map(t => ({
        merchant: t.merchant,
        category: t.category,
        amount: money(t.amountMinor),
        date: t.occurredAt,
        note: t.note,
      })),
      activeSubscriptionCount: active.length,
      activeSubscriptionMonthlyTotal: money(active.reduce((sum, s) => sum + s.priceMinor, 0)),
      subscriptions: subscriptions.map(s => ({
        name: s.name,
        monthlyPrice: money(s.priceMinor),
        renewsOnDay: s.dayOfMonth,
        cancelled: s.off,
      })),
      creditCards: cards.map(c => ({
        name: c.name,
        balance: money(c.balanceMinor),
        limit: money(c.limitMinor),
        apr: c.apr,
        monthlyInterest: money(Math.round((c.balanceMinor * c.apr) / 100 / 12)),
      })),
      // Always in guaranies regardless of the user's account currency — these
      // are Paraguayan bank promos, not a figure from this user's own data, so
      // running them through money() (which assumes the account currency)
      // would silently mislabel a PYG amount as EUR or USD.
      discountsForYourMerchants: discounts
        .filter(d => matchesUser(d.merchant))
        .map(d => ({
          merchant: d.merchant,
          category: d.category,
          percent: d.percent,
          installments: d.installments,
          eligibleDays: d.eligibleDays,
          monthlyCapGuaranies: d.monthlyCapMinor != null ? minorToDisplay(d.monthlyCapMinor, 'PYG') : null,
        })),
      ...(FACTURAS_ENABLED
        ? {
            facturasNeedingReview: facturas.map(f => ({
              id: f.id,
              merchant: f.merchant,
              amount: Math.abs(money(f.amountMinor)),
            })),
          }
        : {}),
    },
    // The only ids the model is permitted to reference back at us.
    receiptIds: new Set(facturas.map(f => f.id)),
  };
}

/**
 * A stable 32-bit key for pg_advisory_xact_lock. Two Home mounts racing on app
 * open is the expected case, not an edge one — without the lock both pay for a
 * model call and one set of cards is written twice.
 */
function lockKey(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (Math.imul(hash, 31) + userId.charCodeAt(i)) | 0;
  return hash;
}

/**
 * Generates today's cards and stores them, unless another request beat us to
 * it. Returns the set that ended up in the database either way.
 *
 * Throws only on a model or database failure; the caller decides whether that
 * is worth surfacing (it generally is not — Home falls back to the rule cards).
 */
export async function generateInsights(userId: string, currency: Currency): Promise<InsightSet> {
  if (!env.llmApiKey) return readInsights(userId, currency);

  // The whole generation happens inside the lock, model call included. Taking
  // it only around the write would stop the duplicate INSERT but not the
  // duplicate spend: both racers would pay for a call and one result would be
  // thrown away. That costs a transaction held open for the length of an HTTP
  // request, which is acceptable exactly because it happens once per user per
  // day.
  await transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey(userId)]);

    // Re-check under the lock: whoever we queued behind may have just written
    // today's cards, in which case theirs stand and we call nothing.
    const { rows } = await client.query(SELECT_FRESH, [userId, currency]);
    if (rows.length > 0) return;

    const built = await buildSnapshot(userId, currency);
    if (!built) return;

    const anthropic = new Anthropic({ apiKey: env.llmApiKey, baseURL: env.llmBaseUrl });
    const response = await anthropic.messages.create({
      model: env.llmModel,
      max_tokens: MAX_TOKENS,
      system: systemPrompt(currency),
      tools: [emitTool],
      // Forcing the tool is what makes the output a schema rather than prose.
      // It is rejected outright while thinking is on, so thinking is off —
      // which also halves the output tokens for a task that is noticing and
      // phrasing rather than reasoning.
      tool_choice: { type: 'tool', name: 'emit_insights' },
      thinking: { type: 'disabled' },
      messages: [
        {
          role: 'user',
          content: `Here is their money right now. Write the cards.\n\n${JSON.stringify(built.snapshot)}`,
        },
      ],
    });

    const call = response.content.find(block => block.type === 'tool_use' && block.name === 'emit_insights');
    if (!call || call.type !== 'tool_use') {
      throw new Error(`Model returned no emit_insights call (stop_reason: ${response.stop_reason})`);
    }

    const parsed = argsSchema.safeParse(call.input);
    if (!parsed.success) {
      throw new Error(
        `Malformed insights: ${parsed.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`
      );
    }

    await client.query(`DELETE FROM insights WHERE user_id = $1 AND generated_on = CURRENT_DATE`, [userId]);
    for (const [rank, card] of parsed.data.insights.entries()) {
      await client.query(
        `INSERT INTO insights (user_id, generated_on, currency, rank, title, body, cta, icon, action, target_id)
         VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          userId,
          currency,
          rank,
          card.title,
          card.body,
          card.cta,
          card.icon,
          card.action,
          // A targetId is only ever an id we handed over. Anything else — a
          // hallucinated uuid, an id from another account — degrades the card
          // to "open the vault" rather than deep-linking somewhere wrong.
          card.action === 'vault' && card.targetId && built.receiptIds.has(card.targetId) ? card.targetId : null,
        ]
      );
    }
  });

  return readInsights(userId, currency);
}
