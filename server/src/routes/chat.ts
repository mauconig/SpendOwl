import Anthropic from '@anthropic-ai/sdk';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../auth.ts';
import { query, queryOne } from '../db.ts';
import { type Currency, decimalsFor, displayToMinor, getUserCurrency, minorToDisplay } from '../currency.ts';
import { env } from '../env.ts';
import { getSummary } from '../summary.ts';
import { CATEGORIES } from './transactions.ts';

/**
 * The AI coach. Replaces the three canned strings that used to live in
 * src/store/constants.ts.
 *
 * The whole turn runs here: persist the user's message, replay the recent
 * conversation to the model with tools bound to *this* user's rows, persist
 * whatever comes back. The client posts text and refetches — it never sees an
 * API key, a tool definition, or a tool call.
 *
 * Everything the model reads or writes is in the user's **display currency**.
 * Storage is EUR cents (see ../currency.ts), but that never reaches the model:
 * someone on PYG saying "5k" means ₲5,000, and a coach reasoning in euro cents
 * gets that wrong every time. Conversion happens in TypeScript at this
 * boundary, not in the model's head — float maths is exactly what it is worst at.
 *
 * Non-streaming on purpose: React Native's fetch is XHR-backed and does not
 * expose `response.body`, so token streaming would need a dependency Expo Go
 * can't load. The client shows a typing indicator for the duration instead.
 */

const MAX_ITERATIONS = 6; // hard ceiling on the tool loop
const HISTORY_LIMIT = 30;
const MAX_TOKENS = 4096;

const bodySchema = z.object({ text: z.string().trim().min(1).max(2000) });

const CURRENCY_NAMES: Record<Currency, string> = {
  EUR: 'euros (EUR, symbol €)',
  USD: 'US dollars (USD, symbol $)',
  PYG: 'Paraguayan guaraní (PYG, symbol ₲)',
};

