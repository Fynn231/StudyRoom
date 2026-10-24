import { usePrivateStorage } from './privateStorage.js';
import { useEffect, useId, useRef, useState } from 'react';
import { ConnectedMusic } from './ConnectedMusic.js';
import { useCopy } from './lockInCopy.js';
import { appleMusicLink, loadMusicPrefs, MUSIC_PREFS_KEY, saveMusicPrefs, type MusicPrefs, type MusicProvider } from './musicPrefs.js';

export function spotifyLink(input: string): string | null {
  if (input.length > 2048 || /[\s\\]/.test(input) || !/^https:\/\/open\.spotify\.com\/(track|album|playlist)\/[A-Za-z0-9]{22}(?:[?#].*)?$/.test(input)) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com' || url.username || url.password || url.port) return null;
    url.search = ''; url.hash = '';
    return url.href;
  } catch { return null; }
}

export const featuredSpotify = 'https://open.spotify.com/track/2KpZZ1cyChx3REhma5nOv6';

type Loaded = { provider: 'spotify' | 'apple'; url: string } | null;
const DEFAULT_PREFS: MusicPrefs = { provider: 'spotify', spotify: null, apple: null };
const load = (storage: Storage): MusicPrefs => {
  try { if (!storage?.getItem(MUSIC_PREFS_KEY)) return DEFAULT_PREFS; } catch { return DEFAULT_PREFS; }
  return loadMusicPrefs(storage);
};

export function Music({ lockIn = false, activation = 0 }: { lockIn?: boolean; activation?: number }) {
  const storage = usePrivateStorage();
  const c = useCopy();
  const uid = useId();
  const panel = useRef<HTMLDetailsElement>(null);
  const [prefs, setPrefs] = useState<MusicPrefs>(() => load(storage));
  const [draft, setDraft] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const previousActivation = useRef(0);
  const autoFeatured = useRef(false);
  const provider = prefs.provider;
  const saved = provider === 'apple' ? prefs.apple : prefs.spotify;

  useEffect(() => {
    if (activation === previousActivation.current) return;
    previousActivation.current = activation;
    if (activation <= 0) return;
    if (panel.current) panel.current.open = true;
    if (provider === 'silent' || loaded) return;
    if (provider === 'apple' && prefs.apple) setLoaded({ provider: 'apple', url: prefs.apple });
    if (provider === 'spotify') { autoFeatured.current = !prefs.spotify; setLoaded({ provider: 'spotify', url: prefs.spotify ?? featuredSpotify }); }
  }, [activation, provider, prefs.apple, prefs.spotify, loaded]);

  // Leaving the secret mode unloads only the track it auto-loaded; explicit choices stay.
  useEffect(() => {
    if (!lockIn && loaded && autoFeatured.current) { autoFeatured.current = false; setLoaded(null); }
  }, [lockIn, loaded]);

  function chooseProvider(next: MusicProvider) {
    const value: MusicPrefs = { ...prefs, provider: next };
    setPrefs(value);
    setLoaded(null); setSelected(null); setDraft(''); autoFeatured.current = false; setError(''); setMessage('');
    saveMusicPrefs(value, storage);
  }

  function remember() {
    const ok = saveMusicPrefs(prefs, storage);
    setMessage(ok ? 'Saved on this device for this browser only.' : 'Could not save preferences on this device.');
  }

  const active = loaded;
  const link = active?.url ?? selected ?? (lockIn && provider === 'spotify' ? featuredSpotify : null);
  const playerTitle = active?.provider === 'apple' ? 'Official Apple Music player' : 'Official Spotify music player';

  return <details ref={panel} className="optional-panel music-panel">
    <summary>{c('musicSummary', 'Music')}</summary>
    <p className="quiet-note">Official provider player · press Play manually. Loading contacts the provider, not our room. Study notes and tasks never go to music providers; music and account permissions never go to peers. Playback, previews and full-track access depend on the provider, your sign-in, session and browser.</p>
    <div className="music-provider" role="radiogroup" aria-label="Music provider">
      {([['spotify', 'Spotify'], ['apple', 'Apple Music'], ['silent', 'Silent mode']] as const).map(([value, label]) => <label key={value} className="music-provider-option"><input type="radio" name={`${uid}-provider`} value={value} checked={provider === value} onChange={() => chooseProvider(value)} />{label}</label>)}
    </div>
    {provider === 'silent' && <p className="quiet-note" role="status">Silent focus selected. No player is loaded and no music provider is contacted.</p>}
    {provider === 'spotify' && <>
      {lockIn && <p className="featured-track">ALTERED OBSIDIAN — AZALI</p>}
      {(!active || active.provider !== 'spotify' || active.url !== featuredSpotify) && <button onClick={() => { autoFeatured.current = false; setLoaded({ provider: 'spotify', url: featuredSpotify }); }}>Load featured Spotify player</button>}
      {active?.provider === 'spotify' && <div className="spotify-player"><iframe title={playerTitle} src={`${active.url.replace('open.spotify.com/', 'open.spotify.com/embed/')}?utm_source=generator`} width="100%" height={active.url.includes('/track/') ? 152 : 352} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="no-referrer" /></div>}
      {link && <div className="selected-music"><a className="launch-link" href={link} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open in Spotify (new tab)</a>{active?.provider === 'spotify' && <button onClick={() => setLoaded(null)}>Unload Spotify player</button>}</div>}
      {active?.provider === 'spotify' && <p className="quiet-note">Blank or silent? Open in Spotify above. Loading does not confirm playback. Unload stops this player.</p>}
      {lockIn && <p className="quiet-note">Esc steps out when this page has focus; Exit Lock In Mode also works after focusing Spotify. Reload restores the theme only, not the player.</p>}
      <details className="music-custom"><summary>Choose another Spotify link</summary>
        <form onSubmit={e => { e.preventDefault(); const next = spotifyLink(draft); if (!next) { setError('Use an HTTPS open.spotify.com track, album or playlist link with a 22-character content ID, without credentials or a custom port.'); return; } setSelected(next); setError(''); setPrefs(p => ({ ...p, spotify: next })); }}>
          <label htmlFor={`${uid}-spotify`}>Spotify link</label><input id={`${uid}-spotify`} maxLength={2048} autoComplete="off" value={draft} onChange={e => { setDraft(e.target.value); setSelected(null); setError(''); }} placeholder="https://open.spotify.com/playlist/…" />
          <button type="submit">Select music link</button>
        </form>
        {error && <p role="alert" className="error">{error}</p>}
        {selected && <div className="selected-music"><p>{selected}</p><button onClick={() => { autoFeatured.current = false; setLoaded({ provider: 'spotify', url: selected }); setMessage(''); }}>Load selected Spotify player</button><button onClick={() => { setDraft(''); setSelected(null); setLoaded(null); }}>Clear music selection</button></div>}
      </details>
    </>}
    {provider === 'apple' && <>
      <p className="quiet-note">Apple Music: a signed-in subscriber may hear full tracks in Apple’s official player; otherwise previews. This app never claims playback started.</p>
      {active?.provider === 'apple' ? <div className="spotify-player apple-player"><iframe title={playerTitle} src={active.url} width="100%" height={active.url.includes('/album/') ? 450 : 175} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="no-referrer" /></div> : saved ? <div className="selected-music"><a className="launch-link" href={saved} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open in Apple Music (new tab)</a><button onClick={() => { autoFeatured.current = false; setLoaded({ provider: 'apple', url: saved }); }}>Load Apple Music player</button></div> : <p className="quiet-note">Add your own Apple Music album, playlist or song link below. No default track is assumed.</p>}
      {active?.provider === 'apple' && <div className="selected-music"><a className="launch-link" href={saved ?? active.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open in Apple Music (new tab)</a><button onClick={() => setLoaded(null)}>Unload Apple Music player</button></div>}
      <details className="music-custom music-custom-apple"><summary>Choose an Apple Music link</summary>
        <form onSubmit={e => { e.preventDefault(); const next = appleMusicLink(draft); if (!next) { setError('Use an HTTPS music.apple.com album, playlist or song link, without credentials or a custom port.'); return; } setSelected(next); setError(''); setPrefs(p => ({ ...p, apple: next })); }}>
          <label htmlFor={`${uid}-apple`}>Apple Music link</label><input id={`${uid}-apple`} maxLength={2048} autoComplete="off" value={draft} onChange={e => { setDraft(e.target.value); setSelected(null); setError(''); }} placeholder="https://music.apple.com/us/album/…" />
          <button type="submit">Select Apple Music link</button>
        </form>
        {error && <p role="alert" className="error">{error}</p>}
        {selected && <div className="selected-music"><p>{selected}</p><button onClick={() => { autoFeatured.current = false; setLoaded({ provider: 'apple', url: selected }); setMessage(''); }}>Load selected Apple Music player</button><button onClick={() => { setDraft(''); setSelected(null); setLoaded(null); }}>Clear Apple Music selection</button></div>}
      </details>
    </>}
    {provider !== 'silent' && <ConnectedMusic key={provider} provider={provider} embeddedActive={!!active} selection={active?.url ?? selected ?? saved ?? (provider === 'spotify' ? featuredSpotify : null)} onEnable={() => setLoaded(null)} />}
    <div className="music-prefs-actions"><button onClick={remember}>Remember my soundtrack on this device</button>{message && <p className="quiet-note" role="status">{message}</p>}</div>
    <p className="quiet-note">Preferences stay in this browser. Music is personal: it is never broadcast to a study room, and peers never receive it. Preferences save provider choices and links only, never account tokens or secrets.</p>
  </details>;
}
