import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStudyServer } from '../server/app.js';
import { createServer, type RequestListener } from 'node:http';
import { createHash } from 'node:crypto';
import { createMusicHandler } from '../server/music.js';

// Synthetic provider protocol only: never evidence of real Spotify authorization/playback.
async function protocol(t: { after: (fn: () => unknown) => void }, upstream: typeof fetch, clock = Date.now) {
  let handler: RequestListener;
  const server = createServer((req, res) => handler(req, res));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  handler = createMusicHandler({ clientId: 'a'.repeat(32), origin }, { fetch: upstream, now: clock });
  const post = (path: string, cookie = '', body?: unknown) => fetch(origin + path, { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const begin = async () => {
    const response = await post('/api/music/spotify/begin');
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    assert.match(response.headers.get('set-cookie')!, /HttpOnly; SameSite=Lax/);
    const url = new URL((await response.json()).url);
    return { cookie, url, state: url.searchParams.get('state')! };
  };
  return { origin, post, begin };
}

test('synthetic playback validates input, pins upstream, requires origin, and handles provider failures', async t => {
  let playbackStatus = 204; let plays = 0;
  const p = await protocol(t, (async (input, init) => {
    if (String(input).includes('/api/token')) return Response.json({ access_token: 'SYNTHETIC_ACCESS', token_type: 'Bearer', expires_in: 60, scope: 'streaming user-read-email user-read-private user-modify-playback-state' });
    assert.equal(String(input).startsWith('https://api.spotify.com/v1/me/player/play?device_id='), true);
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer SYNTHETIC_ACCESS');
    assert.deepEqual(JSON.parse(init?.body as string), { uris: ['spotify:track:0123456789ABCDEFGHIJKL'] }); plays++;
    return new Response(null, { status: playbackStatus });
  }) as typeof fetch);
  const b = await p.begin();
  assert.equal((await fetch(p.origin + '/api/music/spotify/token', { method: 'POST' })).status, 403);
  const callback = await fetch(`${p.origin}/api/music/spotify/callback?state=${b.state}&code=synthetic`, { headers: { Cookie: b.cookie }, redirect: 'manual' });
  const cookie = callback.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await p.post('/api/music/spotify/play', cookie, { deviceId: 'device', url: 'https://evil.test/track/x' })).status, 400);
  assert.equal(plays, 0);
  const body = { deviceId: 'device', url: 'https://open.spotify.com/track/0123456789ABCDEFGHIJKL' };
  assert.deepEqual(await (await p.post('/api/music/spotify/play', cookie, body)).json(), { requested: true });
  playbackStatus = 403;
  assert.equal((await p.post('/api/music/spotify/play', cookie, body)).status, 502);
  await p.post('/api/music/disconnect', cookie);
  assert.equal((await p.post('/api/music/spotify/token', cookie)).status, 401);
});

test('synthetic OAuth rejects cross-browser, duplicate and expired state without token exchange', async t => {
  let now = 0; let exchanges = 0;
  const p = await protocol(t, (async () => { exchanges++; throw Error('must not exchange'); }) as typeof fetch, () => now);
  for (const kind of ['missing-cookie', 'duplicate-state', 'expired', 'denied']) {
    const b = await p.begin();
    if (kind === 'expired') now += 301_000;
    const url = `${p.origin}/api/music/spotify/callback?state=${b.state}&code=synthetic${kind === 'duplicate-state' ? '&state=another' : ''}${kind === 'denied' ? '&error=access_denied' : ''}`;
    assert.equal((await fetch(url, { headers: { Cookie: kind === 'missing-cookie' ? '' : b.cookie }, redirect: 'manual' })).status, 400);
  }
  assert.equal(exchanges, 0);
}
);

test('synthetic PKCE binds cookie/state, exchanges once, keeps refresh tokens out, expires and disconnects', async t => {
  let now = 1_000_000; let exchanges = 0; let verifier = '';
  const p = await protocol(t, (async (input, init) => {
    assert.equal(String(input), 'https://accounts.spotify.com/api/token'); exchanges++;
    const body = new URLSearchParams(init?.body as string); verifier = body.get('code_verifier')!;
    assert.equal(body.get('client_secret'), null);
    return Response.json({ access_token: 'SYNTHETIC_ACCESS', refresh_token: 'SYNTHETIC_REFRESH', token_type: 'Bearer', expires_in: 60, scope: 'streaming user-read-email user-read-private user-modify-playback-state' });
  }) as typeof fetch, () => now);
  const b = await p.begin();
  assert.equal(b.url.origin, 'https://accounts.spotify.com');
  assert.equal(b.url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(b.url.searchParams.get('redirect_uri'), p.origin + '/api/music/spotify/callback');
  const bad = await fetch(`${p.origin}/api/music/spotify/callback?code=synthetic&state=wrong`, { headers: { Cookie: b.cookie }, redirect: 'manual' });
  assert.equal(bad.status, 400); assert.equal(exchanges, 0);
  const fresh = await p.begin();
  const callback = `${p.origin}/api/music/spotify/callback?code=synthetic&state=${fresh.state}`;
  const ok = await fetch(callback, { headers: { Cookie: fresh.cookie }, redirect: 'manual' });
  assert.equal(ok.status, 303); assert.equal(ok.headers.get('location'), '/');
  const cookie = ok.headers.get('set-cookie')!.split(';')[0];
  assert.notEqual(cookie, fresh.cookie, 'rotate session on authorization');
  assert.equal(createHash('sha256').update(verifier).digest('base64url'), fresh.url.searchParams.get('code_challenge'));
  assert.equal((await fetch(callback, { headers: { Cookie: fresh.cookie }, redirect: 'manual' })).status, 400);
  const token = await p.post('/api/music/spotify/token', cookie);
  assert.equal((await token.json()).access_token, 'SYNTHETIC_ACCESS');
  const status = await (await fetch(p.origin + '/api/music/status', { headers: { Cookie: cookie } })).json();
  assert.equal(status.spotify.authorized, true); assert.equal(JSON.stringify(status).includes('SYNTHETIC'), false);
  now += 61_000;
  assert.equal((await p.post('/api/music/spotify/token', cookie)).status, 401);
  await p.post('/api/music/disconnect', cookie);
  assert.equal((await p.post('/api/music/spotify/token', cookie)).status, 401);
});

test('connected music fails closed without registration while embeds remain independent', async t => {
  const app = createStudyServer(); const origin = await app.listen(0); t.after(() => app.close());
  const response = await fetch(`${origin}/api/music/status`);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  const status = await response.json();
  assert.equal(status.spotify.ready, false);
  assert.equal(status.spotify.authorized, false);
  assert.equal(status.apple.ready, false);
  assert.match(status.spotify.blocker, /SPOTIFY_CLIENT_ID/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const begin = await fetch(`${origin}/api/music/spotify/begin`, { method: 'POST', headers: { Origin: origin } });
  assert.equal(begin.status, 503);
});
