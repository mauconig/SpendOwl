import Anthropic from '@anthropic-ai/sdk';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../auth.ts';
import { bankForCardName, findDiscount } from '../cardDiscounts.ts';
import { appToday, localDate, nextWeekday, WEEKDAY_NAMES, type WeekdayName } from '../dates.ts';
import { query, queryOne } from '../db.ts';
import { READABLE_DISCOUNT_CATEGORIES, refineCategory } from '../discountCategories.ts';
import { evaluateDays } from '../discountDays.ts';
import {
  CURRENCIES,
  type Currency,
  decimalsFor,
  displayToMinor,
  getUserCurrency,
  isCurrency,
  minorToDisplay,
} from '../currency.ts';
import { env } from '../env.ts';
import { listSubscriptionsByPrice } from '../subscriptions.ts';
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

export function systemPrompt(currency: Currency, today: Date = appToday()): string {
  const weekday = WEEKDAY_NAMES[today.getDay()]!.replace(/^./, c => c.toUpperCase());
  const whole =
    decimalsFor(currency) === 0
      ? `Guaraní has no decimal subunit: amounts are always whole numbers. Never write a decimal point in an amount. Guaraní figures are large — "5k" or "5 mil" means 5,000, and a coffee costing 25,000 is unremarkable.`
      : `Amounts use two decimal places.`;

  return `You are Nummus AI's finance coach: warm, concise, and concrete.

You are talking to someone about their own money. Keep replies to a few sentences
unless they ask for detail — this is a phone chat, not a report.

CURRENCY. This user's currency is ${CURRENCY_NAMES[currency]}. Every amount your
tools report is already in ${currency}, and every amount you write or pass to a
tool must be in ${currency}. ${whole} Never convert between currencies yourself —
you have no exchange rate and any figure you produce that way is invented.

There is exactly one exception, and it is a recording exception, not a licence to
convert: a subscription can be billed in a currency that is not theirs, and the
subscription tools take a billedIn field so the app can convert it at the real
rate. Pass the number they said together with the currency they said it in. Apart
from that, treat ${currency} as the only currency this conversation has.

TODAY. Where they live it is ${weekday}, ${localDate(today)}. That is the only
date you know: work "last month", "this week" or "since Friday" out from it, and
never from a date mentioned earlier in the conversation. list_transactions takes
plain YYYY-MM-DD dates. For promos, do no date arithmetic at all — list_discounts
takes the day by name, including "today" and "tomorrow".

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
   called one of the propose_ tools on this turn. If you catch yourself typing a
   merchant and an amount, you should have called the tool instead.

   This is the single easiest mistake to make, and it applies to every propose_
   tool, not just this one. Writing "Listo, revisá la tarjeta" without having
   called a tool points the user at a card that is not there. Before you send a
   reply that refers to a card, check that you actually made one on this turn.

Use only the merchant they named. Never reuse one from their past transactions or
from an earlier draft. If they did not name a shop at all, ask which one it was —
do not guess and do not substitute a plausible-sounding name.

MONEY IN. propose_income is the mirror of propose_expense, and the direction of
the money is the only thing that decides between them. "Hoy gané 1 millón", "my
dad gave me 10k", "me pagaron", "cobré", "vendí la bici", "salary landed" are all
money ARRIVING — propose_income, never propose_expense. Getting this backwards
does real damage: it would log their salary as if they had spent it.

Income is what the account balance is built from — the balance is everything
that has come in minus everything that has left the account, carried forward
with no monthly reset — so logging it is not bookkeeping, it is what makes every
number on the Dashboard mean anything. An account with no income logged shows
nothing to spend.

\`source\` is where it came from, in their words: "Salary", "Dad", "Freelance".
If they never say, use a plain word like "Income" — do not invent a payer. Money
moved from their own savings or between their own accounts is not income; if it
sounds like that rather than new money arriving, ask before drafting anything.

CARD DISCOUNTS. Their banks run promos — 20% off fuel at Petrosur on Fridays, and
hundreds more. When an expense is paid with a card belonging to the bank running
the promo, the discount is found and applied for you, and the tool result tells
you what came off. Always pass the amount they actually said, before any
discount; never work one out yourself, never adjust the number to account for
one, and never promise a discount before the tool has confirmed it. If the
result reports one, say what it saved and where it came from. If it does not,
say nothing about discounts at all.

WHERE TO GO. That same catalogue answers the question from the other end, and it
is one of the most useful things you do: "we want to go to a café on Sunday,
what is there?", "anything on at the supermarket?", "is it worth filling up
today?". Call list_discounts. You do not know which shops these banks have deals
with — that list is scraped from the banks and changes — so a merchant or a rate
you produce without calling it is invented, and it sends them somewhere that
charges full price.

Pass what they gave you: the kind of place as \`category\`, the day they named as
\`day\`, a shop or a word like "café" as \`search\`. Nothing more: if they named no
day, omit \`day\` and read each promo's own \`days\` wording back to them.

Then answer with the few that are actually theirs. A promo pays out only on a
card from the bank running it, so \`usableWithCard\` naming one of their cards is
what makes it an option — where it is null they hold no card from that bank and
get nothing, and offering it anyway is the same mistake as inventing it. Lead
with the ones they can use, name the card to pay with, and quote \`percent\` as
given: it is deliberately the base-card rate, so rounding it up promises money
the till will not give back.

Their own history is worth a look before you recommend: list_transactions with a
merchant or a category shows where they already go, and a promo at a place they
already go to is usually the more useful suggestion.

CARDS AND SUBSCRIPTIONS. Six different things can be said about them, and they
are easy to confuse. Read which one it is before choosing a tool:

  · "I bought X with my Visa" — money spent, using a card.
    propose_expense with paidWithCard set. Approving logs the expense AND adds
    it to that card's balance.
  · "I paid 200 to my Visa" — money paid TO a card, reducing what they owe.
    propose_card_payment. This is not spending and is never an expense.
  · "I cancelled Netflix" — propose_cancel_subscription.
  · "Delete Netflix" / "borrá Netflix" — propose_delete_subscription.
  · "I subscribed to Netflix, 50 a month" — propose_new_subscription.
  · "Netflix is actually 9.99 usd" / "Spotify comes out of my Visa" —
    propose_edit_subscription, for a correction to one they already have.

CANCELLING IS NOT DELETING, and answering one with the other is infuriating —
someone asks three times for a thing to go away and watches it stay on the list
wearing a different label. Cancelling says they stopped paying for something
real: it stays in their list, struck through, as the record of a subscription
they used to have. Deleting says it should never have been in the list at all.

So take the verb they used. "Cancelá", "dalo de baja", "I cancelled it" is
propose_cancel_subscription. "Borrá", "eliminá", "sacá", "delete it", "get rid
of it" is propose_delete_subscription — including when they are repeating
themselves because cancelling was not what they asked for. Never substitute one
for the other, and never offer cancelling as a way of doing what they asked when
they asked you to delete.

Deleting one they already cancelled is normal and correct — that is where a
subscription added by mistake ends up. Do it without comment.

Neither one touches the renewals it has already charged: those stay in their
transactions, because on the months they happened the money did leave. If they
want one of those gone too, it is deleted from the movements list in the app,
and deleting it there puts the money back — onto the card if it was paid with
one, or into their balance if it was not. Tell them that rather than trying to
do it yourself; you have no tool that removes a transaction.

The first two are opposites. "Con la Visa", "with my card", "pagué con" mean
they *spent* using it. "Pagué a la Visa", "paid off", "towards" mean they *paid
it down*. If a message genuinely could be either, ask.

Name matching is done for you: pass the card or subscription name the way they
said it and it will be matched to theirs. If the tool comes back saying there
was no match or several, do exactly what it says — ask them which one. Never
retry with a name you invented, and never fall back to proposing a plain expense
when they clearly named a card.

Each of these five needs its tool called on this turn. A reply on its own shows
nothing — the same rule as expenses, and just as easy to forget here.

Signing up to something is a purchase. "I subscribed to Netflix, 50 a month"
means they have just paid for it, so propose_new_subscription without
renewsOnDay: it charges today and repeats monthly from today. Only pass
renewsOnDay when they actually name a day — "it renews on the 10th" — which
means the first charge is that day, not now.

A subscription is billed in a real currency, and it is often not theirs. Netflix,
Spotify, iCloud and most software bill in USD even for a ${currency} account. If
they say "9.99 usd" or "dollars", pass billedIn — do not convert it yourself. The
app converts at the real rate every month and the amount in ${currency} changes as
the rate moves, which is the whole reason the currency is recorded rather than a
single converted number. If they just say a number with no currency, it is
${currency} and billedIn should be omitted.

Every propose_ tool is a draft. None of them change anything: each one shows
a card the user must approve. Never say something is cancelled, paid, added or
logged — say it is waiting for them.`;
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
    merchant: z.string().trim().min(2).max(80).optional(),
    since: z.iso.date().optional(),
    until: z.iso.date().optional(),
    limit: z.int().min(1).max(50).optional(),
  }),
  list_subscriptions: z.object({}),
  list_credit_cards: z.object({}),
  list_discounts: z.object({
    category: z.enum(READABLE_DISCOUNT_CATEGORIES).optional(),
    // A weekday by name, or the two relative days worth spelling out. The model
    // never computes a date for this: it is told today's day in the prompt and
    // the resolution happens in resolveDay() below.
    day: z.enum([...WEEKDAY_NAMES, 'today', 'tomorrow']).optional(),
    search: z.string().trim().min(2).max(60).optional(),
    limit: z.int().min(1).max(30).optional(),
  }),
  propose_expense: z.object({
    merchant: z.string().trim().min(1).max(120),
    category: z.enum(CATEGORIES),
    // Positive, in the user's display currency. The sign is applied on
    // approval and the conversion to stored EUR cents happens below, so the
    // model never handles either.
    amount: z.number().positive().finite(),
    note: z.string().trim().max(280).optional(),
    paidWithCard: z.string().trim().min(1).max(80).optional(),
  }),
  propose_income: z.object({
    source: z.string().trim().min(1).max(120),
    amount: z.number().positive().finite(),
    note: z.string().trim().max(280).optional(),
  }),
  propose_card_payment: z.object({
    card: z.string().trim().min(1).max(80),
    amount: z.number().positive().finite(),
  }),
  propose_cancel_subscription: z.object({
    subscription: z.string().trim().min(1).max(80),
  }),
  propose_delete_subscription: z.object({
    subscription: z.string().trim().min(1).max(80),
  }),
  propose_new_subscription: z.object({
    name: z.string().trim().min(1).max(80),
    monthlyPrice: z.number().positive().finite(),
    renewsOnDay: z.int().min(1).max(31).optional(),
    billedIn: z.enum(CURRENCIES).optional(),
    paidWithCard: z.string().trim().min(1).max(80).optional(),
  }),
  propose_edit_subscription: z.object({
    subscription: z.string().trim().min(1).max(80),
    monthlyPrice: z.number().positive().finite().optional(),
    renewsOnDay: z.int().min(1).max(31).optional(),
    billedIn: z.enum(CURRENCIES).optional(),
    paidWithCard: z.string().trim().min(1).max(80).optional(),
  }),
} as const;

