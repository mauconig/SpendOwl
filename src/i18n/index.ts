import { ES } from './es';

/**
 * Translation, keyed by the English string itself.
 *
 * The alternative — invented keys like `dashboard.hero.title` — was rejected
 * because it makes every call site unreadable: `t('dashboard.hero.title')` tells
 * you nothing about what will appear on screen, so the English copy has to be
 * looked up in another file to review a component. Keying on the source string
 * keeps the code saying what it renders, and an untranslated string falls back
 * to itself rather than to a raw key leaking into the UI.
 *
 * The cost is that one English word cannot have two different translations. If
 * that ever comes up, the fix is to disambiguate the English rather than
 * inventing a key scheme for one collision.
 */

export const LANGUAGES = ['en', 'es'] as const;
export type Language = (typeof LANGUAGES)[number];

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/**
 * Module-level rather than a hook, so `t` works in the plain helper functions
 * that build labels outside a component — cardTitle, approveLabel, relative
 * dates. SpendOwlProvider sets it while rendering, before its children read it,
 * and a change re-renders the whole tree through the store's context value, so
 * nothing keeps a stale string.
 */
let current: Language = 'es';

export function setLanguage(lang: Language): void {
  current = lang;
}

export function getLanguage(): Language {
  return current;
}

/** The translated string, or the English one when there is no translation. */
export function t(english: string): string {
  if (current === 'en') return english;
  return ES[english] ?? english;
}

/**
 * `t` with substitution: t2('{n} days left', { n: 3 }).
 *
 * Placeholders are named rather than positional because Spanish reorders
 * clauses — "3 days left" becomes "quedan 3 días", and a positional scheme
 * would silently put the number in the wrong slot.
 */
export function tf(english: string, vars: Record<string, string | number>): string {
  return t(english).replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole
  );
}

/**
 * A spending category's display name, translated.
 *
 * CATS in theme.ts keeps its English names — they are also the keys into this
 * table — so every place that renders one goes through here instead of reading
 * `.name` directly.
 */
export function catName(name: string): string {
  return t(name);
}
