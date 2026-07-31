import { readFile } from 'node:fs/promises';
import { transaction } from '../db.ts';
import type { ScrapeOutput } from './scrape.ts';

/**
 * VPS step: loads a JSON file produced by scrape.ts (run on a developer
 * machine) into the production bank_discounts table. Kept separate from
 * scraping so the production server never makes outbound calls to GNB's site
 * or the LLM for this feature — it only ever touches its own Postgres.
 *
 *   node --env-file=/opt/spendowl/api.env src/scraper/import.ts /tmp/gnb-discounts.json
 */

async function main(): Promise<void> {
  const inPath = process.argv[2];
  if (!inPath) {
    console.error('Usage: node src/scraper/import.ts <path-to-json>');
    process.exit(1);
  }

  const data = JSON.parse(await readFile(inPath, 'utf8')) as ScrapeOutput;
  console.log(
    `[scraper:gnb:import] loaded ${data.discounts.length} discounts (${data.resolvedIds.length} resolved ids), generated ${data.generatedAt}`
  );

  await transaction(async client => {
    // Clears exactly the promos the scrape run resolved — NOT everything it
    // fetched. A promo whose extraction failed after retries was left out of
    // resolvedIds on purpose, so its existing row here survives untouched.
    if (data.resolvedIds.length > 0) {
      await client.query(`DELETE FROM bank_discounts WHERE bank = 'GNB' AND external_id = ANY($1::text[])`, [
        data.resolvedIds,
      ]);
    }

    for (const d of data.discounts) {
      await client.query(
        `INSERT INTO bank_discounts
           (bank, external_id, merchant, category, percent, installments, eligible_days,
            monthly_cap_minor, monthly_cap_currency, valid_from, valid_until, description,
            source_url, bases_url)
         VALUES ('GNB', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (bank, external_id) DO UPDATE SET
           merchant = EXCLUDED.merchant,
           category = EXCLUDED.category,
           percent = EXCLUDED.percent,
           installments = EXCLUDED.installments,
           eligible_days = EXCLUDED.eligible_days,
           monthly_cap_minor = EXCLUDED.monthly_cap_minor,
           monthly_cap_currency = EXCLUDED.monthly_cap_currency,
           valid_from = EXCLUDED.valid_from,
           valid_until = EXCLUDED.valid_until,
           description = EXCLUDED.description,
           source_url = EXCLUDED.source_url,
           bases_url = EXCLUDED.bases_url,
           scraped_at = now()`,
        [
          d.externalId,
          d.merchant,
          d.category,
          d.percent,
          d.installments,
          d.eligibleDays,
          d.monthlyCapMinor,
          d.monthlyCapMinor !== null ? 'PYG' : null,
          d.validFrom,
          d.validUntil,
          d.description,
          d.sourceUrl,
          d.basesUrl,
        ]
      );
    }
  });

  console.log('[scraper:gnb:import] done.');
  process.exit(0);
}

main().catch(error => {
  console.error('[scraper:gnb:import] fatal:', error);
  process.exit(1);
});
