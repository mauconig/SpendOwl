/**
 * Collapses the branches of one chain into a single discount row.
 *
 * A promo's "Comercios Adheridos" list is written for a human reading a PDF,
 * so it names every till: Cooperativa Universitaria's fuel promo lists 113
 * ENERGY service stations, GNB's fashion promo lists 26 Rondina shops. Left
 * alone, the Offers screen shows "ENERGY CDE KM 6,5" and "ENERGY EMBOSCADA" as
 * if they were unrelated businesses, and a user looking for their local ENERGY
 * scrolls past sixty near-identical rows.
 *
 * The hard part is that the *opposite* shape looks almost identical. GNB's
 * restaurant promo also lists ~112 names, but those are 112 genuinely different
 * restaurants; its education promo lists hundreds of different schools. Merging
 * "COLEGIO SEMBRADOR" with "COLEGIO SANTISIMO REDENTOR" into "COLEGIO" would
 * destroy real data and silently apply one school's terms to another's.
 *
 * So a shared first word is never enough on its own. Two rules decide it, and
 * both are deliberately biased toward leaving rows alone — under-merging shows
 * a cluttered list, over-merging invents a merchant that does not exist.
 */

/** The minimum a row must have for grouping; the real rows carry much more. */
type Groupable = {
  externalId: string;
  merchant: string;
  description: string;
};

/** Rows are branches of one chain only if at least this many agree. */
const MIN_CLUSTER = 3;

/** Share of a promo that must be one chain before the whole promo is that chain. */
const DOMINANT_SHARE = 0.5;

/**
 * Words that describe *what a business is* rather than *which business it is*.
 * A prefix built only from these identifies nothing, so it can never be a
 * chain name. The education terms matter most: GNB's umbrella promos list
 * hundreds of separate schools, and every one of them starts with "COLEGIO",
 * "ESCUELA", "INSTITUTO" or "UNIVERSIDAD".
 */
const GENERIC = new Set(
  (
    'BAR RESTAURANT RESTAURANTE RESTO CAFE CAFETERIA HOTEL FARMACIA CASA EL LA LOS LAS DE DEL Y ' +
    'SHOPPING SUPER SUPERMERCADO MINI MERCADO ALMACEN CLINICA ESTACION AUTO SERVICIO GRUPO GROUP ' +
    'COMERCIAL EMPRESA SA SRL SOCIEDAD PIZZERIA PARRILLA HELADERIA PANADERIA SUSHI LIBRERIA ' +
    'BOUTIQUE STORE SHOP TIENDA GIMNASIO SPA SALON ESTUDIO TALLER LABORATORIO SANATORIO OPTICA ' +
    'BARBERIA PELUQUERIA ESPACIO AGENCIA PUNTO TRAVEL VIAJES THE SAN SANTA SANTO ASO ASOC ' +
    'ASOCIACION CTRO CENTRO ' +
    'COLEGIO COL ESCUELA ESC INSTITUTO INST UNIVERSIDAD UNIV FACULTAD LICEO ACADEMIA EDUCATIVO ' +
    'EDUCACION SEDE CAMPUS'
  ).split(' ')
);

/** Uppercase, unaccented, punctuation-free — "Óptica Trinidad" -> "OPTICA TRINIDAD". */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The chain name shared by every member, or null if there isn't one.
 *
 * Extends word by word for as long as all members agree, then drops trailing
 * generic words: the three "TAKUARE´E RESTO – RESTAURANTE DEL HOTEL <x>" rows
 * share six words, but the chain is "TAKUARE´E RESTO", not the sentence.
 */
function sharedPrefix(members: string[][]): string[] | null {
  const first = members[0];
  if (!first) return null;

  let len = 1;
  for (;;) {
    const next = first[len];
    if (!next || !members.every(m => m[len] === next)) break;
    len++;
  }

  let prefix = first.slice(0, len);
  while (prefix.length > 1 && GENERIC.has(prefix[prefix.length - 1] as string)) prefix = prefix.slice(0, -1);

  // "COLEGIO", "LA", "PUNTO" on their own name no one. Note this tests the
  // *extended* prefix, so a real chain that happens to start with a generic
  // word — "LA CUMBRE", "PUNTO FARMA" — still qualifies on its second word.
  if (prefix.every(w => GENERIC.has(w))) return null;
  return prefix;
}

/**
 * Re-reads the chain name off an original merchant string, keeping its casing
 * and punctuation.
 *
 * Walks the original rather than slicing it into whitespace-separated words,
 * because normalisation splits on punctuation too and the two do not line up:
 * "UTIC-CDE" is one whitespace word but two normalised ones, so slicing would
 * name the chain "UTIC-CDE" instead of "UTIC". Takes the shortest prefix of the
 * original that normalises to exactly the chain name.
 */
