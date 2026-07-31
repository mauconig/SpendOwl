import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { env } from '../env.ts';
import type { RawPromo } from './common.ts';

/**
 * Turns raw scraped text into structured discount rows, mirroring the
 * emit_insights pattern in ../insights.ts exactly: the tool is the output
 * schema (forced via tool_choice), not an action, so a result is a validated
 * object rather than prose to be parsed.
 *
 * Two rules matter most here:
 *
 * 1. THE RATE RULE. A promo routinely quotes several percentages, and which
 *    one is *this* person's is a two-step question, not a preference for high
 *    or low. First narrow to what they can get — they hold a standard
 *    Mastercard and may pay however they like, so a Black rate is not theirs
 *    (GNB, live: "Hasta 25%... Black" vs "Hasta 20%... Clasicas y Oro" -> 20)
 *    but paying by QR instead of plastic *is* theirs to choose (Universitaria,
 *    live: "MASTERCARD QR 30% / PAGO CON TC FISICA 10%" -> 30). Then take the
 *    lowest of whatever survives, because what remains varies by product line,
 *    which they do not control. Getting the order wrong is not academic: it
 *    read Punto Farma as 45% when the till gives 30%.
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
const MAX_TOKENS_MULTI_MERCHANT = 12000;

/**
 * Does this promo's PDF list the businesses it actually covers?
 *
 * Two wordings, both seen live. GNB titles a numbered section "Comercios
 * Adheridos"; Sudameris' zone promos use a bare "COMERCIOS" heading over a
 * table whose header row reads "Comercio Días Beneficio ...". Matching only the
 * first missed the zone promos entirely, and they are the ones that most need
 * expanding — a whole city's worth of merchants collapsed into one useless row
 * named "ZONA CENTRAL – ASUNCIÓN Y GRAN ASUNCIÓN".
 */