type ToolName = keyof typeof toolArgs;

export function buildTools(currency: Currency): Anthropic.Tool[] {
  return [
    {
      name: 'get_budget_summary',
      description:
        `Their money picture, with every amount in ${currency}. accountBalance is what is in ` +
        'the account right now — all-time, carried across months, and the answer to "how much ' +
        'do I have". The figures named ThisMonth cover the current calendar month only and are ' +
        'never a balance. Also spend per category and days left in the month. Call this for any ' +
        'question about how much is left, how they are tracking, or where their money is going.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'list_transactions',
      description:
        `Their transaction history, newest first, with amounts in ${currency}. Use for questions ` +
        'about specific purchases, merchants, or past activity — and to find out where they ' +
        'actually shop or eat before recommending anything. Negative amounts are spending, ' +
        'positive are income. All filters are optional and combine. The `totals` in the result ' +
        'add up only the rows returned, so when `truncated` is true they are not the whole ' +
        'story — raise the limit or narrow the dates before quoting a total.',
      input_schema: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: [...CATEGORIES], description: 'Optional category filter.' },
          merchant: {
            type: 'string',
            description:
              'Only rows whose merchant contains this. Case and accents are ignored, so "caf" ' +
              'finds "Cafe Luna" and "La Cafetera", and "arete" finds "Areté".',
          },
          since: { type: 'string', description: 'Earliest date to include, YYYY-MM-DD. Inclusive.' },
          until: { type: 'string', description: 'Latest date to include, YYYY-MM-DD. Inclusive.' },
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
      name: 'list_discounts',
      description:
        'The bank promos currently on offer — the real, scraped catalogue of which shops give ' +
        'money back on which cards, on which days. Call it for any question about where to go, ' +
        'where to buy something, or whether there is a deal on: "we want a coffee on Sunday, ' +
        'what is there?", "any promos at the supermarket?", "is Petrosur cheaper today?". You ' +
        'do not know these merchants or rates from memory, so never answer such a question ' +
        'without calling this. Each result says which of their own cards the promo pays out on ' +
        'in `usableWithCard`, or null when they hold no card from that bank — a null promo ' +
        'gives them nothing and is not an option to offer them. `days` is the bank\'s own ' +
        'wording of when it runs, and `percent` is the base-card rate, never the premium one.',
      input_schema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: [...READABLE_DISCOUNT_CATEGORIES],
            description:
              'The kind of place. `restaurants` covers cafés, bars and food out; `groceries` is ' +
              'supermarkets; `auto_fuel` is petrol stations and car services; ' +
              '`entertainment_travel` is cinemas, hotels and flights; `beauty_health` is salons ' +
              'and clinics, with `pharmacy` split out of it.',
          },
          day: {
            type: 'string',
            enum: [...WEEKDAY_NAMES, 'today', 'tomorrow'],
            description:
              'The day they are asking about, by name. Returns only promos that actually run ' +
              'that day. Omit it when they did not name one — that returns promos for any day, ' +
              'each with its own `days` text.',
          },
          search: {
            type: 'string',
            description:
              'Matches the merchant name and the promo terms, ignoring case and accents. Use it ' +
              'for a shop they named, or to narrow a broad category — "café" inside ' +
              '`restaurants` finds the coffee shops.',
          },
          limit: { type: 'integer', description: 'How many to return. Defaults to 10, max 30.' },
        },
      },
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
          paidWithCard: {
            type: 'string',
            description:
              'Only if they said they paid with a credit card. The card name as they said it — ' +
              'it is matched against their cards, so "visa" finds "Visa Signature". Approving ' +
              'then also adds the amount to that card\'s balance.',
          },
        },
        required: ['merchant', 'category', 'amount'],
      },
    },
    {
      name: 'propose_income',
      description:
        'Draft money COMING IN for the user to review and approve. Use it whenever they mention ' +
        'money they received — earned, paid, gifted, sold something, got their salary. This does ' +
        'NOT record anything: it shows them a card with an "Approve & log" button. It is the ' +
        'mirror of propose_expense, and the two must never be confused: an expense is money ' +
        'leaving, this is money arriving.',
      input_schema: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            description:
              'Where the money came from, in their own words — "Salary", "Dad", "Freelance", ' +
              '"Sold my bike". If they did not say, use a plain word like "Income" rather than ' +
              'inventing a payer.',
          },
          amount: {
            type: 'number',
            description:
              `A positive amount in ${currency}` +
              (decimalsFor(currency) === 0
                ? ', as a whole number. "1 million" is 1000000 and "10k" is 10000.'
                : ', e.g. 250.00.'),
          },
          note: { type: 'string', description: 'Optional short context, e.g. "birthday money".' },
        },
        required: ['source', 'amount'],
      },
    },
    {
      name: 'propose_card_payment',
      description:
        'Draft a payment towards a credit card, for when they say they paid money TO a card ' +
        'rather than spent money with one. Approving reduces that card\'s balance. Records nothing ' +
        'on its own.',
      input_schema: {
        type: 'object',
        properties: {
          card: { type: 'string', description: 'The card name as they said it, e.g. "visa".' },
          amount: { type: 'number', description: `A positive amount in ${currency}.` },
        },
        required: ['card', 'amount'],
      },
    },
    {
      name: 'propose_cancel_subscription',
      description:
        'Draft the cancellation of a subscription they already have. Approving marks it cancelled ' +
        'so it stops counting towards their monthly total. Cancels nothing on its own.',
      input_schema: {
        type: 'object',
        properties: {
          subscription: { type: 'string', description: 'The subscription name as they said it.' },
        },
        required: ['subscription'],
      },
    },
    {
      name: 'propose_delete_subscription',
      description:
        'Draft the removal of a subscription from their list entirely, for when they say to ' +
        'delete or get rid of one — usually because it was added by mistake. This is not the ' +
        'same as cancelling: cancelling keeps it in the list as a record of something they used ' +
        'to pay for, deleting takes it out. Renewals it already charged stay in their ' +
        'transactions either way; if one of those is also wrong they remove it from the ' +
        'movements list, which gives the money back. Deletes nothing on its own.',
      input_schema: {
        type: 'object',
        properties: {
          subscription: { type: 'string', description: 'The subscription name as they said it.' },
        },
        required: ['subscription'],
      },
    },
    {
      name: 'propose_new_subscription',
      description:
        'Draft a new recurring subscription, for when they say they have signed up to something ' +
        'that bills monthly. Approving adds it, and from then on it charges automatically every ' +
        'month as a real transaction. Adds nothing on its own.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The service, e.g. "Spotify".' },
          monthlyPrice: {
            type: 'number',
            description: `What it costs per month, as the number they said. In ${currency} unless billedIn says otherwise.`,
          },
          renewsOnDay: {
            type: 'integer',
            description:
              'Day of the month it renews, 1-31. **Omit this unless they actually named a day.** ' +
              'Omitting it means they are paying for it now: it bills today and every month from ' +
              'today onward. Passing a day they did not say pushes the first charge into the ' +
              'future and nothing is recorded today.',
          },
          billedIn: {
            type: 'string',
            enum: [...CURRENCIES],
            description:
              'The currency the service actually bills in, if they said one — most streaming and ' +
              `software subscriptions bill in USD. Omit when they did not say; ${currency} is assumed.`,
          },
          paidWithCard: {
            type: 'string',
            description: 'The card it is charged to, named the way they said it. Omit if they did not say.',
          },
        },
        required: ['name', 'monthlyPrice'],
      },
    },
    {
      name: 'propose_edit_subscription',
      description:
        'Draft a change to a subscription they already have — a new price, a different renewal ' +
        'day, the currency it bills in, or which card pays for it. Use this when they correct ' +
        'something about an existing subscription rather than signing up to a new one. Pass only ' +
        'the fields they actually mentioned. Changes nothing on its own.',
      input_schema: {
        type: 'object',
        properties: {
          subscription: { type: 'string', description: 'The subscription name as they said it.' },
          monthlyPrice: { type: 'number', description: 'The new monthly price, if they gave one.' },
          renewsOnDay: { type: 'integer', description: 'The new renewal day, 1-31, if they gave one.' },
          billedIn: {
            type: 'string',
            enum: [...CURRENCIES],
            description: 'The currency it bills in, if they are correcting that.',
          },
          paidWithCard: { type: 'string', description: 'The card that pays for it, if they named one.' },
        },
        required: ['subscription'],
      },
    },
  ];
}