export function systemPrompt(currency: Currency): string {
  const whole =
    decimalsFor(currency) === 0
      ? `Guaraní has no decimal subunit: amounts are always whole numbers. Never write a decimal point in an amount. Guaraní figures are large — "5k" or "5 mil" means 5,000, and a coffee costing 25,000 is unremarkable.`
      : `Amounts use two decimal places.`;

  return `You are SpendOwl's finance coach: warm, concise, and concrete.

You are talking to someone about their own money. Keep replies to a few sentences
unless they ask for detail — this is a phone chat, not a report.

CURRENCY. This user's currency is ${CURRENCY_NAMES[currency]}. Every amount your
tools report is already in ${currency}, and every amount you write or pass to a
tool must be in ${currency}. ${whole} Never convert between currencies and never
mention another currency — as far as this conversation is concerned, ${currency}
is the only one that exists.

Facts about their finances come from your tools. Never guess or invent a number:
if you need a figure, call a tool. If a tool has no answer, say so plainly.

LOGGING SPENDING. Whenever they mention money they have spent, call
propose_expense. That shows them a card to review and approve; it does NOT
record anything, so never say an expense is logged or saved — it is drafted,
awaiting their approval.

Read three things out of what they wrote:
  · amount   — the figure they gave, in ${currency}
  · merchant — the shop or place they named, spelled the way they spelled it
  · note     — what they actually bought, if they said

**Every message that mentions spending is a new expense.** Never treat one as an
edit of an earlier draft, never assume an earlier card already covers it, and
never reply that you have already shown them something. They cannot edit a card
— if one is wrong they simply describe the purchase again, and you propose again.

This holds even when the new message looks a lot like a card you already
proposed — same item, same amount, same shop. A resemblance is never a reason to
skip the tool. If they describe a purchase, you call propose_expense, every
single time, no matter what came before it in this conversation.

The two mistakes that matter most:

1. The card itself displays the merchant, amount, category and note. Do NOT
   repeat any of them in your reply — not as a list, not in a sentence. Answer
   with one short line such as "Listo, revisá la tarjeta." and nothing more.
2. Describing a card in your reply does not create one. A card exists only if you
   called propose_expense on this turn. If you catch yourself typing a merchant
   and an amount, you should have called the tool instead.

Use only the merchant they named. Never reuse one from their past transactions or
from an earlier draft. If they did not name a shop at all, ask which one it was —
do not guess and do not substitute a plausible-sounding name.`;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

/**
 * Argument schemas. Every tool call is validated against these before it runs.
 * A smaller, cheaper model is likelier to emit a malformed argument object, and
 * a validation failure comes back as an `is_error` tool result so the model can
 * correct itself — rather than throwing and losing the whole turn.
 */
const toolArgs = {
  get_budget_summary: z.object({}),
  list_transactions: z.object({
    category: z.enum(CATEGORIES).optional(),
    limit: z.int().min(1).max(50).optional(),
  }),
  list_subscriptions: z.object({}),
  list_credit_cards: z.object({}),
  propose_expense: z.object({
    merchant: z.string().trim().min(1).max(120),
    category: z.enum(CATEGORIES),
    // Positive, in the user's display currency. The sign is applied on
    // approval and the conversion to stored EUR cents happens below, so the
    // model never handles either.
    amount: z.number().positive().finite(),
    note: z.string().trim().max(280).optional(),
  }),
} as const;

type ToolName = keyof typeof toolArgs;

export function buildTools(currency: Currency): Anthropic.Tool[] {
  return [
    {
      name: 'get_budget_summary',
      description:
        `This month's budget picture, with every amount in ${currency}: spent, income, monthly ` +
        'budget, safe-to-spend, whether they are over budget, how far ahead or behind the flat ' +
        'daily pace they are, days left in the month, and spend per category. Call this for any ' +
        'question about how much is left, how they are tracking, or where their money is going.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'list_transactions',
      description:
        `Recent transactions, newest first, with amounts in ${currency}. Use for questions about ` +
        'specific purchases, merchants, or recent activity. Negative amounts are spending, ' +
        'positive are income.',
      input_schema: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: [...CATEGORIES], description: 'Optional category filter.' },
          limit: { type: 'integer', description: 'How many to return. Defaults to 10, max 50.' },
        },
      },
    },
    {
      name: 'list_subscriptions',
      description: `Their recurring subscriptions, with monthly price in ${currency} and renewal day of month.`,
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'list_credit_cards',
      description: `Their credit cards, with balance and limit in ${currency}, plus APR.`,
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'propose_expense',
      description:
        'Draft an expense for the user to review and approve. This does NOT record the ' +
        'transaction — it shows them a card with an "Approve & log" button. Use it whenever ' +
        'they mention money they have spent.',
      input_schema: {
        type: 'object',
        properties: {
          merchant: { type: 'string', description: 'Who they paid, e.g. "Mercado Central".' },
          category: { type: 'string', enum: [...CATEGORIES] },
          amount: {
            type: 'number',
            description:
              `A positive amount in ${currency}` +
              (decimalsFor(currency) === 0
                ? ', as a whole number. "5k" is 5000.'
                : ', e.g. 12.40.'),
          },
          note: { type: 'string', description: 'Optional short context, e.g. "lunch with the team".' },
        },
        required: ['merchant', 'category', 'amount'],
      },
    },
  ];
}

type Proposal = { merchant: string; cat: string; amountMinor: number; note: string };

/**
 * Runs one validated tool call. `proposals` collects propose_expense calls for
 * the caller to persist as `card` messages once the turn finishes.
 */
