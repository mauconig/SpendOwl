import { PDFParse } from 'pdf-parse';

/**
 * Fetching primitives shared by every bank's scraper.
 *
 * Each bank gets its own module for *where things are* — its listing URLs and
 * its page selectors, which are tied to that bank's markup and nothing else.
 * Everything below is bank-agnostic: HTTP, PDF text extraction, politeness
 * delay. Nothing here interprets a promo; that is extract.ts's job, and it
 * works the same whichever bank the text came from.
 */

// Identifies this as a low-volume, monthly, personal-finance-app crawl of a
// bank's own public promo pages (not adversarial traffic) if anyone looks.
export const USER_AGENT = 'NummusAIPersonalScraper/1.0 (+monthly personal read of public bank promo pages)';

/** One promo as fetched, before any interpretation. */
export type RawPromo = {
  externalId: string;
  merchant: string;
  sourceUrl: string;
  basesUrl: string | null;
  summaryText: string;
  basesText: string | null;
};

/** What every bank module must provide for scrape.ts to crawl it. */
export type BankScraper = {
  /** Stored in bank_discounts.bank, and matched against a card's name. */
  bank: string;
  listPromoIds(): Promise<string[]>;
  fetchPromo(id: string): Promise<RawPromo>;
};

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * The Bases y Condiciones PDF, which is the authoritative source for tier
 * percentages, caps and terms — a promo page's own blurb routinely rounds or
 * omits them. Returns every page, not just the first.
 */
/**
 * fetchBasesText, but a broken PDF costs only the PDF.
 *
 * Sudameris has promos whose Bases y Condiciones link points at a file
 * pdf-parse rejects outright ("Invalid PDF structure"). Letting that throw took
 * the whole promo down, when the on-page summary alone is usually enough to
 * extract a usable discount from — losing the precise terms is a far smaller
 * loss than losing the promo.
 */
export async function tryBasesText(pdfUrl: string): Promise<string | null> {
  try {
    return await fetchBasesText(pdfUrl);
  } catch (error) {
    console.warn(`[scraper] unreadable PDF ${pdfUrl}, falling back to the page summary:`, (error as Error).message);
    return null;
  }
}

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
