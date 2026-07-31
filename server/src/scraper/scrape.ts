import { writeFile } from 'node:fs/promises';
import { extractDiscounts, type ExtractedDiscount } from './extract.ts';
import { delay, fetchPromo, listPromoIds, type RawPromo } from './gnb.ts';

/**
 * Local step: crawl GNB's promo pages and extract structured discounts via
 * the LLM. Meant to run from a developer machine, not the VPS — there's no
 * reason to spend production compute, or make the production IP the one
 * crawling GNB's site, for a job that has nothing to do with serving
 * requests. Writes a JSON file; import.ts is the VPS-side counterpart that
 * loads it into the production database.
 *
 *   npm run scrape:gnb                  writes ./gnb-discounts.json
 *   npm run scrape:gnb -- out.json      custom path
 *
 * Then, on the VPS:
 *   scp gnb-discounts.json vps:/tmp/
 *   ssh vps 'cd /opt/spendowl/app/server && node --env-file=/opt/spendowl/api.env src/scraper/import.ts /tmp/gnb-discounts.json'
 */

const DELAY_MS = 400;

export type ScrapeOutput = {
  generatedAt: string;
  resolvedIds: string[];
  discounts: (ExtractedDiscount & { sourceUrl: string; basesUrl: string | null })[];
};

async function main(): Promise<void> {
  const outPath = process.argv[2] ?? 'gnb-discounts.json';

  console.log('[scraper:gnb] listing promo ids...');
  const ids = await listPromoIds();
  console.log(`[scraper:gnb] found ${ids.length} promos`);

  const raw: RawPromo[] = [];
  for (const id of ids) {
    try {
      raw.push(await fetchPromo(id));
    } catch (error) {
      console.error(`[scraper:gnb] failed to fetch promo ${id}:`, error);
    }
    await delay(DELAY_MS);
  }
  console.log(`[scraper:gnb] fetched ${raw.length}/${ids.length} promos`);

  const withText = raw.filter(p => p.merchant && (p.basesText || p.summaryText));
  const { discounts, resolvedIds } = await extractDiscounts(withText);
  console.log(
    `[scraper:gnb] extracted ${discounts.length} discounts from ${resolvedIds.size}/${withText.length} promos (rest skipped after retries)`
  );

  const byId = new Map(raw.map(p => [p.externalId, p]));
  const output: ScrapeOutput = {
    generatedAt: new Date().toISOString(),
    resolvedIds: [...resolvedIds],
    discounts: discounts
      .filter(d => byId.has(d.externalId)) // drop an id the model echoed but was never given
      .map(d => {
        const promo = byId.get(d.externalId)!;
        return { ...d, sourceUrl: promo.sourceUrl, basesUrl: promo.basesUrl };
      }),
  };

  await writeFile(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`[scraper:gnb] wrote ${output.discounts.length} discounts to ${outPath}`);
}

main().catch(error => {
  console.error('[scraper:gnb] fatal:', error);
  process.exit(1);
});
