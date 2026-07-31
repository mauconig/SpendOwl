import { readFile } from 'node:fs/promises';
import { transaction } from '../db.ts';
import { groupBranches } from './groupBranches.ts';
import type { ScrapeOutput } from './scrape.ts';

/**
 * VPS step: loads a JSON file produced by scrape.ts (run on a developer
 * machine) into the production bank_discounts table. Kept separate from
 * scraping so the production server never makes outbound calls to a bank's
 * site or the LLM for this feature — it only ever touches its own Postgres.
 *
 * The bank comes from inside the file, never from a command-line argument:
 * the delete step below is scoped by bank, so a mistyped argument would clear
 * the wrong bank's discounts and replace them with another's.
 *
 *   node --env-file=/opt/spendowl/api.env src/scraper/import.ts /tmp/sudameris-discounts.json
 */

async function main(): Promise<void> {
  const inPath = process.argv[2];
  if (!inPath) {
    console.error('Usage: node src/scraper/import.ts <path-to-json>');
    process.exit(1);
  }

  const data = JSON.parse(await readFile(inPath, 'utf8')) as ScrapeOutput;
  if (!data.bank) {
    console.error('File has no `bank` field — it predates multi-bank scraping. Re-run the scrape.');
    process.exit(1);
  }
  const tag = `[scraper:import:${data.bank}]`;
  console.log(
    `${tag} loaded ${data.discounts.length} discounts (${data.resolvedIds.length} resolved ids), generated ${data.generatedAt}`
  );

  // Folds a chain's branches into one row. Done here rather than in scrape.ts
  // so the scrape output stays a faithful record of what the bank published,
  // and so re-importing an existing file is enough to regroup — grouping is a
  // pure function of the file, and costs no LLM call to redo.
  const discounts = groupBranches(data.discounts);
  if (discounts.length !== data.discounts.length) {
    console.log(`${tag} grouped branches: ${data.discounts.length} -> ${discounts.length} rows`);
  }

  await transaction(async client => {
    // Clears exactly the promos the scrape run resolved — NOT everything it
    // fetched. A promo whose extraction failed after retries was left out of
    // resolvedIds on purpose, so its existing row here survives untouched.
    if (data.resolvedIds.length > 0) {
      await client.query(`DELETE FROM bank_discounts WHERE bank = $1 AND external_id = ANY($2::text[])`, [
        data.bank,
        data.resolvedIds,
      ]);
    }

    for (const d of discounts) {
      await client.query(
        `INSERT INTO bank_discounts
           (bank, external_id, merchant, category, percent, installments, eligible_days,
            monthly_cap_minor, monthly_cap_currency, valid_from, valid_until, description,
            source_url, bases_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (bank, external_id, merchant) DO UPDATE SET
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
          data.bank,
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

  console.log(`${tag} done.`);
  process.exit(0);
}

main().catch(error => {
  console.error('[scraper:import] fatal:', error);
  process.exit(1);
});