/**
 * What a `card` message can propose. Every one is a draft: the tool records it
 * here and returns an acknowledgement, and the write only happens when the user
 * taps approve in ChatScreen. No model mistake reaches the database unreviewed.
 *
 * `action` is absent on rows written before card payments and subscriptions
 * existed, so the client and buildHistory below both read a missing action as
 * 'expense'.
 */
type Proposal =
  | {
      action: 'expense';
      merchant: string;
      cat: string;
      amountMinor: number;
      note: string;
      cardId?: string;
      cardName?: string;
      // Present when the card's bank was running a promo for this merchant
      // today. amountMinor above is already net of it.
      discountBank?: string;
      discountPercent?: number;
      discountMinor?: number;
    }
  // Money in. amountMinor is positive here and stays positive all the way to
  // the transactions table, where a positive row is what summary.ts sums into
  // income — and therefore into safe-to-spend.
  | { action: 'income'; source: string; amountMinor: number; note: string }
  | { action: 'card_payment'; cardId: string; cardName: string; amountMinor: number }
  | { action: 'sub_cancel'; subId: string; subName: string; amountMinor: number }
  // Removes the subscription itself, where sub_cancel only stops it renewing.
  // Charges it already made are left alone by both — see the DELETE in
  // routes/subscriptions.ts.
  | { action: 'sub_delete'; subId: string; subName: string; amountMinor: number }
  | {
      action: 'sub_add';
      subName: string;
      // In `subCurrency`, which is not necessarily the user's own — see the
      // billedIn field on propose_new_subscription.
      amountMinor: number;
      dayOfMonth: number;
      subCurrency: Currency;
      cardId?: string;
      cardName?: string;
    }
  | {
      action: 'sub_edit';
      subId: string;
      subName: string;
      // Only the fields they actually asked to change are present; the approval
      // path PATCHes exactly these and leaves the rest alone.
      amountMinor?: number;
      dayOfMonth?: number;
      subCurrency?: Currency;
      cardId?: string;
      cardName?: string;
    };

