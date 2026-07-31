import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { env } from '../env.ts';
import type { RawPromo } from './gnb.ts';

/**
 * Turns raw scraped text into structured discount rows, mirroring the
 * emit_insights pattern in ../insights.ts exactly: the tool is the output
 * schema (forced via tool_choice), not an action, so a result is a validated
 * object rather than prose to be parsed.
 *
 * Two rules matter most here:
 *
 * 1. THE TIER RULE. GNB's promos routinely list two tiers in the same
 *    paragraph — a higher rate for Black/Black Premier/Metalcard Premier and
 *    a lower one for Clasica/Oro (verified against a live Bases y
 *    Condiciones PDF: "Hasta 25%... Black..." vs "Hasta 20%... Clasicas y
 *    Oro..."). We only ever want the lower number.
 *
 * 2. UMBRELLA PROMOS. Some promos (verified live: "La Ruta Gastronómica",
 *    112 restaurants; "La Ruta del Café", 23 cafés) are not a single
 *    merchant at all — their Bases y Condiciones PDF has a "Comercios
 *    Adheridos" section listing every affiliated business the discount
 *    actually applies to. Extracting the promo's own title as `merchant`
 *    for these is useless: "La Ruta Gastronómica" is not a place anyone
 *    transacts at, so it can never match a real transaction merchant. These
 *    expand into one row per listed business (see `affiliatedMerchants`).
 */

const BATCH_SIZE = 15;
const MAX_TOKENS = 4096;
// Comercios-Adheridos promos list up to ~100+ names — isolating them in
// their own call (not batched with 14 others) and giving that call more
// room is what keeps a single umbrella promo from starving everything else
// in its batch of tokens.
const MAX_TOKENS_MULTI_MERCHANT = 8000;

const COMERCIOS_ADHERIDOS_RE = /comercios\s+adherido/i;

export const DISCOUNT_CATEGORIES = [
  'groceries',
  'restaurants',
  'fashion',
  'beauty_health',
  'home',
  'electronics',
  'auto_fuel',
  'entertainment_travel',
  'other',
] as const;
export type DiscountCategory = (typeof DISCOUNT_CATEGORIES)[number];

export type ExtractedDiscount = {
  externalId: string;
  merchant: string;
  category: DiscountCategory;
  percent: number | null;
  installments: number | null;
  eligibleDays: string | null;
  monthlyCapMinor: number | null;
  validFrom: string | null;
  validUntil: string | null;
  description: string;
};

// .nullish() rather than .optional() on every optional field: forced tool
// calls routinely come back with an explicit `null` for "not applicable"
// instead of the key being omitted, and .optional() alone rejects that (only
// undefined passes) — confirmed against a live 219-promo run, where it threw
// away ~25 otherwise-good extractions for exactly this reason.
const discountSchema = z.object({
  externalId: z.string().trim().min(1),
  merchant: z.string().trim().min(1).max(120),
  category: z.enum(DISCOUNT_CATEGORIES),
  percent: z.number().min(0).max(100).nullish(),
  installments: z.number().int().min(0).max(60).nullish(),
  eligibleDays: z.string().trim().max(120).nullish(),
  monthlyCapAmount: z.number().nonnegative().nullish(),
  validFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  description: z.string().trim().min(1).max(320),
  // Present only for umbrella promos — see the class comment above. Kept as
  // a plain string array rather than asking the model to repeat every other
  // field once per business: a numbered list is cheap and reliable, 100+
  // full discount objects is neither.
  affiliatedMerchants: z.array(z.string().trim().min(1).max(120)).max(150).nullish(),
});

// Loose at the top level (just "an array of somethings") — each item is
// validated individually below so one malformed entry (a model that ran a
// touch long on 'description', say) doesn't discard the other 14 good ones
// in the same batch.
const rawArgsSchema = z.object({ discounts: z.array(z.unknown()) });