const COMERCIOS_ADHERIDOS_RE = /comercios\s+adherido|^\s*comercios\s*$|comercio\s+d[ií]as\s+beneficio/im;

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
  monthlyCapKind: z.enum(['spend', 'rebate']).nullish(),
  validFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  description: z.string().trim().min(1).max(320),
  /**
   * Present only for umbrella promos — see the class comment above.
   *
   * Every field except `merchant` is optional and falls back to the parent
   * promo's. That covers both shapes seen in real data:
   *
   *  · GNB's "La Ruta Gastronómica" — a plain numbered list of 112 restaurants
   *    that all share the promo's single rate, so only `merchant` is filled.
   *  · Sudameris' "ZONA SUR – ENCARNACIÓN" — a *table* where each of 81
   *    businesses has its own days, rate, cap and validity ("LA BARRA |
   *    Miércoles | 25% de reintegro | Gs. 1.000.000"). Inheriting the parent's
   *    terms here produced 81 rows claiming a flat 20% on every day of the
   *    week, which is simply not what the PDF says.
   *
   * Limits are generous because real data broke the original ones: entries
   * carry parenthesised branch lists ("BELLINI PASTA (Paseo Carmelitas,
   * Shopping del Sol, ...)"), and one promo listed more than 150 businesses.
   */
  affiliatedMerchants: z
    .array(
      z.object({
        merchant: z.string().trim().min(1).max(300),
        category: z.enum(DISCOUNT_CATEGORIES).nullish(),
        percent: z.number().min(0).max(100).nullish(),
        installments: z.number().int().min(0).max(60).nullish(),
        eligibleDays: z.string().trim().max(120).nullish(),
        monthlyCapAmount: z.number().nonnegative().nullish(),
        monthlyCapKind: z.enum(['spend', 'rebate']).nullish(),
        validFrom: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullish(),
        validUntil: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullish(),
      })
    )
    .max(400)
    .nullish(),
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
            percent: { type: 'number', description: 'The rate this member actually gets — standard card tier, Mastercard brand, best payment method. See the rate rule in the system prompt.' },
            installments: { type: 'number', description: 'Interest-free installment count, if offered.' },
            eligibleDays: { type: 'string', description: 'e.g. "viernes". Omit if the promo applies every day.' },
            monthlyCapAmount: { type: 'number', description: 'The monthly cap amount in guaranies exactly as written (e.g. 1000000 for "Gs. 1.000.000"). Omit if none.' },
            monthlyCapKind: { type: 'string', enum: ['spend', 'rebate'], description: 'What monthlyCapAmount limits: "spend" for a "tope de compra" (the purchase total that earns the discount), "rebate" for a cap on the reintegro itself. Omit when there is no cap.' },
            validFrom: { type: 'string', description: 'ISO date (YYYY-MM-DD), if a start date is given.' },
            validUntil: { type: 'string', description: 'ISO date (YYYY-MM-DD), if an end date is given.' },
            description: { type: 'string', description: 'One short plain-language sentence summarizing the offer, under 200 characters.' },
            affiliatedMerchants: {
              type: 'array',
              description:
                'Only for umbrella promos: when the Bases y Condiciones lists the businesses the discount actually applies to — a numbered "Comercios Adheridos" section, or a "COMERCIOS" table with columns like Comercio / Días / Beneficio / Tope de compra / Vigencia — put one entry here per business. Omit entirely for a normal single-merchant promo.',
              items: {
                type: 'object',
                properties: {
                  merchant: {
                    type: 'string',
                    description:
                      'The business name. Strip "(aplica desde ...)" date qualifiers and skip city/section sub-headers that are not businesses, but keep branch/location text that is part of the entry\'s own name.',
                  },
                  category: { type: 'string', enum: [...DISCOUNT_CATEGORIES], description: 'This business\'s own category. A zone-wide promo has no single category, so judge each business by what it sells.' },
                  percent: { type: 'number', description: 'This business\'s own rate, when the table gives one. Omit if the promo states a single rate for everyone.' },
                  installments: { type: 'number', description: 'This business\'s own interest-free installment count, if listed.' },
                  eligibleDays: { type: 'string', description: 'This business\'s own days, e.g. "miércoles y jueves". Omit if not listed per business.' },
                  monthlyCapAmount: { type: 'number', description: 'This business\'s own cap in guaranies, if listed.' },
                  monthlyCapKind: { type: 'string', enum: ['spend', 'rebate'], description: 'What that cap limits. Same rule as the promo-level field.' },
                  validFrom: { type: 'string', description: 'ISO date, if this business has its own start date.' },
                  validUntil: { type: 'string', description: 'ISO date, if this business has its own end date.' },
                },
                required: ['merchant'],
              },
            },
          },
          required: ['externalId', 'merchant', 'category', 'description'],
        },
      },
    },
    required: ['discounts'],
  },
};