/**
 * Resolves the name a person actually says to one of their rows.
 *
 * The model is never given ids. It is bad at copying uuids, and a wrong one
 * would silently act on someone else's row shape; a name it misheard fails
 * loudly here instead. Exact match first, then unique prefix, then unique
 * substring — so "visa" finds "Visa Signature" but an ambiguous "card" comes
 * back as an error the model can ask about.
 */
type Named = { id: string; name: string };

function resolveByName<T extends Named>(rows: T[], typed: string): T | { error: string } {
  const needle = typed.trim().toLowerCase();
  const exact = rows.filter(r => r.name.toLowerCase() === needle);
  const prefix = rows.filter(r => r.name.toLowerCase().startsWith(needle));
  const loose = rows.filter(r => r.name.toLowerCase().includes(needle));

  for (const bucket of [exact, prefix, loose]) {
    if (bucket.length === 1) return bucket[0]!;
    if (bucket.length > 1) {
      return { error: `"${typed}" matches more than one: ${bucket.map(r => r.name).join(', ')}. Ask which one they mean.` };
    }
  }
  return {
    error: rows.length
      ? `No match for "${typed}". They have: ${rows.map(r => r.name).join(', ')}. Ask which one they mean — do not guess.`
      : `They have none set up, so "${typed}" cannot be matched. Tell them that.`,
  };
}

/**
 * A tool's answer. `isError` comes back as an `is_error` tool_result so the
 * model corrects itself — an unmatched card or subscription name is a question
 * to ask the user, not a turn to abandon.
 */
type ToolResult = { content: string; isError?: boolean };

const ok = (content: string): ToolResult => ({ content });
const failed = (content: string): ToolResult => ({ content, isError: true });

/**
 * Case- and accent-insensitive "contains", in SQL.
 *
 * Both sides are folded, because both sides are written by people. A model
 * asked about a coffee shop in Spanish searches for "café" and the merchant is
 * spelled "Cafe Luna"; someone asking what they spent at "arete" means
 * "Supermercado Areté". A plain ILIKE answers "nothing found" to both, which
 * reads as "there is no promo" rather than "you typed the accent differently".
 *
 * translate() rather than the unaccent extension: it needs nothing installed in
 * the database, and the accent set is the same one discountDays.ts folds.
 * `column` and `param` are literals from the queries below, never user input.
 */
function foldedContains(column: string, param: string): string {
  const fold = (expr: string) => `translate(lower(${expr}), 'áéíóúüñ', 'aeiouun')`;
  return `${fold(column)} LIKE '%' || ${fold(param)} || '%'`;
}

