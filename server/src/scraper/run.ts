import { transaction } from '../db.ts';
import { extractDiscounts } from './extract.ts';
import { delay, fetchPromo, listPromoIds, type RawPromo } from './gnb.ts';

/**
 * Run manually whenever GNB's offers should be re-synced, e.g.:
 *   ssh vps 'cd /path/to/spendowl/server && node --env-file-if-exists=../.env.local src/scraper/run.ts'
 *
 * No scheduler, no HTTP route — this data isn't user-scoped, so there's
 * nothing here that needs auth plumbing.
 */

const DELAY_MS = 400;

async function main(): Promise<void> {
  console.log('[scraper:gnb] listing promo ids...');
  const ids = await listPromoIds();
  console.log(`[scraper:gnb] found ${ids.length} promos`);

  const raw: RawPromo[] = [];
  for (const id of ids) {
    try {
      raw.push(await fetchPromo(id));
    } catch (error) {
      // Left untouched below: a fetch failure keeps whatever row that promo
      // already has rather than deleting it out from under a transient error.
      console.error(`[scraper:gnb] failed to fetch promo ${id}:`, error);
    }
    await delay(DELAY_MS);
  }
  console.log(`[scraper:gnb] fetched ${raw.length}/${ids.length} promos`);

  const withText = raw.filter(p => p.merchant && (p.basesText || p.summaryText));
  const { discounts, resolvedIds } = await extractDiscounts(withText);
  console.log(`[scraper:gnb] extracted ${discounts.length} discounts from ${resolvedIds.size}/${withText.length} promos (rest skipped after retries)`);

  const byId = new Map(raw.map(p => [p.externalId, p]));

  await transaction(async client => {
    // Clears exactly the promos whose extraction batch actually completed —
    // NOT everything we fetched. A promo whose batch failed after retries
    // keeps its existing row untouched rather than being deleted with
    // nothing to replace it.
    if (resolvedIds.size > 0) {
      await client.query(`DELETE FROM bank_discounts WHERE bank = 'GNB' AND external_id = ANY($1::text[])`, [
        [...resolvedIds],
      ]);
    }

    for (const d of discounts) {
      const promo = byId.get(d.externalId);
      if (!promo) continue; // model echoed an id it was never given

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
          promo.sourceUrl,
          promo.basesUrl,
        ]
      );
    }
  });

  console.log('[scraper:gnb] done.');
  process.exit(0);
}

main().catch(error => {
  console.error('[scraper:gnb] fatal:', error);
  process.exit(1);
});
