import { requireLiveSession, SESSION_RECHECK_MS, type AuthConfig, type VerifiedUser } from './auth.js';
export type SessionGuard = ReturnType<typeof createSocketSession>;
type Timers = { onIdleVerified?: () => void; interval?: (fn: () => void, ms: number) => () => void; timeout?: (fn: () => void, ms: number) => () => void };
// The handshake has already verified this immutable token. Recheck its expiry and
// uncached session row for every event and every five seconds while idle.
export function createSocketSession(token: string, config: AuthConfig, user: VerifiedUser, disconnect: () => void, timers: Timers = {}) {
  let closed = false, checking = false;
  const interval = timers.interval ?? ((fn, ms) => { const id = setInterval(fn, ms); id.unref(); return () => clearInterval(id); });
  const timeout = timers.timeout ?? ((fn, ms) => { const id = setTimeout(fn, ms); id.unref(); return () => clearTimeout(id); });
  let stopExpiry = () => {};
  let stopIdle = () => {};
  function dispose() { closed = true; stopExpiry(); stopIdle(); }
  function close() { if (!closed) { dispose(); disconnect(); } }
  function armExpiry() {
    stopExpiry = timeout(() => {
      if (user.expiresAt <= Date.now()) close();
      else armExpiry();
    }, Math.min(2 ** 31 - 1, Math.max(0, user.expiresAt - Date.now())));
  }
  async function check() {
    if (closed || user.expiresAt <= Date.now()) { close(); throw Error('Session expired'); }
    if (checking) throw Error('Session check in progress. Retry shortly.');
    checking = true;
    try {
      await requireLiveSession(token, config);
      if (closed || user.expiresAt <= Date.now()) throw Error('Session expired');
    } catch (error) { close(); throw error; }
    finally { checking = false; }
  }
  armExpiry();
  stopIdle = interval(() => { if (!checking) void check().then(() => timers.onIdleVerified?.()).catch(() => {}); }, SESSION_RECHECK_MS);
  return { check, dispose, canDeliver: () => !closed && !checking && user.expiresAt > Date.now() };
}
