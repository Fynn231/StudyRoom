import { inviteSuffix } from './invite.js';
import { createClient, type SupabaseClient, type Session, type AuthChangeEvent } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useCallback, useState, useRef, type ReactNode } from 'react';
export { createClient, type Session, type SupabaseClient, type AuthChangeEvent };
export interface AuthConfig { url: string; anonKey: string; required: boolean; }
export interface UserIdentity { id: string; email: string; name: string; }
export interface AuthContextValue {
  config: AuthConfig | null; session: Session | null; user: UserIdentity | null; isAuthorized: boolean;
  signInWithEmail: (email: string) => Promise<void>; signInWithGoogle: () => Promise<void>; signOut: () => Promise<void>;
  loading: boolean; error: string | null; supabase: SupabaseClient | null;
}
let _session: Session | null = null, _user: UserIdentity | null = null, epoch = 0;
export function sessionIdentity(session: Session | null): string {
  if (!session) return 'signed-out';
  try {
    const claims = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof claims.session_id === 'string' && claims.session_id) return `${session.user.id}:${claims.session_id}`;
  } catch { /* Only a UI remount key; identity is verified on the server. */ }
  return `${session.user.id}:${session.access_token}`;
}
export function setAuthSession(session: Session | null, user: UserIdentity | null): void {
  if (sessionIdentity(session) !== sessionIdentity(_session)) epoch++;
  _session = session; _user = user;
}
export function getAuthSession() { return { session: _session, user: _user }; }
export function clearAuthSession(): void { setAuthSession(null, null); }
export function createSupabaseClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, { auth: { storage: globalThis.localStorage, flowType: 'pkce', detectSessionInUrl: false } });
}
function sameOrigin(input: RequestInfo | URL) {
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
  if (url.origin !== window.location.origin) throw Error('Authenticated requests must stay on this origin');
}
export function createApiFetch(supabase: SupabaseClient) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    sameOrigin(input);
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const headers = new Headers(init?.headers);
    if (data.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`);
    return fetch(input, { ...init, headers });
  };
}
export async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
  sameOrigin(input);
  const headers = new Headers(init?.headers);
  if (_session?.access_token) headers.set('Authorization', `Bearer ${_session.access_token}`);
  return fetch(input, { ...init, headers });
}
// Capture the mounted account/session; refresh can replace its token, whereas a
// stale SDK callback from a previous account cannot make requests as the next.
export function useAuthFetch() {
  const [scope] = useState(() => epoch);
  return useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (scope !== epoch) throw Error('Sign-in session changed');
    const response = await authFetch(input, init);
    if (scope !== epoch) throw Error('Sign-in session changed');
    return response;
  }, [scope]);
}
const AuthContext = createContext<AuthContextValue | null>(null);
function identity(session: Session | null): UserIdentity | null {
  const u = session?.user;
  return u ? { id: u.id, email: u.email ?? '', name: typeof u.user_metadata?.name === 'string' ? u.user_metadata.name : '' } : null;
}
// Explicit ownership of both callback formats: the SDK's URL auto-detection is
// disabled, so an OAuth code is never exchanged twice.
function authInviteSuffix(url: URL): string {
  if (url.searchParams.has('room')) return inviteSuffix(url);
  // Optional email template preserves RedirectTo. Never navigate to it; extract
  // only a literal public room code from this exact same-origin callback path.
  if (url.searchParams.getAll('invite_redirect').length !== 1) return '';
  try {
    const target=new URL(url.searchParams.get('invite_redirect')!);
    return target.origin===url.origin && target.pathname==='/auth/confirm' && !target.hash && !target.username && !target.password ? inviteSuffix(target) : '';
  } catch { return ''; }
}
export async function completeAuthRedirect(sup: SupabaseClient, url: URL): Promise<void> {
  const p = url.searchParams;
  const callback = ['code', 'token_hash', 'type', 'error', 'error_description'].some(k => p.has(k)) || !!url.hash;
  if (!callback) return;
  window.history.replaceState(null, '', (url.pathname === '/auth/confirm' ? '/' : url.pathname) + authInviteSuffix(url));
  if (url.hash || p.has('error') || p.has('error_description')) throw Error('Sign-in failed or link expired. Request another link or try Google again.');
  if (p.has('token_hash')) {
    if (p.has('code') || p.getAll('token_hash').length !== 1 || p.getAll('type').length !== 1 || p.get('type') !== 'email' || !p.get('token_hash') || p.get('token_hash')!.length > 2048) throw Error('Invalid or expired magic link. Request a new one.');
    const { error } = await sup.auth.verifyOtp({ token_hash: p.get('token_hash')!, type: 'email' });
    if (error) throw Error('Magic link expired or invalid. Request a new one.');
  } else if (p.getAll('code').length === 1 && p.get('code') && p.get('code')!.length <= 2048 && !p.has('type')) {
    const { error } = await sup.auth.exchangeCodeForSession(p.get('code')!);
    if (error) throw Error('Sign-in code expired or its browser verifier is missing. Try again in this browser.');
  } else throw Error('Malformed sign-in callback. Request a new link.');
}
export function AuthProvider({ children, clientFactory = createSupabaseClient }: { children: ReactNode; clientFactory?: typeof createSupabaseClient }) {
  const signingOut = useRef(false);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let cleanup = () => {};
    const apply = (current: Session | null) => {
      if (cancelled || (current && signingOut.current)) return;
      setAuthSession(current, identity(current)); setSession(current);
    };
    void (async () => {
      try {
        const res = await fetch('/api/config', { cache: 'no-store', signal: controller.signal });
        if (!res.ok) throw Error('Could not load sign-in configuration. Reload to retry.');
        const payload = await res.json();
        if (cancelled) return;
        const auth = payload.auth as AuthConfig | undefined;
        if (!auth || typeof auth.required !== 'boolean' || !['local', 'hosted'].includes(payload.mode) || auth.required !== (payload.mode === 'hosted')) throw Error('Invalid sign-in configuration.');
        if (auth.required && (typeof auth.url !== 'string' || !auth.url.startsWith('https://') || typeof auth.anonKey !== 'string' || !auth.anonKey || auth.anonKey.startsWith('sb_secret_'))) throw Error('Hosted sign-in configuration is incomplete.');
        setConfig(auth);
        if (!auth.required) { apply(null); setLoading(false); return; }
        const sup = clientFactory(auth.url, auth.anonKey);
        setSupabase(sup);
        const { data: { subscription } } = sup.auth.onAuthStateChange((event, current) => { if (event === 'SIGNED_IN') signingOut.current = false; apply(current); });
        cleanup = () => { subscription.unsubscribe(); void sup.auth.dispose(); };
        try { await completeAuthRedirect(sup, new URL(window.location.href)); }
        catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Sign-in link expired.'); }
        const initial = await sup.auth.getSession();
        if (cancelled) return;
        if (initial.error) throw initial.error;
        apply(initial.data.session); setLoading(false);
      } catch (e) {
        if (!cancelled) { apply(null); setError(e instanceof Error ? e.message : 'Could not verify sign-in'); setLoading(false); }
      } finally { if (cancelled) cleanup(); }
    })();
    return () => { cancelled = true; controller.abort(); cleanup(); clearAuthSession(); };
  }, [clientFactory]);
  useEffect(() => {
    if (!session?.expires_at) return;
    const timer = setTimeout(() => { clearAuthSession(); setSession(null); setError('Your session expired. Sign in again.'); }, Math.min(2 ** 31 - 1, Math.max(0, session.expires_at * 1000 - Date.now())));
    return () => clearTimeout(timer);
  }, [session]);
  const signInWithEmail = useCallback(async (email: string) => {
    if (!supabase) throw Error('Sign-in configuration unavailable');
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/auth/confirm${inviteSuffix(new URL(window.location.href))}` } });
    if (error) throw error;
  }, [supabase]);
  const signInWithGoogle = useCallback(async () => {
    if (!supabase) throw Error('Sign-in configuration unavailable');
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/confirm${inviteSuffix(new URL(window.location.href))}` } });
    if (error) throw error;
  }, [supabase]);
  const signOut = useCallback(async () => {
    // Immediately unmount private state, sockets and SDK devices, including when
    // provider logout is slow or fails. Report failure; never assert revocation.
    signingOut.current = true; clearAuthSession(); setSession(null); setError(null);
    if (!supabase) return;
    const result = await supabase.auth.signOut({ scope: 'global' });
    if (result.error) { setError('Stopped locally; provider sign-out failed. Remote sessions may remain active. Retry sign-out.'); throw result.error; }
  }, [supabase]);
  const user = identity(session);
  return <AuthContext.Provider value={{ config, session, user, isAuthorized: !!session, signInWithEmail, signInWithGoogle, signOut, loading, error, supabase }}>{children}</AuthContext.Provider>;
}
export const useOptionalAuth = () => useContext(AuthContext);
export function useAuth(): AuthContextValue { const ctx = useContext(AuthContext); if (!ctx) throw Error('useAuth must be used within AuthProvider'); return ctx; }
