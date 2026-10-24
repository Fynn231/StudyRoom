import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyAccessToken } from '../server/auth.js';
const config = { supabaseUrl: 'https://synthetic.invalid', anonKey: 'sb_publishable_synthetic', publicOrigin: 'https://study.example' };
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
function token(extra = {}) { const data = `${encode({ alg: 'ES256', kid: 'synthetic' })}.${encode({ sub: 'user-one', aud: 'authenticated', iss: `${config.supabaseUrl}/auth/v1`, exp: Math.floor(Date.now()/1000)+60, ...extra })}`; return `${data}.${sign('sha256', Buffer.from(data), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`; }
test('synthetic signed ES256 verifies; malformed signatures and wrong claims reject', async () => {
 const original = globalThis.fetch;
 globalThis.fetch = async () => Response.json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'synthetic', alg: 'ES256' }] });
 try {
  assert.equal((await verifyAccessToken(token(), config)).id, 'user-one');
  for (const claims of [{aud:'wrong'}, {iss:'wrong'}, {sub:''}, {exp:0}]) await assert.rejects(verifyAccessToken(token(claims), config));
  await assert.rejects(verifyAccessToken(token().slice(0,-8)+'AAAAAAAA', config));
  await assert.rejects(verifyAccessToken('not-a-token', config));
 } finally { globalThis.fetch = original; }
});

test('synthetic authenticated RPC proves liveness and rejects revocation, missing installation and outages', async () => {
 const { requireLiveSession } = await import('../server/auth.js');
 const original = globalThis.fetch;
 let status = 200; let live: unknown = true; let calls = 0;
 globalThis.fetch = async (input, init) => {
  calls++;
  assert.equal(String(input), config.supabaseUrl + '/rest/v1/rpc/studyroom_session_active');
  assert.equal(init?.method, 'POST');
  assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer SYNTHETIC_TOKEN');
  assert.equal(new Headers(init?.headers).get('apikey'), config.anonKey);
  assert.equal(init?.body, '{}');
  return Response.json(live, {status});
 };
 try {
  await requireLiveSession('SYNTHETIC_TOKEN', config); assert.equal(calls, 1);
  for (const value of [false, null, {}, 'true']) { live = value; await assert.rejects(requireLiveSession('SYNTHETIC_TOKEN', config)); }
  status = 404; await assert.rejects(requireLiveSession('SYNTHETIC_TOKEN', config), /session|setup|RPC/i);
  globalThis.fetch = async () => { throw Error('synthetic outage'); };
  await assert.rejects(requireLiveSession('SYNTHETIC_TOKEN', config));
 } finally { globalThis.fetch = original; }
});

test('synthetic key rotation and remote getUser fallback never trust decoded claims alone', async () => {
 const original = globalThis.fetch;
 const second = generateKeyPairSync('rsa', { modulusLength: 2048 });
 const payload = { sub:'user-one', aud:'authenticated', iss:config.supabaseUrl+'/auth/v1', exp:Math.floor(Date.now()/1000)+60 };
 const raw = `${encode({alg:'RS256',kid:'rotated'})}.${encode(payload)}`;
 const rotated = `${raw}.${sign('sha256',Buffer.from(raw),second.privateKey).toString('base64url')}`;
 let keys: unknown[] = [{...publicKey.export({format:'jwk'}),kid:'synthetic',alg:'ES256'}]; let userCalls=0; let remoteOK=true;
 globalThis.fetch = async input => {
  if(String(input).endsWith('/.well-known/jwks.json')) return Response.json({keys});
  assert.equal(String(input), config.supabaseUrl+'/auth/v1/user'); userCalls++;
  return Response.json(remoteOK ? {id:'user-one'} : {message:'invalid JWT'}, {status:remoteOK ? 200:401});
 };
 try {
  await verifyAccessToken(token(),config);
  keys=[{...second.publicKey.export({format:'jwk'}),kid:'rotated',alg:'RS256'}];
  await verifyAccessToken(rotated,config); assert.equal(userCalls,0);
  keys=[]; await verifyAccessToken(rotated,config); assert.equal(userCalls,1,'removed key must not use stale process cache');
  remoteOK=false; await assert.rejects(verifyAccessToken(rotated,config));
  for(const alg of ['none','HS512','garbage']) await assert.rejects(verifyAccessToken(`${encode({alg})}.${encode(payload)}.AAAA`,config));
 } finally {globalThis.fetch=original;}
});
