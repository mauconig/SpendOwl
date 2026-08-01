import { queryOne } from './db.ts';

/**
 * The language the server writes prose in.
 *
 * Most of this app's text lives in the client and is translated there. Two
 * things are not: the coach's chat replies and the daily insights, both written
 * by a model on this machine. They have to be told which language to use — a
 * model will otherwise answer in whatever language the last message happened to
 * be in, so a Spanish user who typed one English merchant name would get an
 * English reply back.
 */

export const LANGUAGES = ['en', 'es'] as const;
export type Language = (typeof LANGUAGES)[number];

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** Defaults to Spanish, matching the column default — see migration 10. */
export async function getUserLanguage(userId: string): Promise<Language> {
  const row = await queryOne<{ language: string }>(`SELECT language FROM users WHERE id = $1`, [userId]);
  return isLanguage(row?.language) ? row.language : 'es';
}

/** How to name the language to a model, which needs it spelled out. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  es: 'Spanish (español)',
};