const emitTool: Anthropic.Tool = {
  name: 'emit_discounts',
  description: 'Return the structured discount for each promo that genuinely has one. This is the only way to answer.',
  input_schema: {
    type: 'object',
    properties: {
      discounts: {
        type: 'array',
        description: 'One entry per promo given, skipping only ones with no real discount to report.',
        items: {
          type: 'object',
          properties: {
            externalId: { type: 'string', description: 'Copy exactly from the promo you were given.' },
            merchant: {
              type: 'string',
              description:
                'The promo\'s own name/title. For an umbrella promo (see affiliatedMerchants) this is just a label — the actual merchant rows come from that list instead.',
            },
            category: {
              type: 'string',
              enum: [...DISCOUNT_CATEGORIES],
              description:
                'groceries: supermarkets/convenience. restaurants: dining, cafes, bars, food delivery. fashion: clothing, shoes, accessories, jewelry, retail. beauty_health: pharmacies, cosmetics, clinics, opticians. home: furniture, home goods, home improvement. electronics: electronics, media/entertainment tech. auto_fuel: automotive, gas stations. entertainment_travel: cinemas, events, travel, sports, books, toys, pets. other: anything else (education, financial services, memberships).',
            },
            percent: { type: 'number', description: 'The LOWER tier percentage only. See system prompt rule.' },
            installments: { type: 'number', description: 'Interest-free installment count, if offered.' },
            eligibleDays: { type: 'string', description: 'e.g. "viernes". Omit if the promo applies every day.' },
            monthlyCapAmount: { type: 'number', description: 'The monthly purchase/discount cap amount in guaranies, if stated (e.g. 1000000 for "Gs. 1.000.000"). Omit if none.' },
            validFrom: { type: 'string', description: 'ISO date (YYYY-MM-DD), if a start date is given.' },
            validUntil: { type: 'string', description: 'ISO date (YYYY-MM-DD), if an end date is given.' },
            description: { type: 'string', description: 'One short plain-language sentence summarizing the offer, under 200 characters.' },
            affiliatedMerchants: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Only for umbrella promos: if the Bases y Condiciones text has a numbered section listing affiliated businesses (titled "Comercios Adheridos", "Comercios adheridos", or similar), put each one\'s name here. Strip "(aplica desde ...)" date qualifiers and skip non-numbered city/section sub-headers, but keep meaningful branch/location text that is part of a numbered entry\'s own name. Omit entirely for a normal single-merchant promo.',
            },
          },
          required: ['externalId', 'merchant', 'category', 'description'],
        },
      },
    },
    required: ['discounts'],
  },
};

const SYSTEM_PROMPT = `You extract structured card-discount data from Banco GNB Paraguay's promo pages for a
personal finance app. You are given several promos, each with its merchant name, a short
on-page summary, and (usually) the full text of its "Bases y Condiciones" PDF — the
authoritative legal terms. Prefer the Bases y Condiciones text over the summary when they
disagree; it is always more complete and more precise.

THE TIER RULE — this is what matters most. Many of these promos state two different
percentages for the same offer: a higher one for premium/exclusive cards (named things
like Black, Black Premier, Metalcard Premier, Infinite, Elite) and a lower one for
standard/base cards (named things like Clasica, Oro, Classic, Gold). Whenever you see two
tiers like this, output ONLY the lower number as "percent" — never the premium one, and
never an average. If only one rate is mentioned for all cards, use that one.

UMBRELLA PROMOS. Some promos are not a single merchant at all — they are a named campaign
("La Ruta Gastronómica", "La Ruta del Café") whose Bases y Condiciones has a numbered
section titled something like "5. Comercios Adheridos" listing every affiliated business
the discount actually applies to (e.g. "La Ruta Gastronómica" lists 112 restaurants
including KFC, Subway, Mostaza; "La Ruta del Café" lists 23 cafés, grouped under
non-numbered city sub-headers like "Asunción" / "Encarnación" that are not businesses
themselves). When you see a section like this, put every listed business's name in
affiliatedMerchants — strip "(aplica desde ...)" qualifiers, skip the city sub-headers,
but do keep meaningful location text that is genuinely part of a numbered entry's name.
Still fill in merchant/category/percent/etc. as usual for the promo itself. A normal
single-merchant promo has no such section — leave affiliatedMerchants empty for those.

CATEGORY. Always pick the closest of the nine fixed categories listed in the tool schema —
never invent your own label, never leave it blank. When in doubt, use "other".

Only report a monthly cap when the text states one explicitly (e.g. "Tope de compra
mensual: Gs. 1.000.000" -> monthlyCapAmount: 1000000). Dates in the source are Spanish
("Del 24 de julio al 25 de diciembre del 2026") — convert them to ISO YYYY-MM-DD. Every
figure you report must come from the text you were given; never estimate or invent one.

If a promo has no real discount to report (broken text, pure sponsorship mention with no
terms), leave it out of the array entirely rather than guessing.

Answer only by calling emit_discounts.`;

function promoBlock(promo: RawPromo): string {
  return [
    `externalId: ${promo.externalId}`,
    `merchant: ${promo.merchant}`,
    `summary: ${promo.summaryText}`,
    promo.basesText ? `basesYCondiciones:\n${promo.basesText}` : 'basesYCondiciones: (none found)',
  ].join('\n');
}

