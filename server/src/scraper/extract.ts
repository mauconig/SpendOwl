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
 * The one rule that matters: GNB's promos routinely list two tiers in the
 * same paragraph — a higher rate for Black/Black Premier/Metalcard Premier
 * and a lower one for Clasica/Oro (verified against a live Bases y
 * Condiciones PDF: "Hasta 25%... Black..." vs "Hasta 20%... Clasicas y
 * Oro..."). We only ever want the lower number, and the prompt below states
 * that explicitly rather than leaving it to be inferred.
 */

const BATCH_SIZE = 15;
const MAX_TOKENS = 4096;

export type ExtractedDiscount = {
  externalId: string;
  merchant: string;
  category: string | null;
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
  category: z.string().trim().min(1).max(40).nullish(),
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
            merchant: { type: 'string' },
            category: { type: 'string', description: 'A short merchant category, e.g. "supermarket", "pharmacy", "restaurant". Omit if unclear.' },
            percent: { type: 'number', description: 'The LOWER tier percentage only. See system prompt rule.' },
            installments: { type: 'number', description: 'Interest-free installment count, if offered.' },
            eligibleDays: { type: 'string', description: 'e.g. "viernes". Omit if the promo applies every day.' },
            monthlyCapAmount: { type: 'number', description: 'The monthly purchase/discount cap amount in guaranies, if stated (e.g. 1000000 for "Gs. 1.000.000"). Omit if none.' },
            validFrom: { type: 'string', description: 'ISO date (YYYY-MM-DD), if a start date is given.' },
            validUntil: { type: 'string', description: 'ISO date (YYYY-MM-DD), if an end date is given.' },
            description: { type: 'string', description: 'One short plain-language sentence summarizing the offer, under 200 characters.' },
          },
          required: ['externalId', 'merchant', 'description'],
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

async function extractBatch(promos: RawPromo[]): Promise<ExtractedDiscount[]> {
  if (!env.llmApiKey) return [];

  const anthropic = new Anthropic({ apiKey: env.llmApiKey, baseURL: env.llmBaseUrl });
  const response = await anthropic.messages.create({
    model: env.llmModel,
    max_tokens: MAX_TOKENS,
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
  });

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
    const d = parsed.data;
    discounts.push({
      externalId: d.externalId,
      merchant: d.merchant,
      category: d.category ?? null,
      percent: d.percent ?? null,
      installments: d.installments ?? null,
      eligibleDays: d.eligibleDays ?? null,
      monthlyCapMinor: d.monthlyCapAmount ?? null,
      validFrom: d.validFrom ?? null,
      validUntil: d.validUntil ?? null,
      description: d.description,
    });
  }
  return discounts;
}

/** Chunks promos into batches so no single call carries the whole site's text. */
export async function extractDiscounts(promos: RawPromo[]): Promise<ExtractedDiscount[]> {
  const results: ExtractedDiscount[] = [];
  for (let i = 0; i < promos.length; i += BATCH_SIZE) {
    const batch = promos.slice(i, i + BATCH_SIZE);
    results.push(...(await extractBatch(batch)));
  }
  return results;
}
