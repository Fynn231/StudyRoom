import { useAuthFetch } from './auth.js';
import { useEffect, useRef, useState } from 'react';
type Readiness = { spotify: { ready: boolean; authorized: boolean; canPlay?: boolean; canListen?: boolean; blocker: string | null }; apple: { ready: false; blocker: string } };
type Player = { addListener: (name: string, callback: (event: any) => void) => boolean; connect: () => Promise<boolean>; disconnect: () => void; pause: () => Promise<void>; togglePlay: () => Promise<void>; activateElement: () => Promise<void>; seek?: (position: number) => Promise<void>; setVolume?: (volume: number) => Promise<void> };
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
export function ConnectedMusic({ provider, selection, onEnable, embeddedActive, expanded = false }: { provider: 'spotify' | 'apple'; selection: string | null; onEnable: () => void; embeddedActive: boolean; expanded?: boolean }) {
  const authFetch = useAuthFetch();
  const panel = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (expanded && panel.current) panel.current.open = true; }, [expanded]);
  const [track,setTrack] = useState<{name:string;artist:string;position:number;duration:number;paused:boolean;observed:number}|null>(null);
  const [volume,setVolume] = useState(.5);
  const [,tick] = useState(0);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [message, setMessage] = useState('Account playback is optional. Official embeds do not require this setup.');
  const [device, setDevice] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  useEffect(()=>{if(!track || track.paused || !enabled)return;const timer=setInterval(()=>tick(n=>n+1),1000);return()=>clearInterval(timer);},[track,enabled]);
  const [connectionUrl, setConnectionUrl] = useState<string | null>(null);
  const [authorizing, setAuthorizing] = useState(false);
  const player = useRef<Player | null>(null); const expiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generation = useRef(0); const alive = useRef(true);
  function teardown() {
    generation.current++; clearTimeout(expiry.current);
    const old = player.current; player.current = null;
    if (old) { void old.pause().catch(() => {}); old.disconnect(); }
  }
  useEffect(() => { alive.current = true; return () => { alive.current = false; teardown(); }; }, []);
  useEffect(() => { if (embeddedActive) { teardown(); setDevice(null); setEnabled(false); setMessage('Official embed selected. Connected Spotify device unloaded.'); } }, [embeddedActive]);
  useEffect(() => {
    if (!connectionUrl) return;
    const timer = setTimeout(() => { setConnectionUrl(null); setMessage('Connection link expired. Check account setup or connect again; your study session is unchanged.'); }, 300_000);
    return () => clearTimeout(timer);
  }, [connectionUrl]);
  useEffect(()=>{const clear=()=>{teardown();setDevice(null);setEnabled(false);setTrack(null);setReadiness(v=>v?{...v,spotify:{...v.spotify,authorized:false}}:v);};window.addEventListener('studyroom:spotify-disconnected',clear);return()=>window.removeEventListener('studyroom:spotify-disconnected',clear);},[]);
  async function check() {
    try { const response = await authFetch('/api/music/status', { cache: 'no-store' }); if (!response.ok) throw Error(); const value = await response.json(); if (alive.current) { setReadiness(value); if (value.spotify?.authorized) setConnectionUrl(null); setMessage('Setup checked. Authorization and device readiness are not playback.'); } }
    catch { if (alive.current) setMessage('Account setup is unavailable. Official embeds still work.'); }
  }
  async function authorize() {
    teardown(); const run = generation.current; setDevice(null); setEnabled(false); setConnectionUrl(null); setAuthorizing(true);
    try { const response = await authFetch('/api/music/spotify/begin', { method: 'POST', headers: { 'Content-Type': 'application/json' } }); const value = await response.json(); if (!response.ok) throw Error(); const url = new URL(value.url); if (url.origin !== 'https://accounts.spotify.com' || url.pathname !== '/authorize') throw Error(); if (alive.current && run === generation.current) { setConnectionUrl(url.href); setMessage('Open Spotify in a new tab to connect. Your timer and drafts stay here. Return here and check account setup after finishing. The connection link expires in five minutes.'); } }
    catch { if (alive.current && run === generation.current) setMessage('Could not start Spotify authorization. Check setup and retry.'); }
    finally { if (alive.current && run === generation.current) setAuthorizing(false); }
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
      next.addListener('player_state_changed', state => { if (!current()) return;
        const item = state?.track_window?.current_track;
        setTrack(item && typeof item.name==='string' && Number.isFinite(state.position) && Number.isFinite(state.duration) ? {name:item.name.slice(0,200),artist:Array.isArray(item.artists)?item.artists.slice(0,5).map((a:any)=>String(a.name??'').slice(0,80)).join(', '):'',position:Math.max(0,state.position),duration:Math.max(1,state.duration),paused:state.paused!==false,observed:Date.now()}:null);
        setMessage(state ? state.paused ? 'Spotify device paused.' : 'Playing on this Spotify device.' : 'Spotify playback state unavailable.');
      });
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
    try { const response = await authFetch('/api/music/disconnect', { method: 'POST' }); if (!response.ok) throw Error(); if (alive.current) { setReadiness(value => value ? { ...value, spotify: { ...value.spotify, authorized: false } } : value); window.dispatchEvent(new Event('studyroom:spotify-disconnected')); setMessage('Local music session cleared. Provider consent can be revoked separately in Spotify account settings.'); } }
    catch { if (alive.current) setMessage('Device stopped locally; server disconnect could not be confirmed. Session expires within one hour.'); }
  }
  const position = track ? Math.min(track.duration, track.position + (track.paused ? 0 : Math.max(0,Date.now()-track.observed))) : 0;
  const clock = (ms:number) => `${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;
  return <details ref={panel} className="music-custom"><summary>Account-connected playback</summary>
    {provider==='spotify' && <section className="spotify-device-player" aria-label="Full Spotify player">
      <p className="eyebrow">SPOTIFY PLAYER</p><h3>{device && track ? track.name : 'Your soundtrack, in this room.'}</h3>
      <p>{device && track ? track.artist : 'Connect your Spotify account and enable this browser as a player. Full playback requires Spotify Premium and an approved Spotify app.'}</p>
      {device && track && <><label>Track position<input type="range" min="0" max={track.duration} step="1000" value={position} disabled={!player.current?.seek} onChange={e=>{const next=Number(e.target.value);void player.current?.seek?.(next).catch(()=>setMessage('Spotify could not seek.'));}}/></label><p className="quiet-note">{clock(position)} / {clock(track.duration)}</p></>}
      {device && <label>Spotify volume<input type="range" min="0" max="1" step=".05" value={volume} disabled={!player.current?.setVolume} onChange={e=>{const next=Number(e.target.value);setVolume(next);void player.current?.setVolume?.(next).catch(()=>setMessage('Spotify could not change volume.'));}}/></label>}
    </section>}
    <p className="quiet-note">Separate from embeds. Spotify requires Premium and a registered app. Permission is personal, never shared with Party. Access tokens stay in memory, expire within one hour and are not saved in browser storage. Disconnect here does not revoke provider consent.</p>
    <button onClick={() => void check()}>Check account setup</button>
    {readiness && <p className="quiet-note">{readiness[provider].blocker ?? 'Spotify app configured. Continue with genuine provider consent.'}</p>}
    {provider==='spotify'&&readiness?.spotify.authorized&&readiness.spotify.canPlay===false&&<p className="quiet-note">Listening status is connected. Connect playback separately to enable the in-page device.</p>}
    {provider === 'spotify' && <>
      <button disabled={!readiness?.spotify.ready || authorizing} onClick={() => void authorize()}>Connect Spotify account</button>
      {connectionUrl && <p><a className="launch-link" href={connectionUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Continue Spotify connection (new tab)</a></p>}
      {readiness?.spotify.authorized && readiness.spotify.canPlay!==false && <>
        <button disabled={enabled} onClick={() => void enable()}>Enable Spotify device</button>
        <button disabled={!device || !selection} onClick={() => void play()}>Play selected on Spotify device</button>
        <button disabled={!device} onClick={() => { void player.current?.togglePlay().catch(() => setMessage('Spotify pause/resume failed.')); }}>Pause / resume Spotify device</button>
        <button onClick={() => void disconnect()}>Disconnect Spotify account</button>
      </>}
    </>}
    <p className="quiet-note" aria-live="polite">{message}</p>
  </details>;
}