function originalPrefix(merchant: string, prefix: string[]): string {
  const want = prefix.join(' ');
  for (let i = 1; i <= merchant.length; i++) {
    if (norm(merchant.slice(0, i)) === want) {
      return merchant.slice(0, i).replace(/[\s\-–—,:;.]+$/, '').trim();
    }
  }
  return merchant;
}

export type GroupPlan = {
  externalId: string;
  /** The name the merged row gets. */
  chain: string;
  /** Every merchant string folded into it. */
  absorbed: string[];
  /** True when the entire promo turned out to be one chain. */
  wholePromo: boolean;
};

/**
 * Returns the merges that should happen, without applying them — so a caller
 * can print and eyeball them before writing anything to a database.
 */
export function planGrouping<T extends Groupable>(rows: T[]): GroupPlan[] {
  const byPromo = new Map<string, T[]>();
  for (const r of rows) {
    const list = byPromo.get(r.externalId);
    if (list) list.push(r);
    else byPromo.set(r.externalId, [r]);
  }

  const plans: GroupPlan[] = [];

  for (const [externalId, list] of byPromo) {
    if (list.length < MIN_CLUSTER) continue;

    // Cluster by first word, then find each cluster's real chain name.
    const byHead = new Map<string, { row: T; words: string[] }[]>();
    for (const row of list) {
      const words = norm(row.merchant).split(' ');
      if (!words[0]) continue;
      const bucket = byHead.get(words[0]);
      if (bucket) bucket.push({ row, words });
      else byHead.set(words[0], [{ row, words }]);
    }

    const clusters: { chain: string; members: T[] }[] = [];
    for (const members of byHead.values()) {
      if (members.length < MIN_CLUSTER) continue;
      const head = members[0];
      if (!head) continue;
      const prefix = sharedPrefix(members.map(m => m.words));
      if (!prefix) continue;
      clusters.push({
        chain: originalPrefix(head.row.merchant, prefix),
        members: members.map(m => m.row),
      });
    }
    if (clusters.length === 0) continue;

    // RULE 1 — the whole promo is one chain.
    //
    // Cooperativa Universitaria's fuel promo is a single ENERGY document: all
    // 113 rows are ENERGY stations, but 44 of them are named after the
    // franchisee that operates them ("SEMMA S.A. (3) - SAN GERARDO"), which no
    // prefix can connect to the other 69. Two things have to hold together
    // before the remainder is swept in: one chain covers most of the promo,
    // AND the promo's own description names that chain. GNB's Rondina promo
    // passes the first test at 76% and fails the second — its description
    // never says "Rondina" — which is correct, because the same promo also
    // covers Eneache and Estilo Sur.
    const biggest = clusters.reduce((a, b) => (b.members.length > a.members.length ? b : a));
    const describedBy = norm(list[0]?.description ?? '');
    if (
      biggest.members.length / list.length >= DOMINANT_SHARE &&
      describedBy.includes(norm(biggest.chain))
    ) {
      plans.push({
        externalId,
        chain: biggest.chain,
        absorbed: list.map(r => r.merchant),
        wholePromo: true,
      });
      continue;
    }

    // RULE 2 — merge only the rows that provably share a chain name, and leave
    // everything else in the promo untouched.
    for (const c of clusters) {
      plans.push({
        externalId,
        chain: c.chain,
        absorbed: c.members.map(r => r.merchant),
        wholePromo: false,
      });
    }
  }

  return plans;
}

/**
 * Applies `planGrouping`, keeping the first row of each merged set as the
 * survivor and renaming it to the chain. Every other field is identical across
 * a promo's rows — they all come from one promo — so the survivor carries the
 * same terms the branches did.
 */
export function groupBranches<T extends Groupable>(rows: T[]): T[] {
  const plans = planGrouping(rows);
  if (plans.length === 0) return rows;

  // Which (promo, merchant) pairs get folded, and into which chain name.
  const folded = new Map<string, string>();
  for (const p of plans) for (const m of p.absorbed) folded.set(`${p.externalId} ${m}`, p.chain);

  const out: T[] = [];
  const emitted = new Set<string>();
  for (const row of rows) {
    const chain = folded.get(`${row.externalId} ${row.merchant}`);
    if (chain === undefined) {
      out.push(row);
      continue;
    }
    const key = `${row.externalId} ${chain}`;
    if (emitted.has(key)) continue;
    emitted.add(key);
    out.push({ ...row, merchant: chain });
  }
  return out;
}
