import Anthropic from '@anthropic-ai/sdk';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../auth.ts';
import { query, queryOne } from '../db.ts';
import { type Currency, decimalsFor, displayToMinor, isCurrency, minorToDisplay } from '../currency.ts';
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

function systemPrompt(currency: Currency): string {
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

When they mention having spent something, call propose_expense. That shows them a
card to review and approve; it does NOT record anything. Never tell them an
expense is logged or saved — say you've drafted it for approval. If the amount,
merchant, or category is genuinely unclear, ask before proposing.`;
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

function buildTools(currency: Currency): Anthropic.Tool[] {
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
 * Rebuilds the conversation from the user-visible messages. Tool calls are
 * deliberately not persisted — a coach does not need that fidelity, and keeping
 * them out avoids a schema migration.
 *
 * Consecutive same-role turns are merged and leading assistant turns dropped.
 * The Messages API tolerates both, but this endpoint is a compatibility layer,
 * so it is handed the strictest well-formed shape rather than the loosest.
 */
function buildHistory(rows: MessageRow[], currency: Currency): Anthropic.MessageParam[] {
  const turns: { role: 'user' | 'assistant'; text: string }[] = [];

  for (const row of rows) {
    const payload = row.payload ?? {};
    switch (row.kind) {
      case 'user':
        turns.push({ role: 'user', text: String(payload.text ?? '').trim() });
        break;
      case 'ai':
        turns.push({ role: 'assistant', text: String(payload.text ?? '').trim() });
        break;
      case 'card': {
        const amount = Math.abs(minorToDisplay(Number(payload.amountMinor ?? 0), currency));
        turns.push({
          role: 'assistant',
          text: `[Proposed an expense card for approval: ${String(payload.merchant ?? 'Unknown')}, ${amount} ${currency}, category ${String(payload.cat ?? 'unknown')}]`,
        });
        break;
      }
      case 'voice':
        turns.push({ role: 'user', text: '[sent a voice note]' });
        break;
      case 'receipt':
        turns.push({ role: 'user', text: '[sent a photo of a receipt]' });
        break;
    }
  }

  const merged: Anthropic.MessageParam[] = [];
  for (const turn of turns) {
    if (!turn.text) continue;
    if (merged.length === 0 && turn.role === 'assistant') continue; // must open on a user turn
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) last.content = `${last.content as string}\n\n${turn.text}`;
    else merged.push({ role: turn.role, content: turn.text });
  }
  return merged;
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
  const settings = await queryOne<{ baseCurrency: string }>(
    `SELECT base_currency AS "baseCurrency" FROM users WHERE id = $1`,
    [userId]
  );
  const currency: Currency = isCurrency(settings?.baseCurrency) ? settings.baseCurrency : 'EUR';

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