/**
 * A ~15-batch run over a flaky connection is exactly the shape that hits a
 * transient ECONNRESET partway through — observed live against this same
 * endpoint. Retrying the one failed batch is far cheaper than restarting the
 * whole run (and re-fetching nothing, since batches don't share state).
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= attempts) throw error;
      console.error(`[scraper:gnb] batch attempt ${attempt} failed, retrying:`, error);
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
}

/** Mechanical, not model-driven: cheaper and more reliable than asking the model to repeat every field per business. */
function expand(d: z.infer<typeof discountSchema>): ExtractedDiscount[] {
  const base = {
    externalId: d.externalId,
    category: d.category,
    percent: d.percent ?? null,
    installments: d.installments ?? null,
    eligibleDays: d.eligibleDays ?? null,
    monthlyCapMinor: d.monthlyCapAmount ?? null,
    validFrom: d.validFrom ?? null,
    validUntil: d.validUntil ?? null,
    description: d.description,
  };

  if (d.affiliatedMerchants && d.affiliatedMerchants.length > 0) {
    return d.affiliatedMerchants.map(merchant => ({ ...base, merchant }));
  }
  return [{ ...base, merchant: d.merchant }];
}

async function extractBatch(promos: RawPromo[], maxTokens: number): Promise<ExtractedDiscount[]> {
  if (!env.llmApiKey) return [];

  const anthropic = new Anthropic({ apiKey: env.llmApiKey, baseURL: env.llmBaseUrl });
  const response = await withRetry(() =>
    anthropic.messages.create({
      model: env.llmModel,
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      tools: [emitTool],
      tool_choice: { type: 'tool', name: 'emit_discounts' },
      thinking: { type: 'disabled' },
      messages: [
        {
          role: 'user',
          content: `Here are ${promos.length} promos. Extract each one's discount.\n\n${promos.map(promoBlock).join('\n\n---\n\n')}`,
        },
      ],
    })
  );

  const call = response.content.find(block => block.type === 'tool_use' && block.name === 'emit_discounts');
  if (!call || call.type !== 'tool_use') {
    throw new Error(`Model returned no emit_discounts call (stop_reason: ${response.stop_reason})`);
  }

  const raw = rawArgsSchema.safeParse(call.input);
  if (!raw.success) {
    throw new Error(`Malformed emit_discounts call: ${raw.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  }

  const discounts: ExtractedDiscount[] = [];
  for (const item of raw.data.discounts) {
    const parsed = discountSchema.safeParse(item);
    if (!parsed.success) {
      console.error(
        `[scraper:gnb] skipping malformed discount: ${parsed.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`
      );
      continue;
    }
    discounts.push(...expand(parsed.data));
  }
  return discounts;
}

export type ExtractResult = {
  discounts: ExtractedDiscount[];
  /**
   * externalIds of promos whose batch actually completed — a superset of the
   * ids that ended up with a discount, since a promo can resolve to "no real
   * discount" and correctly get zero rows. run.ts deletes exactly this set
   * before inserting, NOT every id it fetched: a promo whose batch failed
   * (see below) keeps whatever row it already had rather than being wiped
   * with nothing to replace it.
   */
  resolvedIds: Set<string>;
};

/**
 * Chunks promos into batches so no single call carries the whole site's
 * text — except Comercios-Adheridos promos, which are pulled out and given
 * their own isolated call with a larger token budget (see the class
 * comment). A batch that still fails after withRetry's attempts is logged
 * and skipped rather than aborting the run — its promos are simply left out
 * of resolvedIds, so the rest of the run's work isn't lost and nothing gets
 * deleted out from under a transient failure.
 */
export async function extractDiscounts(promos: RawPromo[]): Promise<ExtractResult> {
  const discounts: ExtractedDiscount[] = [];
  const resolvedIds = new Set<string>();

  const multiMerchant = promos.filter(p => p.basesText && COMERCIOS_ADHERIDOS_RE.test(p.basesText));
  const normal = promos.filter(p => !multiMerchant.includes(p));

  const runBatch = async (batch: RawPromo[], maxTokens: number) => {
    try {
      discounts.push(...(await extractBatch(batch, maxTokens)));
      for (const promo of batch) resolvedIds.add(promo.externalId);
    } catch (error) {
      console.error(
        `[scraper:gnb] batch (${batch.map(p => p.externalId).join(',')}) failed after retries, skipping:`,
        error
      );
    }
  };

  for (const promo of multiMerchant) {
    await runBatch([promo], MAX_TOKENS_MULTI_MERCHANT);
  }
  for (let i = 0; i < normal.length; i += BATCH_SIZE) {
    await runBatch(normal.slice(i, i + BATCH_SIZE), MAX_TOKENS);
  }

  return { discounts, resolvedIds };
}
