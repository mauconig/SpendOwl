import { env } from './env.ts';
import { query } from './db.ts';

/**
 * Speech-to-text for voice notes, via Groq's OpenAI-compatible endpoint
 * (`https://api.groq.com/openai/v1/audio/transcriptions`) — not the Anthropic
 * shim the coach uses, since this is a transcription model, not a chat one.
 *
 * Confirmed against Groq's live docs rather than assumed: the request is a
 * plain multipart POST (`file`, `model`, and an optional `prompt` of up to 224
 * tokens), the response is `{ text: string, ... }`, and files up to 25MB in
 * flac/mp3/mp4/mpeg/mpga/m4a/ogg/wav/webm are accepted — `expo-audio`'s
 * HIGH_QUALITY preset records `.m4a`, so no client-side transcoding is needed.
 *
 * `service_tier` is deliberately not sent. Groq's docs describe it for chat
 * completions (`flex` trades availability for throughput; `batch` trades
 * immediacy for a discount), but do not document it as a parameter of the
 * transcription endpoint specifically, and sending an unverified field to a
 * financial-data endpoint is a bad trade for a maybe. Omitting it already
 * gets the "on demand" tier — it is Groq's default, not something you opt into.
 */

export class TranscriptionError extends Error {}

export async function transcribeAudio(file: File, prompt?: string): Promise<string> {
  if (!env.sttApiKey) throw new TranscriptionError('Speech-to-text is not configured on this server.');

  const form = new FormData();
  form.append('file', file, file.name || 'note.m4a');
  form.append('model', env.sttModel);
  if (prompt) form.append('prompt', prompt);

  const response = await fetch(`${env.sttBaseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.sttApiKey}` },
    body: form,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new TranscriptionError(`Transcription failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as { text?: string };
  return (data.text ?? '').trim();
}

/**
 * A short prompt biasing Whisper towards this user's own vocabulary — the
 * merchants, cards and subscriptions it would otherwise have to guess the
 * spelling of. The 224-token limit is shared with whatever instruction goes
 * alongside it, so this stays deliberately short: names only, no sentences.
 *
 * The same problem `topMerchantsThisMonth` solves for the insights prompt
 * (see insights.ts) shows up here in a different shape — a transcriber that
 * has never heard of "Superseis" is exactly as likely to mishear it as a coach
 * is to misspell it.
 */
export async function vocabularyHint(userId: string): Promise<string> {
  const [merchants, subs, cards] = await Promise.all([
    query<{ merchant: string }>(
      `SELECT merchant FROM transactions WHERE user_id = $1
        GROUP BY merchant ORDER BY MAX(occurred_at) DESC LIMIT 12`,
      [userId]
    ),
    query<{ name: string }>(`SELECT name FROM subscriptions WHERE user_id = $1`, [userId]),
    query<{ name: string }>(`SELECT name FROM credit_cards WHERE user_id = $1`, [userId]),
  ]);

  const names = [...merchants.map(m => m.merchant), ...subs.map(s => s.name), ...cards.map(c => c.name)];
  if (names.length === 0) return '';
  return `Vocabulary that may appear: ${names.join(', ')}.`;
}
