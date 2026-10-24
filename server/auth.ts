import { createClient } from '@supabase/supabase-js';
export interface VerifiedUser { id: string; email: string; name: string; expiresAt: number; sessionId: string; }
export interface AuthConfig { supabaseUrl: string; anonKey: string; publicOrigin: string; }
export const SESSION_CHECK_TIMEOUT_MS = 3000;
export const SESSION_RECHECK_MS = 5000;
export function validateClaims(payload: Record<string, unknown>, config: AuthConfig): void {
  if (!Number.isSafeInteger(payload.exp) || (payload.exp as number) <= Date.now() / 1000) throw Error('Token expired');
  if (payload.aud !== 'authenticated') throw Error('Wrong audience');
  if (payload.iss !== `${config.supabaseUrl}/auth/v1`) throw Error('Wrong issuer');
  if (typeof payload.sub !== 'string' || !payload.sub.trim()) throw Error('Missing subject');
  if (payload.nbf !== undefined && (typeof payload.nbf !== 'number' || payload.nbf > Date.now() / 1000)) throw Error('Token not yet valid');
}
const providerFetch: typeof fetch = (input, init) => fetch(input, {
  ...init, redirect: 'error', signal: AbortSignal.timeout(SESSION_CHECK_TIMEOUT_MS),
});
// The SDK performs signature verification. No decoded claim establishes identity.
// Fetch a fresh JWKS per verification: no extra application cache, no token map.
// Supabase's edge may still cache keys for ten minutes; session RPC is uncached.
export async function verifyAccessToken(token: string, config: AuthConfig): Promise<VerifiedUser> {
  if (typeof token !== 'string' || token.length > 16384 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw Error('Invalid token');
  const [encodedHeader, encodedPayload] = token.split('.');
  const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString());
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
  if (!header || !['ES256', 'RS256', 'HS256'].includes(header.alg)) throw Error('Unsupported algorithm');
  validateClaims(payload, config);
  const client = createClient(config.supabaseUrl, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: providerFetch },
  });
  let key;
  if (header.alg !== 'HS256' && typeof header.kid === 'string') {
    const response = await providerFetch(`${config.supabaseUrl}/auth/v1/.well-known/jwks.json`);
    if (!response.ok) throw Error('Signing key service unavailable');
    const jwks = await response.json();
    if (!Array.isArray(jwks.keys) || jwks.keys.length > 64) throw Error('Invalid signing keys');
    key = jwks.keys.find((k: { kid?: string }) => k.kid === header.kid);
  }
  if (key) {
    const { data, error } = await client.auth.getClaims(token, { jwks: { keys: [key] } });
    if (error || !data) throw Error('Token verification failed');
    validateClaims(data.claims, config);
  } else {
    // Legacy symmetric or unknown/rotated key: require the Auth server to verify.
    // Bypass SDK's global JWKS cache when the fresh set no longer contains a key.
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user || data.user.id !== payload.sub) throw Error('Token verification failed');
  }
  validateClaims(payload, config); // also reject expiration during provider I/O
  return { id: payload.sub, email: typeof payload.email === 'string' ? payload.email : '', name: '', expiresAt: payload.exp * 1000, sessionId: typeof payload.session_id === 'string' ? payload.session_id : '' };
}
export async function requireLiveSession(token: string, config: AuthConfig): Promise<void> {
  const response = await providerFetch(`${config.supabaseUrl}/rest/v1/rpc/studyroom_session_active`, {
    method: 'POST', headers: { apikey: config.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: '{}', cache: 'no-store',
  });
  if (!response.ok) throw Error('Session check unavailable. Operator must install the studyroom_session_active RPC.');
  if (await response.json() !== true) throw Error('Session expired or revoked. Sign in again.');
}
export async function authenticate(token: string, config: AuthConfig): Promise<VerifiedUser> {
  const user = await verifyAccessToken(token, config);
  if (!user.sessionId) throw Error('Missing session identity');
  await requireLiveSession(token, config);
  if (user.expiresAt <= Date.now()) throw Error('Token expired');
  return user;
}
