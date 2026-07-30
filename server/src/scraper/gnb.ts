import * as cheerio from 'cheerio';
import { PDFParse } from 'pdf-parse';

/**
 * Fetching only — no interpretation. Selectors are tied to GNB's current
 * markup (verified by hand against a live promo page: merchant lives in
 * `h4.beneficio-titulo`, the summary block in `.background-map`, the Bases y
 * Condiciones PDF link is the `.beneficio.button.link` anchor). If GNB
 * reshuffles their page layout this needs updating; if they just reword a
 * promo, only extract.ts's prompt is affected, never this file.
 */

const BASE_URL = 'https://www.beneficiosbancognb.com.py';

// Identifies this as a low-volume, monthly, personal-finance-app crawl of
// GNB's own public promo pages (not adversarial traffic) if anyone looks.
const USER_AGENT = 'SpendOwlPersonalScraper/1.0 (+monthly personal read of public bank promo pages)';

export type RawPromo = {
  externalId: string;
  merchant: string;
  sourceUrl: string;
  basesUrl: string | null;
  summaryText: string;
  basesText: string | null;
};

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** All current promo ids, from the category index page. */
export async function listPromoIds(): Promise<string[]> {
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

/** The PDF is the authoritative source for tier percentages and terms. */
export async function fetchBasesText(pdfUrl: string): Promise<string> {
  const res = await fetch(pdfUrl, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${pdfUrl} -> ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

/** One promo's detail page, plus its Bases y Condiciones PDF text if it has one. */
export async function fetchPromo(id: string): Promise<RawPromo> {
  const sourceUrl = `${BASE_URL}/beneficios/${id}/`;
  const html = await fetchText(sourceUrl);
  const $ = cheerio.load(html);

  const merchant = $('h4.beneficio-titulo').first().text().trim();
  const summaryText = $('.background-map').first().text().replace(/\s+/g, ' ').trim();

  const basesHref = $('a.beneficio.button.link').first().attr('href') ?? null;
  const basesUrl = basesHref ? (basesHref.startsWith('http') ? basesHref : `${BASE_URL}${basesHref}`) : null;

  const basesText = basesUrl ? await fetchBasesText(basesUrl) : null;

  return { externalId: id, merchant, sourceUrl, basesUrl, summaryText, basesText };
}
