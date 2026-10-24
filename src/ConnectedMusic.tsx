import { useAuthFetch } from './auth.js';
import { useEffect, useRef, useState } from 'react';
type Readiness = { spotify: { ready: boolean; authorized: boolean; blocker: string | null }; apple: { ready: false; blocker: string } };
type Player = { addListener: (name: string, callback: (event: any) => void) => boolean; connect: () => Promise<boolean>; disconnect: () => void; pause: () => Promise<void>; togglePlay: () => Promise<void>; activateElement: () => Promise<void> };
type SpotifySDK = { Player: new (options: { name: string; volume: number; getOAuthToken: (callback: (token: string) => void) => void }) => Player };
declare global { interface Window { Spotify?: SpotifySDK; onSpotifyWebPlaybackSDKReady?: () => void } }
let sdkLoad: Promise<SpotifySDK> | undefined;
function loadSDK(): Promise<SpotifySDK> {
  if (window.Spotify) return Promise.resolve(window.Spotify);
  if (sdkLoad) return sdkLoad;
  sdkLoad = new Promise<SpotifySDK>((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://sdk.scdn.co/spotify-player.js'; script.async = true;
    const fail = () => { clearTimeout(timer); script.remove(); window.onSpotifyWebPlaybackSDKReady = undefined; sdkLoad = undefined; reject(Error('SDK unavailable')); };
    const timer = setTimeout(fail, 15_000);
    window.onSpotifyWebPlaybackSDKReady = () => { clearTimeout(timer); if (window.Spotify) resolve(window.Spotify); else fail(); };
    script.onerror = fail; document.head.appendChild(script);
  });
  return sdkLoad;
}
export function ConnectedMusic({ provider, selection, onEnable, embeddedActive }: { provider: 'spotify' | 'apple'; selection: string | null; onEnable: () => void; embeddedActive: boolean }) {
  const authFetch = useAuthFetch();
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [message, setMessage] = useState('Account playback is optional. Official embeds above do not require this setup.');
  const [device, setDevice] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const player = useRef<Player | null>(null); const expiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generation = useRef(0); const alive = useRef(true);
  function teardown() {
    generation.current++; clearTimeout(expiry.current);
    const old = player.current; player.current = null;
    if (old) { void old.pause().catch(() => {}); old.disconnect(); }
  }
  useEffect(() => { alive.current = true; return () => { alive.current = false; teardown(); }; }, []);
  useEffect(() => { if (embeddedActive) { teardown(); setDevice(null); setEnabled(false); setMessage('Official embed selected. Connected Spotify device unloaded.'); } }, [embeddedActive]);
  async function check() {
    try { const response = await authFetch('/api/music/status', { cache: 'no-store' }); if (!response.ok) throw Error(); const value = await response.json(); if (alive.current) { setReadiness(value); setMessage('Setup checked. Authorization and device readiness are not playback.'); } }
    catch { if (alive.current) setMessage('Account setup is unavailable. Official embeds still work.'); }
  }
  async function authorize() {
    teardown(); setDevice(null); setEnabled(false);
    try { const response = await authFetch('/api/music/spotify/begin', { method: 'POST', headers: { 'Content-Type': 'application/json' } }); const value = await response.json(); if (!response.ok) throw Error(); const url = new URL(value.url); if (url.origin !== 'https://accounts.spotify.com' || url.pathname !== '/authorize') throw Error(); if (alive.current) window.location.assign(url.href); }
    catch { if (alive.current) setMessage('Could not start Spotify authorization. Check setup and retry.'); }
  }
  async function enable() {
    teardown(); const run = generation.current; setEnabled(true); setDevice(null); onEnable(); setMessage('Loading Spotify SDK. Playback has not started.');
    const current = () => alive.current && run === generation.current;
    const fail = (text: string) => { if (!current()) return; teardown(); setDevice(null); setEnabled(false); setMessage(text); };
    try {
      const SDK = await loadSDK(); if (!current()) return;
      const next = new SDK.Player({ name: 'StudyRoom personal player', volume: 0.5, getOAuthToken: callback => {
        void authFetch('/api/music/spotify/token', { method: 'POST' }).then(async response => {
          if (!response.ok) throw Error(); const token = await response.json();
          if (!current()) return;
          if (typeof token.access_token !== 'string' || !Number.isFinite(token.expiresAt) || token.expiresAt <= Date.now()) throw Error();
          clearTimeout(expiry.current); expiry.current = setTimeout(() => fail('Spotify authorization expired. Reconnect to continue.'), Math.min(token.expiresAt - Date.now(), 3600_000));
          callback(token.access_token); // SDK receives token transiently; never persisted by StudyRoom.
        }).catch(() => fail('Spotify authorization expired or unavailable. Reconnect.'));
      } });
      player.current = next;
      next.addListener('ready', ({ device_id }) => { if (current()) { setDevice(device_id); setMessage('Spotify device ready. Press Play selected; audio has not been confirmed.'); } });
      next.addListener('not_ready', () => { if (current()) { setDevice(null); setMessage('Spotify device offline. Disconnect and enable again.'); } });
      next.addListener('player_state_changed', state => { if (current()) setMessage(state ? state.paused ? 'Spotify device paused.' : 'Playing on this Spotify device.' : 'Spotify playback state unavailable.'); });
      for (const event of ['initialization_error', 'authentication_error', 'account_error', 'playback_error']) next.addListener(event, () => fail(event === 'account_error' ? 'Spotify Premium is required. Check your account.' : 'Spotify device failed. Check authorization, browser DRM and app access, then reconnect.'));
      next.addListener('autoplay_failed', () => { if (current()) setMessage('Browser blocked autoplay. Press Play selected again.'); });
      if (!await next.connect()) fail('Spotify device could not connect. Check Premium, browser DRM and app access.');
    } catch { fail('Spotify SDK unavailable or blocked. Official embeds remain available.'); }
  }
  async function play() {
    const current = player.current; const run = generation.current;
    if (!current || !device || !selection) return;
    try {
      // Activate synchronously from the actual click before awaiting network.
      const activated = current.activateElement(); await activated;
      const response = await authFetch('/api/music/spotify/play', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: device, url: selection }) });
      if (alive.current && run === generation.current) setMessage(response.ok ? 'Play requested. Waiting for Spotify device state; audio is not yet confirmed.' : 'Spotify refused playback. Check Premium, app access and the selected link.');
    } catch { if (alive.current && run === generation.current) setMessage('Play failed or browser blocked audio. Retry with a direct click.'); }
  }
  async function disconnect() {
    teardown(); setDevice(null); setEnabled(false);
    try { const response = await authFetch('/api/music/disconnect', { method: 'POST' }); if (!response.ok) throw Error(); if (alive.current) { setReadiness(value => value ? { ...value, spotify: { ...value.spotify, authorized: false } } : value); setMessage('Local music session cleared. Provider consent can be revoked separately in Spotify account settings.'); } }
    catch { if (alive.current) setMessage('Device stopped locally; server disconnect could not be confirmed. Session expires within one hour.'); }
  }
  return <details className="music-custom"><summary>Account-connected playback</summary>
    <p className="quiet-note">Separate from embeds. Spotify requires Premium and a registered app. Permission is personal, never shared with Party. Access tokens stay in memory, expire within one hour and are not saved in browser storage. Disconnect here does not revoke provider consent.</p>
    <button onClick={() => void check()}>Check account setup</button>
    {readiness && <p className="quiet-note">{readiness[provider].blocker ?? 'Spotify app configured. Continue with genuine provider consent.'}</p>}
    {provider === 'spotify' && <>
      <button disabled={!readiness?.spotify.ready} onClick={() => void authorize()}>Connect Spotify account</button>
      {readiness?.spotify.authorized && <>
        <button disabled={enabled} onClick={() => void enable()}>Enable Spotify device</button>
        <button disabled={!device || !selection} onClick={() => void play()}>Play selected on Spotify device</button>
        <button disabled={!device} onClick={() => { void player.current?.togglePlay().catch(() => setMessage('Spotify pause/resume failed.')); }}>Pause / resume Spotify device</button>
        <button onClick={() => void disconnect()}>Disconnect Spotify account</button>
      </>}
    </>}
    <p className="quiet-note" aria-live="polite">{message}</p>
  </details>;
}
