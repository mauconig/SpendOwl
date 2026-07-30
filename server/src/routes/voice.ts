import { Hono } from 'hono';
import type { AppEnv } from '../auth.ts';
import { getUserCurrency } from '../currency.ts';
import { env } from '../env.ts';
import { TranscriptionError, transcribeAudio, vocabularyHint } from '../transcribe.ts';
import { CoachTurnError, insertMessage, runCoachTurn } from './chat.ts';

// A voice note recorded on HIGH_QUALITY (128kbps m4a) runs well under 1MB per
// minute; this is a generous ceiling against a runaway recording, comfortably
// inside Groq's 25MB limit rather than pinned to it.
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

/**
 * Voice notes. The transcript is treated as exactly the text the user would
 * have typed: it is stored as the 'voice' message's payload.text (which
 * buildHistory in chat.ts reads verbatim), and the very same runCoachTurn that
 * /api/chat uses then runs on it. Nothing about propose_expense, card
 * approval, or any of the other coach tools needed to know a voice note was
 * involved — a voice note is a text message that arrived by a different route.
 *
 * The one thing specific to this endpoint is transcription, and the one
 * design choice specific to it is vocabularyHint(): the same merchant/card/
 * subscription names problem the coach already has (see propose_expense's "use
 * only the merchant they named" rule) shows up again here, one layer earlier —
 * a transcriber that mishears "Superseis" hands the coach a wrong merchant
 * before the coach ever gets a chance to be careful about it.
 */
export const voiceRoute = new Hono<AppEnv>().post('/', async c => {
  if (!env.sttApiKey) {
    return c.json({ error: 'Voice notes are not configured on this server (STT_API_KEY is unset).' }, 503);
  }
  if (!env.llmApiKey) {
    return c.json({ error: 'The coach is not configured on this server (LLM_API_KEY is unset).' }, 503);
  }

  const userId = c.get('userId');

  const body = await c.req.parseBody().catch(() => null);
  const audio = body?.audio;
  if (!(audio instanceof File)) {
    return c.json({ error: 'Expected multipart form data with an "audio" file field.' }, 400);
  }
  if (audio.size === 0) return c.json({ error: 'Empty recording.' }, 400);
  if (audio.size > MAX_AUDIO_BYTES) return c.json({ error: 'That recording is too long.' }, 413);

  // The client's own timer, not derived from the file — decoding audio
  // duration server-side would need a media library for a number the phone
  // already knows exactly.
  const durationSecs = Math.max(Math.round(Number(body?.duration ?? 0)), 1);

  let transcript: string;
  try {
    transcript = await transcribeAudio(audio, await vocabularyHint(userId));
  } catch (error) {
    console.error('[voice]', error);
    const message = error instanceof TranscriptionError ? error.message : 'Transcription failed.';
    return c.json({ error: message }, 502);
  }

  // Silence, static, or a recording that trails off unintelligibly. Nothing is
  // stored — an empty voice bubble with no transcript and no reply would be a
  // confusing, permanent fixture in the transcript for a genuinely transient
  // problem, the same reasoning /api/chat uses for a failed turn.
  if (!transcript) {
    return c.json({ error: "Couldn't make out anything in that recording. Try again?" }, 422);
  }

  const currency = await getUserCurrency(userId);
  await insertMessage(userId, 'voice', { dur: `0:${String(durationSecs).padStart(2, '0')}`, text: transcript });

  try {
    await runCoachTurn(userId, currency);
  } catch (error) {
    return c.json({ error: error instanceof CoachTurnError ? error.message : 'Something went wrong.' }, 502);
  }

  return c.body(null, 204);
});
