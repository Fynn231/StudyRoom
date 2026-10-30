import type { ListeningTrack } from '../src/protocol.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { authenticate, type AuthConfig, type VerifiedUser } from './auth.js';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

type Config = { clientId?: string; origin?: string };
type Identity = { user: VerifiedUser; token: string };
type Owner = { subject: string; sessionId: string; accessToken: string };
type Session = { owner?: Owner; until: number; state?: string; verifier?: string; used?: boolean; token?: string; scope?:string };
const scopes = 'streaming user-read-email user-read-private user-modify-playback-state';
const cookieName = 'studyroom_music';
export function musicConfig(): Config { return { clientId: process.env.SPOTIFY_CLIENT_ID, origin: process.env.STUDY_DEPLOYMENT_MODE === 'hosted' ? process.env.STUDY_PUBLIC_ORIGIN : process.env.MUSIC_ORIGIN }; }
function configured(c: Config, auth?: AuthConfig): boolean {
  try { const u = new URL(c.origin!); return /^[a-fA-F0-9]{32}$/.test(c.clientId ?? '') && u.origin === c.origin && (auth ? u.protocol === 'https:' && c.origin === auth.publicOrigin : u.protocol === 'http:' && u.hostname === '127.0.0.1' && !!u.port) && !u.username && !u.password; } catch { return false; }
}
function same(a: string, b: string) { const aa = Buffer.from(a); const bb = Buffer.from(b); return aa.length === bb.length && timingSafeEqual(aa, bb); }
async function readBody(req: IncomingMessage) {
  const timer = setTimeout(() => req.destroy(), 5000); timer.unref();
  try {
    let text = '', bytes = 0;
    for await (const part of req) { bytes += Buffer.byteLength(part); if (bytes > 4096) throw Error('body'); text += part; }
    return JSON.parse(text);
  } finally { clearTimeout(timer); }
}
export function createMusicHandler(config = musicConfig(), deps: { fetch?: typeof fetch; now?: () => number; auth?: AuthConfig; onListening?:(owner:Owner,track:ListeningTrack|null,target?:{roomCode:string;participantId:string})=>void } = {}) {
  const upstream = deps.fetch ?? fetch; const now = deps.now ?? Date.now;
  const sessions = new Map<string, Session>();
  const ready = configured(config, deps.auth); const redirect = `${config.origin}/api/music/spotify/callback`;
  function put(session: Session) {
    const id = randomBytes(32).toString('base64url'); sessions.set(id, session);
    return id;
  }
  const setCookie = (res: ServerResponse, id: string, seconds: number) => res.setHeader('Set-Cookie', `${cookieName}=${id}; Path=/api/music; HttpOnly; SameSite=Lax; Max-Age=${seconds}${deps.auth ? '; Secure' : ''}`);
  const handle = async (req: IncomingMessage, res: ServerResponse, identity?: Identity) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json');
    res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status: number, body: unknown) => { res.writeHead(status); res.end(JSON.stringify(body)); };
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1'); const path = url.pathname;
      for (const [key, session] of sessions) if (session.until <= now()) sessions.delete(key);
      const matches = (req.headers.cookie ?? '').split(';').map(s => s.trim()).filter(s => s.startsWith(`${cookieName}=`));
      const id = matches.length === 1 ? matches[0].slice(cookieName.length + 1) : '';
      let session = sessions.get(id);
      const canonical = ready && req.headers.host === new URL(config.origin!).host;
      if (ready && !canonical) { send(403, { error: 'Open the configured MUSIC_ORIGIN for account connection. Embeds still work on localhost.' }); return; }
      if (req.method === 'POST' && (!canonical || req.headers.origin !== config.origin || req.headers['sec-fetch-site'] === 'cross-site')) {
        send(ready ? 403 : 503, { error: ready ? 'Same-origin POST required.' : 'Configure SPOTIFY_CLIENT_ID and MUSIC_ORIGIN first.' }); return;
      }
      if (deps.auth && path !== '/api/music/spotify/callback') {
        if (!identity) { send(401, { error: 'Sign in required.' }); return; }
        if (session && (session.owner?.subject !== identity.user.id || session.owner?.sessionId !== identity.user.sessionId)) {
          if (path === '/api/music/status' || (path === '/api/music/spotify/begin' && req.method === 'POST')) session = undefined;
          else { send(403, { error: 'Music belongs to a different account or sign-in session. Connect your own account.' }); return; }
        }
      }
      if (path === '/api/music/status' && req.method === 'GET') {
        send(200, { spotify: { ready, authorized: !!session?.token, blocker: ready ? null : deps.auth ? `Configure SPOTIFY_CLIENT_ID (32 hex characters) on the server and register ${deps.auth.publicOrigin}/api/music/spotify/callback in the Spotify app. Premium and approved app access are required.` : 'Configure SPOTIFY_CLIENT_ID (32 hex characters) and MUSIC_ORIGIN (http://127.0.0.1:PORT); register /api/music/spotify/callback at that origin.', canPlay:!!session?.token&&(session.scope??scopes).includes('streaming'), canListen:!!session?.token&&(session.scope??scopes).split(' ').includes('user-read-currently-playing'), expiresAt: session?.token ? session.until : null }, apple: { ready: false, blocker: 'Apple connected playback is disabled: no verified MusicKit media identifier, Media Services signing key or developer-token issuer is configured. Official Apple embeds remain available.' } }); return;
      }
      if (!ready) { send(503, { error: 'Connected music is not configured. Official embeds remain available.' }); return; }
      if (path === '/api/music/spotify/begin' && req.method === 'POST') {
        if (sessions.size >= 128) { send(429, { error: 'Too many music sessions; retry after expiry.' }); return; }
        if (id && session) sessions.delete(id);
        const state = randomBytes(32).toString('base64url'); const verifier = randomBytes(64).toString('base64url');
        // Adding listening/playback keeps permissions the user already connected;
        // the new OAuth page still asks them to review any additional access.
        const existingScopes=session?.token?(session.scope??scopes):'';
        const listening=url.searchParams.get('purpose')==='listening';
        const requestedScopes=listening?(existingScopes.split(' ').includes('streaming')?scopes+' user-read-currently-playing':'user-read-currently-playing'):(existingScopes.split(' ').includes('user-read-currently-playing')?scopes+' user-read-currently-playing':scopes);
        const next = put({ scope:requestedScopes, owner: identity ? { subject: identity.user.id, sessionId: identity.user.sessionId, accessToken: identity.token } : undefined, state, verifier, until: now() + 300_000 }); setCookie(res, next, 300);
        const authorization = new URL('https://accounts.spotify.com/authorize');
        authorization.search = new URLSearchParams({ response_type: 'code', client_id: config.clientId!, redirect_uri: redirect, scope: requestedScopes, state, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') }).toString();
        send(200, { url: authorization.href }); return;
      }
      if (path === '/api/music/spotify/callback' && req.method === 'GET') {
        const states = url.searchParams.getAll('state'); const codes = url.searchParams.getAll('code');
        if (!session?.state || session.used || states.length !== 1 || !same(session.state, states[0]) || codes.length !== 1 || !codes[0] || codes[0].length > 2048 || url.searchParams.has('error')) {
          if (id) sessions.delete(id); setCookie(res, '', 0); send(400, { error: 'Authorization denied, expired or invalid. Return to StudyRoom and reconnect.' }); return;
        }
        session.used = true;
        if (deps.auth) {
          try {
            if (!session.owner) throw Error('Missing owner');
            const owner = await authenticate(session.owner.accessToken, deps.auth);
            if (owner.id !== session.owner.subject || owner.sessionId !== session.owner.sessionId) throw Error('Owner changed');
          } catch { sessions.delete(id); setCookie(res, '', 0); send(401, { error: 'Original sign-in session expired or revoked. Sign in and reconnect music.' }); return; }
        }
        const response = await upstream('https://accounts.spotify.com/api/token', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId!, code: codes[0], redirect_uri: redirect, code_verifier: session.verifier! }).toString() });
        const token = await response.json();
        if (!response.ok || token.token_type !== 'Bearer' || typeof token.access_token !== 'string' || !token.access_token || token.access_token.length > 8192 || !Number.isInteger(token.expires_in) || token.expires_in <= 0 || typeof token.scope !== 'string' || !(session.scope??scopes).split(' ').every(s => token.scope.split(' ').includes(s)) || sessions.get(id) !== session || session.until <= now()) {
          sessions.delete(id); setCookie(res, '', 0); send(401, { error: 'Spotify authorization failed or required playback permission was not granted. Reconnect.' }); return;
        }
        if (deps.auth) {
          try { await authenticate(session.owner!.accessToken, deps.auth); }
          catch { sessions.delete(id); setCookie(res, '', 0); send(401, { error: 'Original sign-in session is no longer active.' }); return; }
        }
        sessions.delete(id);
        const lifetime = Math.min(token.expires_in, 3600);
        setCookie(res, put({ owner: session.owner ? { ...session.owner, accessToken: '' } : undefined, scope:session.scope??scopes, token: token.access_token, until: now() + lifetime * 1000 }), lifetime);
        // Refresh tokens are deliberately discarded: reconnect after at most one hour.
        res.writeHead(303, { Location: '/' }); res.end(); return;
      }
      if (path === '/api/music/disconnect' && req.method === 'POST') {
        if(session?.owner)deps.onListening?.(session.owner,null);sessions.delete(id); setCookie(res, '', 0); send(200, { disconnected: true }); return;
      }
      if (!session?.token) { send(401, { error: 'Spotify authorization expired or absent. Reconnect.' }); return; }
      if(['/api/music/spotify/listening','/api/music/spotify/share-listening','/api/music/spotify/hide-listening'].includes(path)){
        const share=path.endsWith('/share-listening'),hide=path.endsWith('/hide-listening');
        if(req.method!==(share||hide?'POST':'GET')){send(405,{error:'Wrong method.'});return;}
        let target:{roomCode:string;participantId:string}|undefined;
        if(share||hide){const value=await readBody(req);if(!identity||!session.owner||!value||Object.keys(value).sort().join('|')!=='participantId|roomCode'||typeof value.roomCode!=='string'||!/^[A-Z0-9]{6}$/.test(value.roomCode)||typeof value.participantId!=='string'||!value.participantId||value.participantId.length>64){send(400,{error:'Choose your current room presence.'});return;}target=value;}
        if(hide){deps.onListening?.(session.owner!,null,target);send(200,{hidden:true});return;}
        if(!(session.scope??scopes).split(' ').includes('user-read-currently-playing')){send(403,{error:'Connect listening status and grant current-track permission.'});return;}
        const response=await upstream('https://api.spotify.com/v1/me/player/currently-playing',{redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${session.token}`}});
        if(response.status===204){if(share)deps.onListening?.(session.owner!,null,target);send(200,{track:null});return;}
        if(!response.ok){if(share)deps.onListening?.(session.owner!,null,target);send(response.status===429?429:502,{error:'Spotify listening status unavailable.'});return;}
        const reader=response.body?.getReader();if(!reader)throw Error('Empty response');let size=0;const chunks:Buffer[]=[];try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>32768)throw Error('Response too large');chunks.push(Buffer.from(part.value));}}finally{await reader.cancel();}
        const value=JSON.parse(Buffer.concat(chunks).toString('utf8')),item=value.item;
        const safeText=(v:unknown,max:number)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
        if(value.currently_playing_type!=='track'||!item||!safeText(item.name,200)||!Array.isArray(item.artists)||!item.artists.length||item.artists.length>10||!item.artists.every((a:any)=>safeText(a?.name,80))||!/^https:\/\/open\.spotify\.com\/track\/[A-Za-z0-9]{22}$/.test(item.external_urls?.spotify??'')||!Number.isInteger(item.duration_ms)||item.duration_ms<1||item.duration_ms>86400000||!Number.isInteger(value.progress_ms)||value.progress_ms<0||value.progress_ms>item.duration_ms||typeof value.is_playing!=='boolean')throw Error('Invalid Spotify track');
        const cover=item.album?.images?.[0]?.url;
        const track:ListeningTrack={title:item.name,artist:item.artists.map((a:any)=>a.name).join(', '),url:item.external_urls.spotify,...(typeof cover==='string'&&/^https:\/\/i\.scdn\.co\/image\/[a-fA-F0-9]{16,100}$/.test(cover)?{coverUrl:cover}:{}),positionMs:value.progress_ms,durationMs:item.duration_ms,observedAt:now(),playing:value.is_playing};
        if(share)deps.onListening?.(session.owner!,track,target);send(200,{track});return;
      }
      if (path === '/api/music/spotify/token' && req.method === 'POST') {
        if(!(session.scope??scopes).includes('streaming')){send(403,{error:'Playback authorization required.'});return;}
        send(200, { access_token: session.token, expiresAt: session.until }); return;
      }
      if (path === '/api/music/spotify/play' && req.method === 'POST') {
        if(!(session.scope??scopes).split(' ').includes('user-modify-playback-state')){send(403,{error:'Playback authorization required.'});return;}
        const body = await readBody(req);
        if (typeof body?.deviceId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.deviceId) || typeof body?.url !== 'string' || !/^https:\/\/open\.spotify\.com\/(track|album|playlist)\/[a-zA-Z0-9]{22}$/.test(body.url)) { send(400, { error: 'Use a selected Spotify track, album or playlist and an SDK device.' }); return; }
        const [, kind, contentId] = new URL(body.url).pathname.split('/'); const uri = `spotify:${kind}:${contentId}`;
        const response = await upstream(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(body.deviceId)}`, { method: 'PUT', redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(kind === 'track' ? { uris: [uri] } : { context_uri: uri }) });
        if (!response.ok) { if (response.status === 401) sessions.delete(id); send(response.status === 429 ? 429 : 502, { error: `Spotify refused playback (${response.status}). Check Premium, app access, device availability and provider limits; reconnect if expired.` }); return; }
        send(200, { requested: true }); return;
      }
      send(404, { error: 'Unknown music endpoint or method.' });
    } catch { send(502, { error: 'Music request failed. No playback confirmed; retry or reconnect.' }); }
  };
  return Object.assign(handle, { close: () => sessions.clear() });
}