const systemPrompt = (bank: string) => `You extract structured card-discount data from ${bank} Paraguay's promo pages for a
personal finance app. You are given several promos, each with its merchant name, a short
on-page summary, and (usually) the full text of its "Bases y Condiciones" PDF — the
authoritative legal terms. Prefer the Bases y Condiciones text over the summary when they
disagree; it is always more complete and more precise.

THE RATE RULE — this is what matters most, and it is a procedure, not a preference for
high or low numbers. Many of these promos quote several percentages. Work in this order:

STEP 1 — keep only the rates this person can actually get. They hold a standard MASTERCARD
credit card and may pay however they like.
  · CARD TIER: premium rates (Black, Black Premier, Metalcard Premier, Infinite, Elite)
    are not theirs. Keep the standard ones (Clasica, Oro, Classic, Gold).
  · CARD BRAND: keep the MASTERCARD rates. If Mastercard is not listed, keep the lowest
    brand's.
  · PAYMENT METHOD: paying by QR in the bank's app and paying with the physical card are
    both open to them on that same card, so keep whichever pays better — usually the QR
    one. This is a choice they make, not a tier they are shut out of.

STEP 2 — of the rates that survive, report the LOWEST as "percent". What is left varies by
things they do not control, chiefly product line, and the lowest is the only figure that is
true of any purchase. "Hasta N%" is a ceiling, not a promise: ignore it whenever a concrete
rate is stated alongside, and fall back to it only when nothing else is given.

Worked example, from a real Punto Farma promo:

    QR PANAL, CABAL Y MASTERCARD HASTA 45%   No farma (productos varios)
    QR PANAL, CABAL Y MASTERCARD 35%         Farma (medicamentos nacionales)
    QR PANAL, CABAL Y MASTERCARD 30%
    TARJETAS DE CRÉDITO FÍSICAS 30%          Farma y No Farma

Step 1 keeps the three QR rows, because QR pays at least as well as the physical card.
Step 2 answers 30 — not 45, which is a ceiling on one product line, and not 35, which only
covers national medicines. Reporting 45 would promise half again what the till gives.

UMBRELLA PROMOS. Some promos are not a single merchant at all — they are a campaign or a
geographic zone, and the Bases y Condiciones lists the businesses the discount actually
applies to. Put one affiliatedMerchants entry per business. Two shapes appear:

  · A plain numbered list, where everyone shares the promo's single rate — e.g. "5.
    Comercios Adheridos" under "La Ruta Gastronómica" (112 restaurants: KFC, Subway,
    Mostaza), or "La Ruta del Café" (23 cafés grouped under non-numbered city sub-headers
    like "Asunción" that are not businesses themselves). Here fill in only "merchant" and
    "category" — the terms come from the promo itself.

  · A TABLE, with columns like "Comercio | Días | Beneficio | Tope de compra mensual |
    Vigencia" — e.g. "ZONA SUR – ENCARNACIÓN" or "ZONA CENTRAL". Every row is a different
    deal and you must copy each one's own values: "LA BARRA | Miércoles | 25% de reintegro
    | Gs. 1.000.000" is 25% on Wednesdays with a Gs. 1.000.000 cap, not whatever the promo
    header said. Filling these from the promo instead of the row is the single worst thing
    you can do here — it invents a rate the bank never offered.

For a table row's Beneficio, apply the tier rule and then add what stacks: "20% de
reintegro + 5% elite" is 20 (the +5 is a premium-card bonus, excluded); "30% de descuento
en caja + 10% de reintegro" is 40, because a base cardholder gets both. Leave a field
empty when that row does not state it, rather than guessing from a neighbouring row.

Still fill in merchant/category/percent/etc. for the promo itself as usual. A normal
single-merchant promo has no such list — leave affiliatedMerchants empty for those.

CATEGORY. Always pick the closest of the nine fixed categories listed in the tool schema —
never invent your own label, never leave it blank. When in doubt, use "other".

MONTHLY CAPS. Report one only when the text states it explicitly, and say which kind it
is. These banks almost always cap the *purchase total* that earns the discount ("Tope de
compra mensual de Gs. 1.000.000" -> monthlyCapAmount: 1000000, monthlyCapKind: "spend").
Some instead cap the reintegro itself ("reintegro maximo mensual de Gs. 200.000" ->
monthlyCapAmount: 200000, monthlyCapKind: "rebate"). Where a promo states both, report the
spend one — they are two ways of saying the same limit. Copy the number as written; do not
convert between the two yourself. Dates in the source are Spanish
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
      console.error(`[scraper] batch attempt ${attempt} failed, retrying:`, error);
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
}

/**
 * monthly_cap_minor always means "the most spend that earns this discount in a
 * month", whatever form the promo stated it in.
 *
 * The two forms are equivalent — GNB's Petrosur terms spell the conversion out
 * themselves ("Tope de compra mensual de Gs. 1.000.000 ... equivalente a un
 * reintegro máximo mensual en el extracto de Gs. 200.000") — so normalising
 * here means cardDiscounts.ts has exactly one rule to apply. The arithmetic is
 * done in code rather than asked of the model, for the same reason every other
 * figure is: a model doing sums in its head is where wrong numbers come from.
 */
type CapSource = { monthlyCapAmount?: number | null; monthlyCapKind?: 'spend' | 'rebate' | null };

function spendCapOf(d: CapSource, percent: number | null): number | null {
  const cap = d.monthlyCapAmount ?? null;
  if (cap == null) return null;
  if (d.monthlyCapKind !== 'rebate') return cap;
  // A rebate cap only converts if we know the rate it was a rebate at.
  if (!percent) return null;
  return Math.round((cap * 100) / percent);
}

/**
 * One row per business the promo actually covers.
 *
 * Each affiliated business overrides the promo's terms field by field and
 * inherits whatever it does not state. That is what lets one mechanism serve
 * both shapes: a plain "Comercios Adheridos" list states nothing per business
 * and inherits everything, while a zone table states its own days, rate, cap
 * and validity per row and inherits nothing but the description.
 *
 * Still mechanical rather than model-driven — the model reports each row's
 * fields once; it is never asked to restate the parent's for all 81 of them.
 */
function expand(d: z.infer<typeof discountSchema>): ExtractedDiscount[] {
  const base = {
    externalId: d.externalId,
    category: d.category,
    percent: d.percent ?? null,
    installments: d.installments ?? null,
    eligibleDays: d.eligibleDays ?? null,
    monthlyCapMinor: spendCapOf(d, d.percent ?? null),
    validFrom: d.validFrom ?? null,
    validUntil: d.validUntil ?? null,
    description: d.description,
  };

  if (!d.affiliatedMerchants || d.affiliatedMerchants.length === 0) {
    return [{ ...base, merchant: d.merchant }];
  }

  return d.affiliatedMerchants.map(a => {
    const percent = a.percent ?? base.percent;
    return {
      ...base,
      merchant: a.merchant,
      category: a.category ?? base.category,
      percent,
      installments: a.installments ?? base.installments,
      eligibleDays: a.eligibleDays ?? base.eligibleDays,
      // The cap is resolved against *this row's* rate, since a rebate-form cap
      // converts differently for a merchant on 25% than one on 20%.
      monthlyCapMinor: a.monthlyCapAmount != null ? spendCapOf(a, percent) : base.monthlyCapMinor,
      validFrom: a.validFrom ?? base.validFrom,
      validUntil: a.validUntil ?? base.validUntil,
    };
  });
}

async function extractBatch(bank: string, promos: RawPromo[], maxTokens: number): Promise<ExtractedDiscount[]> {
  if (!env.llmApiKey) return [];

  const anthropic = new Anthropic({ apiKey: env.llmApiKey, baseURL: env.llmBaseUrl });
  const response = await withRetry(() =>
    anthropic.messages.create({
      model: env.llmModel,
      max_tokens: maxTokens,
      system: systemPrompt(bank),
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
        `[scraper] skipping malformed discount: ${parsed.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`
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
export async function extractDiscounts(bank: string, promos: RawPromo[]): Promise<ExtractResult> {
  const discounts: ExtractedDiscount[] = [];
  const resolvedIds = new Set<string>();

  const multiMerchant = promos.filter(p => p.basesText && COMERCIOS_ADHERIDOS_RE.test(p.basesText));
  const normal = promos.filter(p => !multiMerchant.includes(p));

  /**
   * On failure, halve the batch and retry each half rather than dropping all
   * of it.
   *
   * The usual cause is the response running past max_tokens — the tool call
   * comes back truncated, with `discounts` missing entirely — and that is a
   * property of how much text this particular group of promos needed, not of
   * any one promo being bad. A Sudameris run lost 15 promos to a single such
   * batch. Splitting turns that into a couple of extra calls, and only a promo
   * that fails *alone* is actually skipped.
   */
  const runBatch = async (batch: RawPromo[], maxTokens: number): Promise<void> => {
    try {
      discounts.push(...(await extractBatch(bank, batch, maxTokens)));
      for (const promo of batch) resolvedIds.add(promo.externalId);
    } catch (error) {
      if (batch.length > 1) {
        const mid = Math.ceil(batch.length / 2);
        console.warn(`[scraper] batch of ${batch.length} failed, splitting and retrying:`, (error as Error).message);
        await runBatch(batch.slice(0, mid), maxTokens);
        await runBatch(batch.slice(mid), maxTokens);
        return;
      }
      console.error(`[scraper] promo ${batch[0]?.externalId} failed after retries, skipping:`, error);
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
