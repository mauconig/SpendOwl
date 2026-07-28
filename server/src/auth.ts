import { verifyToken } from '@clerk/backend';
import type { MiddlewareHandler } from 'hono';
import { env } from './env.ts';
import { ensureUser } from './seed.ts';

export type AppEnv = { Variables: { userId: string } };

/**
 * Verifies the Clerk session token the app sends as `Authorization: Bearer`.
 * The `sub` claim is the Clerk user id, and it is the only thing every query
 * scopes on — there is no other tenancy mechanism, so a route that forgets to
 * filter by it leaks another account's data.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;

  if (!token) return c.json({ error: 'Missing bearer token' }, 401);

  let userId: string;
  try {
    const claims = await verifyToken(token, { secretKey: env.clerkSecretKey });
    if (!claims.sub) return c.json({ error: 'Token has no subject claim' }, 401);
    userId = claims.sub;
  } catch {
    // Deliberately opaque: never echo verification internals to the client.
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  await ensureUser(userId);
  c.set('userId', userId);

  // Outside the try/catch above, so a genuine route error is never reported
  // as an auth failure.
  await next();
};
