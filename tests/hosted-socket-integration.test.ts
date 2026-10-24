import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { createStudyServer } from '../server/app.js';

// Synthetic signing authority and liveness responses, real TCP/WebSocket transport.
// This does not certify a real Supabase project or provider consent.
test('real hosted sockets require authentic live sessions, permit room events, reject revoked events and expire idle peers', async () => {
  const names = ['STUDY_PROXY_POLICY', 'STUDY_DEPLOYMENT_MODE', 'STUDY_PUBLIC_ORIGIN', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const previous = names.map(name => process.env[name]);
  const origin = 'https://synthetic-study.example';
  const provider = 'https://synthetic-socket-provider.invalid';
  Object.assign(process.env, { STUDY_PROXY_POLICY: 'render', STUDY_DEPLOYMENT_MODE: 'hosted', STUDY_PUBLIC_ORIGIN: origin, SUPABASE_URL: provider, SUPABASE_ANON_KEY: 'sb_publishable_synthetic_socket_transport' });
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  function token(sub: string, seconds = 60) {
    const body = `${encode({ alg: 'ES256', kid: 'fixture' })}.${encode({ sub, role: 'authenticated', aud: 'authenticated', iss: `${provider}/auth/v1`, session_id: `session-${sub}`, exp: Math.floor(Date.now() / 1000) + seconds })}`;
    return `${body}.${sign('sha256', Buffer.from(body), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
  }
  const originalFetch = globalThis.fetch;
  const revoked = new Set<string>();
  globalThis.fetch = async (input, init) => {
    if (String(input) === `${provider}/auth/v1/.well-known/jwks.json`) return Response.json({ keys: [{ ...pair.publicKey.export({ format: 'jwk' }), alg: 'ES256', kid: 'fixture' }] });
    if (String(input) === `${provider}/rest/v1/rpc/studyroom_session_active`) {
      const jwt = new Headers(init?.headers).get('authorization')!.slice(7);
      const claims = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
      return Response.json(!revoked.has(claims.sub));
    }
    throw Error('Unexpected synthetic provider request');
  };
  const app = createStudyServer();
  const sockets: Socket[] = [];
  try {
    const endpoint = await app.listen(0);
    function connect(jwt?: string) {
      const socket = io(endpoint, { transports: ['websocket'], reconnection: false, timeout: 2500, autoConnect: false, extraHeaders: { Host: new URL(origin).host, Origin: origin }, auth: jwt ? { token: jwt } : {} });
      sockets.push(socket);
      return new Promise<Socket>((resolve, reject) => {
        socket.once('connect', () => resolve(socket));
        socket.once('connect_error', reject);
        socket.connect();
      });
    }
    await assert.rejects(connect(), /Sign in required/);
    await assert.rejects(connect('malformed'), /Session expired/);
    await assert.rejects(connect(token('already-expired', -1)), /Session expired/);
    const peer = await connect(token('owner'));
    const created = await peer.timeout(2500).emitWithAck('room:create', { name: 'Synthetic Owner' });
    assert.equal(created.ok, true);
    assert.equal(created.state.participants[0].name, 'Synthetic Owner');
    const guest = await connect(token('guest'));
    const code = created.state.code;
    assert.equal((await guest.timeout(2500).emitWithAck('room:join', { code, name: 'Owner', owner: 'owner' })).ok, true);
    const denied = await guest.timeout(2500).emitWithAck('room:lock', { locked: true, owner: 'owner', hostId: peer.id });
    assert.equal(denied.ok, false);
    assert.equal((await peer.timeout(2500).emitWithAck('room:lock', { locked: true })).ok, true);
    const hostGone = new Promise<void>(resolve => guest.on('room:state', state => { if (state.hostId === null) resolve(); }));
    peer.disconnect(); await hostGone;
    assert.equal((await guest.timeout(2500).emitWithAck('room:lock', { locked: false })).ok, false);
    const restored = await connect(token('owner'));
    const rejoined = await restored.timeout(2500).emitWithAck('room:join', { code, name: 'Owner reconnected' });
    assert.equal(rejoined.ok, true); assert.equal(rejoined.state.hostId, restored.id); assert.equal(rejoined.state.locked, true);
    const safe = JSON.stringify(rejoined);
    assert.equal(safe.includes('session-owner'), false); assert.equal(safe.includes('sb_publishable'), false);
    assert.equal((await restored.timeout(2500).emitWithAck('room:lock', { locked: false })).ok, true);
    assert.equal((await restored.timeout(2500).emitWithAck('room:remove', { participantId: guest.id })).ok, true);
    assert.equal((await guest.timeout(2500).emitWithAck('timer:control', { action: 'start' })).ok, false);
    const disconnect = new Promise<string>(resolve => restored.once('disconnect', resolve));
    revoked.add('owner');
    restored.emit('intention:share', { text: 'Must never be published after revocation' });
    assert.equal(await disconnect, 'io server disconnect');
    assert.equal(restored.connected, false);
    await assert.rejects(connect(token('owner')), /Session expired/);
    const short = await connect(token('idle-expiring', 2));
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Idle socket did not expire')), 3500);
      short.once('disconnect', () => { clearTimeout(timer); resolve(); });
    });
    assert.equal(short.connected, false);
  } finally {
    sockets.forEach(socket => socket.disconnect());
    await app.close();
    globalThis.fetch = originalFetch;
    names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; });
  }
});
