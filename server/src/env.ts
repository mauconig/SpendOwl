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
} as const;
