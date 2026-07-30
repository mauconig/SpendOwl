// Loaded from ../.env.local via `node --env-file-if-exists` (see package.json).
// DATABASE_URL falls back to the docker-compose credentials so a fresh clone
// runs with no env setup at all; CLERK_SECRET_KEY has no safe default and is
// required, because without it every request would be unauthenticated.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. It lives in .env.local at the repo root — run \`clerk env pull\` if it is absent.`
    );
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://spendowl:spendowl@localhost:5432/spendowl',
  clerkSecretKey: required('CLERK_SECRET_KEY'),

  // The chat coach. Deliberately *not* required() like the Clerk key: that one
  // gates every route, so booting without it is meaningless, whereas this one
  // gates a single endpoint. A missing key degrades /api/chat to a clear 503
  // rather than taking the Dashboard, Vault and settings down with it.
  //
  // Points at DeepSeek's Anthropic-compatible endpoint by default — the same
  // @anthropic-ai/sdk client talks to it, so switching to Anthropic proper (or
  // to deepseek-v4-pro) is an env change and a restart, never a code change.
  llmApiKey: process.env.LLM_API_KEY ?? null,
  llmBaseUrl: process.env.LLM_BASE_URL ?? 'https://api.deepseek.com/anthropic',
  llmModel: process.env.LLM_MODEL ?? 'deepseek-v4-flash',
} as const;
