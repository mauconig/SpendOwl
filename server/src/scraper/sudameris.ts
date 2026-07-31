import * as cheerio from 'cheerio';
import { fetchText, tryBasesText, type BankScraper, type RawPromo } from './common.ts';

/**
 * Fetching only — no interpretation. Selectors verified by hand against live
 * pages: the merchant is the first `h3` inside `#one_item`, the terms blurb is
 * `.description-promo`, and the Bases y Condiciones link is the
 * `a.button-detail` pointing at a PDF.
 *
 * Sudameris splits its promos across **two listings under different URL
 * prefixes** — `/beneficios` (destacados) and `/beneficios/promociones`
 * (promociones) — and the numeric ids restart in each. So an id here is the
 * path segment pair, e.g. `destacado/875`, not a bare number: `875` alone
 * would collide between the two and silently overwrite the wrong row, since
 * bank_discounts is keyed on (bank, external_id, merchant).
 *
 * Their Bases y Condiciones PDFs are consistently structured — VIGENCIA,
 * BENEFICIO, CONDICIONES, EXCLUSIONES — and the CONDICIONES block is where the
 * real terms live. The page blurb often gives a rounded headline while the PDF
 * carries the monthly cap and the card tiers, which is exactly why extract.ts
 * is fed the PDF text and not just the summary.
 */

const BASE_URL = 'https://www.sudameris.com.py';

const LISTINGS = [
  { path: '/beneficios', prefix: 'destacado' },
  { path: '/beneficios/promociones', prefix: 'promocion' },
] as const;

/**
 * Every promo id across both listings, prefixed with which one it came from.
 *
 * Neither listing paginates — both return their full set in one page, and
 * probing the site's own search never surfaced an id outside them.
 */
async function listPromoIds(): Promise<string[]> {
  const ids = new Set<string>();

  for (const { path, prefix } of LISTINGS) {
    const html = await fetchText(`${BASE_URL}${path}`);
    const $ = cheerio.load(html);
    $(`a[href*="/${prefix}/"]`).each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const match = href.match(new RegExp(`/${prefix}/(\\d+)/detalle`));
      if (match?.[1]) ids.add(`${prefix}/${match[1]}`);
    });
  }

  return [...ids];
}

/** One promo's detail page, plus its Bases y Condiciones PDF text if it has one. */
async function fetchPromo(id: string): Promise<RawPromo> {
  const sourceUrl = `${BASE_URL}/beneficios/${id}/detalle`;
  const html = await fetchText(sourceUrl);
  const $ = cheerio.load(html);

  const item = $('#one_item');
  const merchant = item.find('h3').first().text().trim();

  // The blurb is a stack of <p> lines (VIGENCIA / BENEFICIO / ...). Collapsing
  // whitespace keeps it one readable paragraph for the model without losing
  // the bullet order.
  const summaryText = item.find('.description-promo').first().text().replace(/\s+/g, ' ').trim();

  // Some promos link the same PDF twice (a desktop and a mobile button), so
  // first-match is right rather than collecting them all.
  const basesHref =
    item
      .find('a.button-detail[href$=".pdf"]')
      .first()
      .attr('href') ??
    item
      .find('a[href$=".pdf"]')
      .first()
      .attr('href') ??
    null;
  const basesUrl = basesHref ? (basesHref.startsWith('http') ? basesHref : `${BASE_URL}${basesHref}`) : null;

  const basesText = basesUrl ? await tryBasesText(basesUrl) : null;

  return { externalId: id, merchant, sourceUrl, basesUrl, summaryText, basesText };
}

export const sudameris: BankScraper = { bank: 'Sudameris', listPromoIds, fetchPromo };
