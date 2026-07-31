import { query, transaction } from '../db.ts';
import { groupBranches, planGrouping } from './groupBranches.ts';

/**
 * VPS maintenance step: folds already-imported chain branches into one row.
 *
 * import.ts now groups on the way in, so a fresh scrape needs nothing. This
 * exists for rows imported before that — re-importing the old JSON files is not
 * an option, because they have drifted from production (the GNB file predates
 * the `bank` field entirely) and re-scraping costs a full LLM run to recover
 * data that is already sitting in the table.
 *
 * Prints the plan and changes nothing unless --apply is passed, because the
 * merge is a delete: get it wrong and the only way back is a re-scrape.
 *
 *   node --env-file=/opt/spendowl/api.env src/scraper/regroup.ts
 *   node --env-file=/opt/spendowl/api.env src/scraper/regroup.ts --apply
 */

type DiscountRow = {
  id: string;
  bank: string;
  externalId: string;
  merchant: string;
  description: string;
};

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const rows = await query<DiscountRow>(
    `SELECT id, bank, external_id AS "externalId", merchant, description FROM bank_discounts`
  );
  const banks = [...new Set(rows.map(r => r.bank))].sort();
  console.log(`[regroup] ${rows.length} rows across ${banks.length} banks${apply ? '' : '  (dry run)'}`);

  let totalRemoved = 0;

  for (const bank of banks) {
    // Grouped per bank: external ids are only unique within one bank, so
    // pooling them would let one bank's promo absorb another's rows.
    const mine = rows.filter(r => r.bank === bank);
    const plans = planGrouping(mine);
    const after = groupBranches(mine).length;
    console.log(`\n[regroup] ${bank}: ${mine.length} -> ${after} rows (${plans.length} merges)`);

    for (const plan of plans) {
      const members = mine.filter(
        r => r.externalId === plan.externalId && plan.absorbed.includes(r.merchant)
      );
      // Prefer a row already named after the chain, so an exactly-matching row
      // keeps its id rather than being deleted and its sibling renamed.
      const survivor = members.find(r => r.merchant === plan.chain) ?? members[0];
      if (!survivor) continue;
      const doomed = members.filter(r => r.id !== survivor.id);

      console.log(
        `  [${plan.externalId}] "${plan.chain}" <- ${members.length} rows` +
          (plan.wholePromo ? '  (whole promo)' : '')
      );
      totalRemoved += doomed.length;

      if (!apply) continue;
      await transaction(async client => {
        // Delete first: (bank, external_id, merchant) is unique, so renaming
        // the survivor while its siblings still exist could collide.
        if (doomed.length > 0) {
          await client.query(`DELETE FROM bank_discounts WHERE id = ANY($1::uuid[])`, [
            doomed.map(r => r.id),
          ]);
        }
        if (survivor.merchant !== plan.chain) {
          await client.query(`UPDATE bank_discounts SET merchant = $1 WHERE id = $2`, [
            plan.chain,
            survivor.id,
          ]);
        }
      });
    }
  }

  console.log(
    `\n[regroup] ${apply ? 'removed' : 'would remove'} ${totalRemoved} rows` +
      (apply ? '' : '  — re-run with --apply')
  );
  process.exit(0);
}

main().catch(error => {
  console.error('[regroup] fatal:', error);
  process.exit(1);
});