async function runTool(
  name: ToolName,
  args: unknown,
  userId: string,
  currency: Currency,
  proposals: Proposal[]
): Promise<string> {
  // Everything handed to the model is in the display currency, and says so.
  const money = (minor: number) => minorToDisplay(minor, currency);

  switch (name) {
    case 'get_budget_summary': {
      const summary = await getSummary(userId);
      if (!summary) return JSON.stringify({ error: 'No account data yet.' });
      // `trend` is a day-by-day cumulative series that exists to draw the
      // Dashboard chart. It answers no question the coach is asked, and 30 rows
      // of noise measurably hurts a smaller model's focus — so it is omitted.
      return JSON.stringify({
        currency,
        month: summary.month,
        spent: money(summary.spentMinor),
        income: money(summary.incomeMinor),
        budget: money(summary.budgetMinor),
        safeToSpend: money(summary.safeToSpendMinor),
        overBudget: summary.overBudget,
        percentOfBudget: Math.round(summary.percentOfBudget),
        daysLeft: summary.daysLeft,
        aheadOfPaceBy: money(summary.paceDeltaMinor),
        categories: summary.categories.map(c => ({ category: c.key, spent: money(c.spentMinor) })),
      });
    }

    case 'list_transactions': {
      const { category, limit } = args as z.infer<(typeof toolArgs)['list_transactions']>;
      const rows = await query<{ merchant: string; category: string; amountMinor: number; occurredAt: string; note: string | null }>(
        `SELECT merchant, category, amount_minor AS "amountMinor", occurred_at AS "occurredAt", note
           FROM transactions
          WHERE user_id = $1
            AND ($2::text IS NULL OR category = $2)
          ORDER BY occurred_at DESC, created_at DESC
          LIMIT $3`,
        [userId, category ?? null, limit ?? 10]
      );
      return JSON.stringify({
        currency,
        transactions: rows.map(r => ({
          merchant: r.merchant,
          category: r.category,
          amount: money(r.amountMinor),
          date: r.occurredAt,
          note: r.note,
        })),
      });
    }

    case 'list_subscriptions': {
      // The column is `cancelled`; the rest of the API exposes it as "off".
      const rows = await query<{ name: string; priceMinor: number; dayOfMonth: number; muted: boolean; off: boolean }>(
        `SELECT name, price_minor AS "priceMinor", day_of_month AS "dayOfMonth", muted,
                cancelled AS "off"
           FROM subscriptions WHERE user_id = $1 ORDER BY price_minor DESC`,
        [userId]
      );
      return JSON.stringify({
        currency,
        subscriptions: rows.map(r => ({
          name: r.name,
          monthlyPrice: money(r.priceMinor),
          renewsOnDay: r.dayOfMonth,
          alertsMuted: r.muted,
          cancelled: r.off,
        })),
      });
    }

    case 'list_credit_cards': {
      const rows = await query<{ name: string; last4: string; balanceMinor: number; limitMinor: number; apr: number }>(
        `SELECT name, last4, balance_minor AS "balanceMinor",
                credit_limit_minor AS "limitMinor", apr
           FROM credit_cards WHERE user_id = $1 ORDER BY balance_minor DESC`,
        [userId]
      );
      return JSON.stringify({
        currency,
        cards: rows.map(r => ({
          name: r.name,
          last4: r.last4,
          balance: money(r.balanceMinor),
          limit: money(r.limitMinor),
          apr: r.apr,
        })),
      });
    }

    case 'propose_expense': {
      const p = args as z.infer<(typeof toolArgs)['propose_expense']>;
      proposals.push({
        merchant: p.merchant,
        cat: p.category,
        // The one place the display currency is converted back to storage.
        amountMinor: displayToMinor(p.amount, currency),
        note: p.note ?? '',
      });
      return `Expense card for ${p.amount} ${currency} shown to the user for approval. It is not recorded until they tap "Approve & log". Tell them it is drafted and awaiting their approval.`;
    }
  }
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

type MessageRow = { kind: string; payload: Record<string, unknown> };

/**
 * Rebuilds the conversation from the user-visible messages.
 *
 * Past `card` rows are replayed as the **tool_use / tool_result pair they
 * actually were**, with synthesised ids. This is not cosmetic. Rendering them as
 * assistant prose ("[Proposed an expense card for ...]") described a tool call
 * as something the assistant had *written*, and the model duly imitated it:
 * once one card was in history it would answer later purchases with a prose
 * description and never call the tool — measured at 1/8 turns working. Replaying
 * them as real tool calls took the same case to 8/8, because every prior
 * proposal in context is now an example of calling the tool rather than an
 * example of describing one.
 *
 * The `ai` text that accompanies a card is a separate assistant turn, exactly as
 * it was when the turn originally ran.
 */
export function buildHistory(rows: MessageRow[], currency: Currency): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  let toolSeq = 0;

  const pushText = (role: 'user' | 'assistant', text: string) => {
    if (!text) return;
    if (out.length === 0 && role === 'assistant') return; // must open on a user turn
    const last = out[out.length - 1];
    // Only merge into a plain-text turn; never into one holding tool blocks.
    if (last && last.role === role && typeof last.content === 'string') {
      last.content = `${last.content}\n\n${text}`;
    } else {
      out.push({ role, content: text });
    }
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;

    if (row.kind === 'card') {
      // Cards proposed in the same turn belong to one assistant message, so
      // their results come back in one user message — the same shape the live
      // loop produces.
      const group: Record<string, unknown>[] = [];
      while (i < rows.length && rows[i]!.kind === 'card') group.push(rows[i++]!.payload ?? {});
      i--;

      if (out.length === 0) continue; // nothing to attach to yet

      const uses: Anthropic.ToolUseBlockParam[] = [];
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const card of group) {
        const id = `toolu_hist${++toolSeq}`;
        const amount = Math.abs(minorToDisplay(Number(card.amountMinor ?? 0), currency));
        uses.push({
          type: 'tool_use',
          id,
          name: 'propose_expense',
          input: {
            merchant: String(card.merchant ?? 'Unknown'),
            category: String(card.cat ?? 'food'),
            amount,
            note: String(card.note ?? ''),
          },
        });
        results.push({
          type: 'tool_result',
          tool_use_id: id,
          content: `Expense card for ${amount} ${currency} shown to the user for approval.`,
        });
      }
      out.push({ role: 'assistant', content: uses });
      out.push({ role: 'user', content: results });
      continue;
    }

    const payload = row.payload ?? {};
    switch (row.kind) {
      case 'user':
        pushText('user', String(payload.text ?? '').trim());
        break;
      case 'ai':
        pushText('assistant', String(payload.text ?? '').trim());
        break;
      case 'voice':
        pushText('user', '[sent a voice note]');
        break;
      case 'receipt':
        pushText('user', '[sent a photo of a receipt]');
        break;
    }
  }

  return out;
}

