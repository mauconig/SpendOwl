import Constants from 'expo-constants';

/**
 * Expo Go runs on the phone, so `localhost` there is the phone itself, not the
 * dev machine. Metro already serves over the machine's LAN address, so reuse
 * that host and just swap the port — this keeps working when the machine's IP
 * changes (new Wi-Fi, DHCP lease) with no config edit.
 *
 * Set EXPO_PUBLIC_API_URL to point at a deployed API instead.
 */
export const API_BASE_URL = resolveBaseUrl();

function resolveBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/+$/, '');

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost ?? '';
  const host = hostUri.split(':')[0];
  if (host) return `http://${host}:8787`;

  // Expo web, or a build with no dev-server metadata.
  return 'http://localhost:8787';
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type GetToken = () => Promise<string | null>;

/**
 * Every request carries the Clerk session token. The server derives the user id
 * from it, so there is no user id in any URL — a request simply cannot ask for
 * another account's data.
 */
export function createApi(getToken: GetToken) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    if (!token) throw new ApiError(401, 'Not signed in');

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          // Only a JSON body (always a string here, via JSON.stringify) gets
          // this header. A FormData body — postForm's multipart upload — must
          // NOT have Content-Type set by hand: fetch computes its own value
          // with the multipart boundary baked in, and a hand-set one would be
          // missing that boundary and break parsing on the server.
          ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
      });
    } catch {
      // fetch only rejects on a transport failure — almost always the dev
      // server not running, or the phone being on a different network.
      throw new ApiError(0, `Can't reach the SpendOwl API at ${API_BASE_URL}. Is the server running?`);
    }

    if (response.status === 204) return undefined as T;

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = (body as { error?: string } | null)?.error ?? `Request failed (${response.status})`;
      throw new ApiError(response.status, message);
    }
    return body as T;
  }

  return {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
    patch: <T>(path: string, body: unknown) =>
      request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
    del: (path: string) => request<void>(path, { method: 'DELETE' }),
    // Multipart upload — voice notes, the one request this app sends that
    // isn't JSON. `form` is typed loosely rather than as React Native's
    // FormData because RN's `.append('audio', { uri, name, type })` file
    // shape isn't a valid `Blob` per lib.dom.d.ts, even though it is exactly
    // what RN's fetch implementation expects at runtime.
    postForm: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form as never }),
  };
}

export type Api = ReturnType<typeof createApi>;
