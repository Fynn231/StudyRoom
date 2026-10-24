import { useEffect, useState, type ReactNode } from 'react';
import { authFetch, sessionIdentity, useAuth } from './auth.js';
function LiveSessionGate({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [state, setState] = useState<'checking' | 'live' | 'blocked'>('checking');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true, pending = false;
    const controller = new AbortController();
    const check = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await authFetch('/api/session', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(7000)]) });
        if (active) setState(response.ok ? 'live' : 'blocked');
      } catch { if (active) setState('blocked'); }
      finally { pending = false; }
    };
    void check(); const timer = setInterval(() => void check(), 5000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [session?.access_token, retry]);
  if (state === 'checking') return <p role="status">Checking your sign-in session…</p>;
  if (state === 'blocked') return <section><p role="alert">Session expired or its check is unavailable. Sign in again. If this persists, the operator must install the Study Room session checker in Supabase.</p><button onClick={() => { setState('checking'); setRetry(n => n + 1); }}>Retry session check</button></section>;
  return <>{children}</>;
}
export function AuthGate({ children }: { children?: ReactNode }) {
  const { config, session, error, loading, signInWithEmail, signInWithGoogle, signOut } = useAuth();
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>, success = '') {
    setBusy(true); setMessage('');
    try { await action(); setMessage(success); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Sign-in failed or link expired. Try again.'); }
    finally { setBusy(false); }
  }
  if (loading) return <p role="status">Loading sign-in configuration…</p>;
  if (!config) return <p role="alert">{error || 'Sign-in configuration unavailable. Reload to retry.'}</p>;
  if (!config.required) return <>{children}</>;
  if (session) return <><div className="auth-status"><button disabled={busy} onClick={() => void run(signOut)}>Sign out</button>{(message || error) && <p role="alert">{message || error}</p>}</div><LiveSessionGate key={sessionIdentity(session)}>{children}</LiveSessionGate></>;
  return <section className="auth-panel"><h1>Sign in to Study Room</h1><p>Use a magic link in this browser or continue with Google.</p>{error && <p role="alert">{error}</p>}<form onSubmit={e => { e.preventDefault(); const email = (e.currentTarget.elements.namedItem('email') as HTMLInputElement).value; void run(() => signInWithEmail(email), 'Check your email. Open the link in this browser.'); }}><label>Email <input name="email" type="email" required autoComplete="email" /></label><button disabled={busy}>Send magic link</button></form><button disabled={busy} onClick={() => void run(signInWithGoogle)}>Continue with Google</button>{error?.includes('sign-out failed') && <button disabled={busy} onClick={() => void run(signOut)}>Retry sign-out</button>}{message && <p role="status">{message}</p>}</section>;
}