async function insertMessage(userId: string, kind: string, payload: Record<string, unknown>) {
  await queryOne(`INSERT INTO messages (user_id, kind, payload) VALUES ($1, $2, $3) RETURNING id`, [
    userId,
    kind,
    JSON.stringify(payload),
  ]);
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const chatRoute = new Hono<AppEnv>().post('/', async c => {
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid body', issues: parsed.error.issues }, 400);

  if (!env.llmApiKey) {
    return c.json({ error: 'The coach is not configured on this server (LLM_API_KEY is unset).' }, 503);
  }

  const userId = c.get('userId');

  // Read fresh each turn — the user can change it in Settings mid-conversation.
  const currency = await getUserCurrency(userId);

  await insertMessage(userId, 'user', { text: parsed.data.text });

  const rows = await query<MessageRow>(
    `SELECT kind, payload FROM messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, HISTORY_LIMIT]
  );
  const messages = buildHistory(rows.reverse(), currency);

  const client = new Anthropic({ apiKey: env.llmApiKey, baseURL: env.llmBaseUrl });
  const system = systemPrompt(currency);
  const tools = buildTools(currency);
  const proposals: Proposal[] = [];

  let text = '';
  try {
    // Plain messages.create, not the beta tool-runner helper: the beta
    // namespace is the least likely part of a compatibility layer to be
    // implemented, and this loop is short enough to own.
    let response = await client.messages.create({
      model: env.llmModel,
      max_tokens: MAX_TOKENS,
      system,
      tools,
      messages,
    });

    for (let i = 0; i < MAX_ITERATIONS && response.stop_reason === 'tool_use'; i++) {
      messages.push({ role: 'assistant', content: response.content });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        const schema = toolArgs[block.name as ToolName];
        if (!schema) {
          results.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Unknown tool "${block.name}".`,
            is_error: true,
          });
          continue;
        }
        const args = schema.safeParse(block.input ?? {});
        if (!args.success) {
          results.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Invalid arguments: ${args.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`,
            is_error: true,
          });
          continue;
        }
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: await runTool(block.name as ToolName, args.data, userId, currency, proposals),
        });
      }

      // All results for one assistant turn go back in a single user message —
      // splitting them trains the model out of calling tools in parallel.
      messages.push({ role: 'user', content: results });

      response = await client.messages.create({
        model: env.llmModel,
        max_tokens: MAX_TOKENS,
        system,
        tools,
        messages,
      });
    }

    // Only the final turn's prose is kept. Intermediate "let me check…"
    // preamble is dropped rather than cluttering the transcript.
    text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text.trim())
      .filter(Boolean)
      .join('\n\n');
  } catch (error) {
    console.error('[chat]', error);
    // The user's message stays — they did send it. The reply does not, so a
    // transient failure doesn't leave an apology stuck in their history.
    return c.json({ error: "The coach couldn't be reached. Try again in a moment." }, 502);
  }

  // Cards first: they were proposed during the turn, and the closing text
  // usually refers to them.
  for (const proposal of proposals) {
    await insertMessage(userId, 'card', proposal);
  }
  if (text) {
    await insertMessage(userId, 'ai', { text });
  } else if (proposals.length === 0) {
    await insertMessage(userId, 'ai', {
      text: "Sorry — I got a bit lost there. Could you put that another way?",
    });
  }

  return c.body(null, 204);
});