/**
 * The calendar day a `day` argument means, in the user's own zone.
 *
 * Resolved here and not by the model. Whether a promo runs on a given day turns
 * on that day's date as well as its name — several are restricted to a window
 * of the month or to the first or last such weekday — so the question "what is
 * on on Sunday" only has an answer once a real date is attached to it, and a
 * date the model worked out is a date that can be wrong.
 */
function resolveDay(day: WeekdayName | 'today' | 'tomorrow'): Date {
  const today = appToday();
  if (day === 'today') return today;
  if (day === 'tomorrow') return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  return nextWeekday(day, today);
}

/**
 * Runs one validated tool call. `proposals` collects the propose_* calls for
 * the caller to persist as `card` messages once the turn finishes.
 */
async function runTool(
  name: ToolName,
  args: unknown,
  userId: string,
  currency: Currency,
  proposals: Proposal[]
): Promise<ToolResult> {
  // Everything handed to the model is in the display currency, and says so.
  const money = (minor: number) => minorToDisplay(minor, currency);

  const loadCards = () =>
    query<Named & { balanceMinor: number }>(
      `SELECT id, name, balance_minor AS "balanceMinor" FROM credit_cards WHERE user_id = $1`,
      [userId]
    );

  // Goes through the shared loader rather than its own SELECT so priceBaseMinor
  // is present: price_minor is in whatever currency the service bills in, and
  // every figure this function hands the model must be in the user's.
  const loadSubs = () => listSubscriptionsByPrice(userId, currency);

  switch (name) {
    case 'get_budget_summary': {
      const summary = await getSummary(userId);
      if (!summary) return ok(JSON.stringify({ error: 'No account data yet.' }));
      // `trend` is a day-by-day cumulative series that exists to draw the
      // Dashboard chart. It answers no question the coach is asked, and 30 rows
      // of noise measurably hurts a smaller model's focus — so it is omitted.
      return ok(JSON.stringify({
        currency,
        month: summary.month,
        // What is in the account right now, all-time and carrying over between
        // months. This is the answer to "how much do I have"; the three
        // month-scoped figures below are not, and quoting one of them as a
        // balance is the mistake this naming exists to prevent.
        accountBalance: money(summary.balanceMinor),
        overdrawn: summary.overdrawn,
        spentThisMonth: money(summary.spentMinor),
        leftTheAccountThisMonth: money(summary.accountOutMinor),
        incomeThisMonth: money(summary.incomeMinor),
        daysLeft: summary.daysLeft,
        categories: summary.categories.map(c => ({ category: c.key, spent: money(c.spentMinor) })),
      }));
    }

    case 'list_transactions': {
      const { category, merchant, since, until, limit } =
        args as z.infer<(typeof toolArgs)['list_transactions']>;
      const max = limit ?? 10;
      // One row past the limit, so the answer can say whether older matching
      // rows exist rather than quietly presenting a slice as the whole history.
      const rows = await query<{ merchant: string; category: string; amountMinor: number; occurredAt: string; note: string | null }>(
        `SELECT merchant, category, amount_minor AS "amountMinor", occurred_at AS "occurredAt", note
           FROM transactions
          WHERE user_id = $1
            AND ($2::text IS NULL OR category = $2)
            AND ($3::text IS NULL OR ${foldedContains('merchant', '$3')})
            AND ($4::date IS NULL OR occurred_at >= $4::date)
            AND ($5::date IS NULL OR occurred_at <= $5::date)
          ORDER BY occurred_at DESC, created_at DESC
          LIMIT $6`,
        [userId, category ?? null, merchant ?? null, since ?? null, until ?? null, max + 1]
      );
      const shown = rows.slice(0, max);

      // Summed here rather than by the model: "how much did I spend on coffee
      // in July" is a list plus an addition, and the addition is the half it
      // gets wrong. Only over the rows returned — hence `truncated` alongside.
      const sum = (keep: (minor: number) => boolean) =>
        shown.reduce((total, r) => (keep(r.amountMinor) ? total + Math.abs(r.amountMinor) : total), 0);

      return ok(JSON.stringify({
        currency,
        transactions: shown.map(r => ({
          merchant: r.merchant,
          category: r.category,
          amount: money(r.amountMinor),
          date: r.occurredAt,
          note: r.note,
        })),
        totals: { spent: money(sum(m => m < 0)), received: money(sum(m => m > 0)) },
        truncated: rows.length > shown.length,
      }));
    }

    case 'list_subscriptions': {
      const rows = await loadSubs();
      return ok(JSON.stringify({
        currency,
        subscriptions: rows.map(r => ({
          name: r.name,
          // Already converted into their currency. billedIn is reported
          // alongside so the coach can answer "which ones are in dollars?"
          // without ever doing the arithmetic itself.
          monthlyPrice: r.priceBaseMinor == null ? null : money(r.priceBaseMinor),
          billedIn: r.currency,
          paidWithCard: r.cardName,
          renewsOnDay: r.dayOfMonth,
          alertsMuted: r.muted,
          cancelled: r.off,
        })),
      }));
    }

    case 'list_credit_cards': {
      const rows = await query<{ name: string; last4: string; balanceMinor: number; limitMinor: number; apr: number }>(
        `SELECT name, last4, balance_minor AS "balanceMinor",
                credit_limit_minor AS "limitMinor", apr
           FROM credit_cards WHERE user_id = $1 ORDER BY balance_minor DESC`,
        [userId]
      );
      return ok(JSON.stringify({
        currency,
        cards: rows.map(r => ({
          name: r.name,
          last4: r.last4,
          balance: money(r.balanceMinor),
          limit: money(r.limitMinor),
          apr: r.apr,
        })),
      }));
    }

    case 'list_discounts': {
      const { category, day, search, limit } = args as z.infer<(typeof toolArgs)['list_discounts']>;
      // Every date question below is asked of this one day: which promos are
      // still valid, and which of them run. Without a day named it is today.
      const on = day ? resolveDay(day) : appToday();

      // `pharmacy` is not stored — refineCategory() derives it from the
      // merchant's name out of `beauty_health` — so the SQL narrows to the
      // stored bucket and the exact category is settled below.
      const stored = category === 'pharmacy' ? 'beauty_health' : (category ?? null);

      const rows = await query<{
        bank: string;
        merchant: string;
        category: string | null;
        percent: number | null;
        installments: number | null;
        eligibleDays: string | null;
        monthlyCapMinor: number | null;
        monthlyCapCurrency: string | null;
        validUntil: string | null;
        description: string;
      }>(
        `SELECT bank, merchant, category, percent::float8 AS percent, installments,
                eligible_days AS "eligibleDays", monthly_cap_minor AS "monthlyCapMinor",
                monthly_cap_currency AS "monthlyCapCurrency", valid_until AS "validUntil",
                description
           FROM bank_discounts
          WHERE (valid_from  IS NULL OR valid_from  <= $1::date)
            AND (valid_until IS NULL OR valid_until >= $1::date)
            AND ($2::text IS NULL OR category = $2)
            AND ($3::text IS NULL OR ${foldedContains('merchant', '$3')}
                                  OR ${foldedContains('description', '$3')})`,
        [localDate(on), stored, search ?? null]
      );

      // Which bank each of their cards belongs to. A promo is a property of the
      // card, not of the shop (see ../cardDiscounts.ts), so this is what
      // separates an offer they can actually use from one they cannot.
      const byBank = new Map<string, string>();
      for (const card of await loadCards()) {
        const bank = bankForCardName(card.name);
        if (bank && !byBank.has(bank)) byBank.set(bank, card.name);
      }

      const matching = rows
        .filter(r => !category || refineCategory(r.category, r.merchant) === category)
        // 'always' counts: a promo with no day restriction runs on the day
        // asked about. 'unknown' does not — the parser returns it for wording
        // it could not fully account for, and the rule everywhere it is used is
        // to claim nothing rather than send someone out on a guess.
        .filter(r => !day || ['today', 'always'].includes(evaluateDays(r.eligibleDays, on)))
        .sort(
          (a, b) =>
            Number(byBank.has(b.bank)) - Number(byBank.has(a.bank)) ||
            (b.percent ?? 0) - (a.percent ?? 0) ||
            a.merchant.localeCompare(b.merchant)
        );

      const shown = matching.slice(0, limit ?? 10);

      return ok(JSON.stringify({
        ...(day ? { forDay: { asked: day, date: localDate(on) } } : {}),
        matchCount: matching.length,
        truncated: matching.length > shown.length,
        discounts: shown.map(r => {
          // The cap is quoted in the currency the bank wrote it in, which for a
          // Paraguayan promo is guaraníes whatever the user's own currency is.
          // Converting it is not this app's to do, so the code travels with it.
          const capCurrency = isCurrency(r.monthlyCapCurrency) ? r.monthlyCapCurrency : currency;
          return {
            merchant: r.merchant,
            bank: r.bank,
            percent: r.percent,
            usableWithCard: byBank.get(r.bank) ?? null,
            days: r.eligibleDays,
            category: refineCategory(r.category, r.merchant),
            installments: r.installments,
            ...(r.monthlyCapMinor != null
              ? {
                  // A cap on eligible spend per month, not on the money back —
                  // the distinction cardDiscounts.ts spells out.
                  monthlyCapOnSpend: `${minorToDisplay(r.monthlyCapMinor, capCurrency)} ${capCurrency}`,
                }
              : {}),
            validUntil: r.validUntil,
            terms: r.description,
          };
        }),
        ...(matching.length === 0
          ? {
              note:
                'Nothing on offer matches. Tell them plainly that there is none — do not name a ' +
                'shop or a rate that is not in this list. Widening the search or dropping the ' +
                'day is worth one more call before you answer.',
            }
          : {}),
      }));
    }

    case 'propose_expense': {
      const p = args as z.infer<(typeof toolArgs)['propose_expense']>;

      // Only resolved when they actually named a card. An unmatched name is an
      // error rather than a silent drop: "I paid with my Visa" turning into a
      // cash expense would leave the card balance quietly wrong.
      let card: (Named & { balanceMinor: number }) | undefined;
      if (p.paidWithCard) {
        const found = resolveByName(await loadCards(), p.paidWithCard);
        if ('error' in found) return failed(found.error);
        card = found;
      }

      // The one place the display currency is converted back to storage.
      const grossMinor = displayToMinor(p.amount, currency);

      // Paying with a bank's own card at a merchant it runs a promo for takes
      // the discount off automatically — the person should not have to know
      // Petrosur is 20% off on Fridays, let alone do the arithmetic.
      const discount = card ? await findDiscount(userId, card.name, p.merchant, grossMinor) : null;
      const netMinor = grossMinor - (discount?.discountMinor ?? 0);

      proposals.push({
        action: 'expense',
        merchant: p.merchant,
        cat: p.category,
        // Net, not gross: this is what the purchase actually cost, and it is
        // what the budget should be built on. The parts are kept alongside so
        // nothing is lost — see migration 9.
        amountMinor: netMinor,
        note: p.note ?? '',
        ...(card ? { cardId: card.id, cardName: card.name } : {}),
        ...(discount
          ? {
              discountBank: discount.bank,
              discountPercent: discount.percent,
              discountMinor: discount.discountMinor,
            }
          : {}),
      });

      if (!discount) {
        return ok(
          `Expense card for ${p.amount} ${currency}${card ? ` on ${card.name}` : ''} shown to the user for approval. ` +
            `It is not recorded until they tap "Approve & log". Tell them it is drafted and awaiting their approval.`
        );
      }

      return ok(
        `Expense card shown for approval, with ${discount.bank}'s ${discount.percent}% discount at ` +
          `${discount.merchant} already applied: ${p.amount} ${currency} less ` +
          `${money(discount.discountMinor)} ${currency} comes to ${money(netMinor)} ${currency}. ` +
          (discount.cappedByMonthlyLimit
            ? `This month's cap for that promo trimmed the discount, so it is smaller than the headline rate — say so. `
            : '') +
          `Tell them the discount was applied and what it saved. Do not recompute the numbers; use these. ` +
          `Nothing is recorded until they approve.`
      );
    }

    case 'propose_income': {
      const p = args as z.infer<(typeof toolArgs)['propose_income']>;

      proposals.push({
        action: 'income',
        source: p.source,
        amountMinor: displayToMinor(p.amount, currency),
        note: p.note ?? '',
      });
      return ok(
        `Income card for ${p.amount} ${currency} from ${p.source} shown to the user for approval. ` +
          `It is not recorded until they tap "Approve & log". Tell them it is drafted and awaiting ` +
          `their approval, and do not repeat the amount or the source — the card already shows both.`
      );
    }

    case 'propose_card_payment': {
      const p = args as z.infer<(typeof toolArgs)['propose_card_payment']>;
      const found = resolveByName(await loadCards(), p.card);
      if ('error' in found) return failed(found.error);

      proposals.push({
        action: 'card_payment',
        cardId: found.id,
        cardName: found.name,
        amountMinor: displayToMinor(p.amount, currency),
      });
      return ok(
        `Payment card for ${p.amount} ${currency} towards ${found.name} shown for approval. Its balance is ` +
          `${money(found.balanceMinor)} ${currency} and does not change until they approve.`
      );
    }

    case 'propose_cancel_subscription': {
      const p = args as z.infer<(typeof toolArgs)['propose_cancel_subscription']>;
      const found = resolveByName(await loadSubs(), p.subscription);
      if ('error' in found) return failed(found.error);
      if (found.off) return failed(`${found.name} is already cancelled. Tell them, and do not propose anything.`);

      proposals.push({
        action: 'sub_cancel',
        subId: found.id,
        subName: found.name,
        // The card shows what they stop paying, so this is the converted
        // figure — not the USD one the service actually bills.
        amountMinor: found.priceBaseMinor ?? 0,
      });
      return ok(`Cancellation card for ${found.name} shown for approval. It stays active until they approve.`);
    }

    case 'propose_delete_subscription': {
      const p = args as z.infer<(typeof toolArgs)['propose_delete_subscription']>;
      const found = resolveByName(await loadSubs(), p.subscription);
      if ('error' in found) return failed(found.error);

      // No "already cancelled" guard, unlike cancelling. Deleting one that is
      // cancelled is the normal way out of a subscription added by mistake:
      // cancelling was the only thing that used to be possible, so that is the
      // state the mistakes are sitting in.
      proposals.push({
        action: 'sub_delete',
        subId: found.id,
        subName: found.name,
        amountMinor: found.priceBaseMinor ?? 0,
      });
      return ok(
        `Deletion card for ${found.name} shown for approval. It is still in their list until they ` +
          `approve. Renewals it already charged stay in their transactions — say so if it has any, ` +
          `and tell them those are removed from the movements list, which gives the money back.`
      );
    }

    case 'propose_new_subscription': {
      const p = args as z.infer<(typeof toolArgs)['propose_new_subscription']>;

      // A duplicate is far more likely to be a misunderstanding than a genuine
      // second subscription to the same service.
      const existing = (await loadSubs()).find(s => s.name.toLowerCase() === p.name.trim().toLowerCase());
      if (existing && !existing.off) {
        return failed(`${existing.name} is already in their subscriptions. Tell them, and do not propose anything.`);
      }

      const card = p.paidWithCard ? resolveByName(await loadCards(), p.paidWithCard) : null;
      if (card && 'error' in card) return failed(card.error);

      // The price is in the currency the service bills in, so the minor-unit
      // conversion has to use *that* currency's rule — 9.99 USD is 999 cents,
      // and running it through a PYG account's rule would store 10 guaraníes.
      const billedIn = p.billedIn ?? currency;

      proposals.push({
        action: 'sub_add',
        subName: p.name,
        amountMinor: displayToMinor(p.monthlyPrice, billedIn),
        // Today's date is the sensible default for something they just signed
        // up to, and it is visible on the card for them to correct.
        dayOfMonth: p.renewsOnDay ?? appToday().getDate(),
        subCurrency: billedIn,
        ...(card ? { cardId: card.id, cardName: card.name } : {}),
      });
      return ok(
        `New subscription card for ${p.name} at ${p.monthlyPrice} ${billedIn}/month` +
          `${card ? ` on ${card.name}` : ''} shown for approval. Nothing is added until they approve.`
      );
    }

    case 'propose_edit_subscription': {
      const p = args as z.infer<(typeof toolArgs)['propose_edit_subscription']>;
      const found = resolveByName(await loadSubs(), p.subscription);
      if ('error' in found) return failed(found.error);

      const card = p.paidWithCard ? resolveByName(await loadCards(), p.paidWithCard) : null;
      if (card && 'error' in card) return failed(card.error);

      if (p.monthlyPrice == null && p.renewsOnDay == null && p.billedIn == null && !card) {
        return failed(`Nothing to change on ${found.name}. Ask them what they want to update.`);
      }

      // A price with no new currency stays in the one it is already billed in —
      // "Netflix went up to 12.99" about a USD subscription means 12.99 USD.
      const billedIn = p.billedIn ?? (found.currency as Currency);

      proposals.push({
        action: 'sub_edit',
        subId: found.id,
        subName: found.name,
        ...(p.monthlyPrice != null ? { amountMinor: displayToMinor(p.monthlyPrice, billedIn) } : {}),
        ...(p.renewsOnDay != null ? { dayOfMonth: p.renewsOnDay } : {}),
        ...(p.billedIn != null || p.monthlyPrice != null ? { subCurrency: billedIn } : {}),
        ...(card ? { cardId: card.id, cardName: card.name } : {}),
      });
      return ok(
        `Change card for ${found.name} shown for approval. Nothing changes until they approve.`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

type MessageRow = { kind: string; payload: Record<string, unknown> };

/**
 * Turns a stored `card` row back into the tool call that produced it.
 *
 * Every proposal must round-trip through here, not just expenses. A card the
 * model can see in history but cannot recognise as one of its own tool calls is
 * exactly what taught it to *describe* proposals instead of making them — the
 * failure that took propose_expense from 8/8 down to 1/8 before this replay
 * existed. A new action that gets forgotten here reintroduces it for that action.
 */
function replayOf(
  action: string,
  card: Record<string, unknown>,
  amount: number,
  currency: Currency
): { name: string; input: Record<string, unknown>; ack: string } {
  switch (action) {
    case 'income':
      return {
        name: 'propose_income',
        input: { source: String(card.source ?? 'Income'), amount, note: String(card.note ?? '') },
        ack: `Income card for ${amount} ${currency} from ${card.source} shown for approval.`,
      };
    case 'card_payment':
      return {
        name: 'propose_card_payment',
        input: { card: String(card.cardName ?? 'card'), amount },
        ack: `Payment card for ${amount} ${currency} towards ${card.cardName} shown for approval.`,
      };
    case 'sub_cancel':
      return {
        name: 'propose_cancel_subscription',
        input: { subscription: String(card.subName ?? '') },
        ack: `Cancellation card for ${card.subName} shown for approval.`,
      };
    case 'sub_delete':
      return {
        name: 'propose_delete_subscription',
        input: { subscription: String(card.subName ?? '') },
        ack: `Deletion card for ${card.subName} shown for approval.`,
      };
    case 'sub_add':
      return {
        name: 'propose_new_subscription',
        input: {
          name: String(card.subName ?? ''),
          monthlyPrice: amount,
          renewsOnDay: Number(card.dayOfMonth ?? 1),
          ...(card.subCurrency ? { billedIn: String(card.subCurrency) } : {}),
          ...(card.cardName ? { paidWithCard: String(card.cardName) } : {}),
        },
        ack: `New subscription card for ${card.subName} at ${amount} ${card.subCurrency ?? currency}/month shown for approval.`,
      };
    case 'sub_edit':
      return {
        name: 'propose_edit_subscription',
        input: {
          subscription: String(card.subName ?? ''),
          ...(card.amountMinor != null ? { monthlyPrice: amount } : {}),
          ...(card.dayOfMonth != null ? { renewsOnDay: Number(card.dayOfMonth) } : {}),
          ...(card.subCurrency ? { billedIn: String(card.subCurrency) } : {}),
          ...(card.cardName ? { paidWithCard: String(card.cardName) } : {}),
        },
        ack: `Change card for ${card.subName} shown for approval.`,
      };
    default: {
      // A discounted expense stores the net, but the model passed the gross —
      // replaying the net would show it a tool call it never made, and teach it
      // to hand back already-discounted amounts.
      const discount = Number(card.discountMinor ?? 0);
      const gross = discount > 0 ? amount + Math.abs(minorToDisplay(discount, currency)) : amount;
      return {
        name: 'propose_expense',
        input: {
          merchant: String(card.merchant ?? 'Unknown'),
          category: String(card.cat ?? 'food'),
          amount: gross,
          note: String(card.note ?? ''),
          ...(card.cardName ? { paidWithCard: String(card.cardName) } : {}),
        },
        ack:
          discount > 0
            ? `Expense card for ${gross} ${currency} shown for approval, with ${card.discountBank}'s ` +
              `${card.discountPercent}% discount applied, coming to ${amount} ${currency}.`
            : `Expense card for ${amount} ${currency} shown to the user for approval.`,
      };
    }
  }
}

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
        // A subscription card's amount is stored in the currency the service
        // bills in, so it has to be read back through that currency's
        // minor-unit rule — 999 is $9.99, not ₲999.
        const cardCurrency = isCurrency(card.subCurrency) ? card.subCurrency : currency;
        const amount = Math.abs(minorToDisplay(Number(card.amountMinor ?? 0), cardCurrency));
        // Rows written before card payments and subscriptions existed carry no
        // action at all, and were all expenses.
        const action = String(card.action ?? 'expense');
        const { name, input, ack } = replayOf(action, card, amount, currency);

        uses.push({ type: 'tool_use', id, name, input });
        results.push({ type: 'tool_result', tool_use_id: id, content: ack });
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
        // Real transcript once transcribe.ts exists on the row; the bracketed
        // placeholder only covers rows recorded before voice notes worked.
        pushText('user', String(payload.text ?? '').trim() || '[sent a voice note]');
        break;
      case 'receipt':
        pushText('user', '[sent a photo of a receipt]');
        break;
    }
  }

  return out;
}

export async function insertMessage(userId: string, kind: string, payload: Record<string, unknown>) {
  await queryOne(`INSERT INTO messages (user_id, kind, payload) VALUES ($1, $2, $3) RETURNING id`, [
    userId,
    kind,
    JSON.stringify(payload),
  ]);
}

// ---------------------------------------------------------------------------
// The turn
// ---------------------------------------------------------------------------

/** Thrown by runCoachTurn on any model failure — never a Hono Response, since
 * this is shared by two routes that word the same failure differently. */
export class CoachTurnError extends Error {}

/**
 * Runs one coach turn: replays history, loops on tool calls, persists whatever
 * comes back. Callers are responsible for inserting the message that prompted
 * this turn (a 'user' text row for /api/chat, a 'voice' row with its
 * transcript for /api/voice) *before* calling this — history is read fresh
 * from the table, not passed in, so the just-inserted row is included.
 */
export async function runCoachTurn(userId: string, currency: Currency): Promise<void> {
  const rows = await query<MessageRow>(
    `SELECT kind, payload FROM messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, HISTORY_LIMIT]
  );
  const messages = buildHistory(rows.reverse(), currency);

  const client = new Anthropic({ apiKey: env.llmApiKey!, baseURL: env.llmBaseUrl });
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
        const result = await runTool(block.name as ToolName, args.data, userId, currency, proposals);
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.content,
          ...(result.isError ? { is_error: true } : {}),
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
    // The message that prompted this turn stays — it was really sent. Only the
    // reply is missing, so a transient failure doesn't leave an apology stuck
    // in the transcript.
    throw new CoachTurnError("The coach couldn't be reached. Try again in a moment.");
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

  try {
    await runCoachTurn(userId, currency);
  } catch (error) {
    return c.json({ error: error instanceof CoachTurnError ? error.message : 'Something went wrong.' }, 502);
  }

  return c.body(null, 204);
});
