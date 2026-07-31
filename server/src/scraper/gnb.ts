import * as cheerio from 'cheerio';
import { fetchText, tryBasesText, type BankScraper, type RawPromo } from './common.ts';

/**
 * Fetching only — no interpretation. Selectors are tied to GNB's current
 * markup (verified by hand against a live promo page: merchant lives in
 * `h4.beneficio-titulo`, the summary block in `.background-map`, the Bases y
 * Condiciones PDF link is the `.beneficio.button.link` anchor). If GNB
 * reshuffles their page layout this needs updating; if they just reword a
 * promo, only extract.ts's prompt is affected, never this file.
 */

const BASE_URL = 'https://www.beneficiosbancognb.com.py';

export type { RawPromo };

/** All current promo ids, from the category index page. */
async function listPromoIds(): Promise<string[]> {
  const html = await fetchText(`${BASE_URL}/beneficios/categorias/`);
  const $ = cheerio.load(html);
  const ids = new Set<string>();
  $('a[href^="/beneficios/"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const match = href.match(/^\/beneficios\/(\d+)\/?$/);
    if (match?.[1]) ids.add(match[1]);
  });
  return [...ids];
}

/** One promo's detail page, plus its Bases y Condiciones PDF text if it has one. */
async function fetchPromo(id: string): Promise<RawPromo> {
  const sourceUrl = `${BASE_URL}/beneficios/${id}/`;
  const html = await fetchText(sourceUrl);
  const $ = cheerio.load(html);

  const merchant = $('h4.beneficio-titulo').first().text().trim();
  const summaryText = $('.background-map').first().text().replace(/\s+/g, ' ').trim();

  const basesHref = $('a.beneficio.button.link').first().attr('href') ?? null;
  const basesUrl = basesHref ? (basesHref.startsWith('http') ? basesHref : `${BASE_URL}${basesHref}`) : null;

  const basesText = basesUrl ? await tryBasesText(basesUrl) : null;

  return { externalId: id, merchant, sourceUrl, basesUrl, summaryText, basesText };
}

export const gnb: BankScraper = { bank: 'GNB', listPromoIds, fetchPromo };
