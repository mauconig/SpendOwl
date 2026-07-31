import * as cheerio from 'cheerio';
import { fetchText, tryBasesText, type BankScraper, type RawPromo } from './common.ts';

/**
 * Fetching only — no interpretation.
 *
 * Cooperativa Universitaria publishes nothing like GNB's or Sudameris' one-page
 * -per-promo layout. Promos live on 23 *category* pages
 * (/promociones/post/farmacias, .../supermercados, ...), each holding merchant
 * blocks of one or more cards:
 *
 *   <h2>Farmaoliva</h2>
 *     <div class="card promo-item">
 *       <span rel="category">Farmaoliva</span>
 *       <h6>Hasta 40% de Descuento</h6>
 *       <p>Todos los Miércoles</p>
 *       <a href=".../bases-y-condiciones1783347827.pdf">Bases y Condiciones</a>
 *
 * The category list itself comes from a small JSON endpoint the page's own
 * filter calls, so the set of categories is read rather than hardcoded and a
 * new one is picked up for free.
 *
 * Because a promo's name, offer, days and PDF all live on the category page,
 * `listPromoIds` parses those pages once and keeps what it found; `fetchPromo`
 * then only has to fetch the PDF. Re-fetching a category page per card would
 * mean ~77 requests for 23 pages' worth of information.
 */

const BASE_URL = 'https://www.universitaria.coop';
const CATEGORIES_URL = `${BASE_URL}/resultados-promocion_categoria?categoria=Todas`;

type Card = { merchant: string; offer: string; days: string; category: string; basesUrl: string | null };

/** Populated by listPromoIds, read by fetchPromo. */
const cards = new Map<string, Card>();

type CategoryRow = { slug?: unknown; nombre?: unknown };

async function listPromoIds(): Promise<string[]> {
  const raw = await fetchText(CATEGORIES_URL);
  const categories = (JSON.parse(raw) as CategoryRow[]).filter(
    (c): c is { slug: string; nombre: string } => typeof c.slug === 'string' && typeof c.nombre === 'string'
  );

  cards.clear();
  const ids: string[] = [];

  for (const category of categories) {
    const html = await fetchText(`${BASE_URL}/promociones/post/${category.slug}`);
    const $ = cheerio.load(html);

    $('.card.promo-item').each((index, el) => {
      const card = $(el);
      const merchant = card.find('[rel="category"]').first().text().trim();
      const offer = card.find('h6').first().text().replace(/\s+/g, ' ').trim();
      const days = card.find('p').first().text().replace(/\s+/g, ' ').trim();

      const href = card.find('a[href$=".pdf"]').first().attr('href') ?? null;
      const basesUrl = href ? (href.startsWith('http') ? href : `${BASE_URL}${href}`) : null;

      if (!merchant && !offer) return;

      // The Bases PDF filename carries a unique number and is the only stable
      // identifier on offer — position within a category shifts whenever a
      // promo is added or expires. Falls back to position only when a card has
      // no PDF at all.
      const stamp = basesUrl?.match(/(\d{6,})\.pdf$/)?.[1];
      const id = stamp ? `pdf/${stamp}` : `${category.slug}/${index}`;
      if (cards.has(id)) return;

      cards.set(id, { merchant, offer, days, category: category.nombre, basesUrl });
      ids.push(id);
    });
  }

  return ids;
}

async function fetchPromo(id: string): Promise<RawPromo> {
  const card = cards.get(id);
  if (!card) throw new Error(`Unknown promo id ${id} — listPromoIds must run first`);

  // The category name is worth passing on: "FARMACIAS" or "ESTACIONES DE
  // SERVICIO" is the publisher's own classification, and it is a far better
  // signal than guessing a category from a merchant name alone.
  // Some cards carry no offer text at all — CU fills h6 and p with the merchant
  // name (POPEYES / POPEYES / POPEYES), so repeating it three times would just
  // be noise around the one line that matters. The PDF is the real source for
  // those, and extract.ts already prefers it.
  const parts = [card.merchant, card.offer, card.days].filter(Boolean);
  const summaryText = [...new Set(parts), `Rubro: ${card.category}`].join('. ');

  const basesText = card.basesUrl ? await tryBasesText(card.basesUrl) : null;

  return {
    externalId: id,
    merchant: card.merchant || card.offer,
    // There is no per-promo page; the category page is the closest thing.
    sourceUrl: `${BASE_URL}/promociones`,
    basesUrl: card.basesUrl,
    summaryText,
    basesText,
  };
}

export const universitaria: BankScraper = { bank: 'Universitaria', listPromoIds, fetchPromo };
