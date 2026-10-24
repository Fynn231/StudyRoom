import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createStudyServer } from '../server/app.js';

const request = (s: Socket, event: string, data: unknown): Promise<any> => s.timeout(800).emitWithAck(event, data);
async function setup(t: any, limits = {}) {
  let now = 1000;
  const app = createStudyServer(undefined, () => now, undefined, { roomLimits: { emptyTtlMs: 100, ...limits } });
  const url = await app.listen(0), clients: Socket[] = [];
  t.after(async () => { clients.forEach(s => s.disconnect()); await app.close(); });
  const client = async () => {
    const s = io(url, { forceNew: true, reconnection: false }); clients.push(s);
    await new Promise<void>((resolve, reject) => { s.once('connect', resolve); s.once('connect_error', reject); });
    return s;
  };
  return { client, advance: (ms: number) => { now += ms; } };
}

test('local host disconnect never promotes a guest or a same-name replacement; empty expiry remains enforced', async t => {
  const { client, advance } = await setup(t, { maxParticipants: 2 });
  const host = await client(), guest = await client(), third = await client();
  const made = await request(host, 'room:create', { name: 'Host' }), code = made.state.code;
  await request(guest, 'room:join', { code, name: 'Guest' });
  assert.equal((await request(third, 'room:join', { code, name: 'Third' })).ok, false);
  const gone = new Promise<void>(resolve => guest.on('room:state', state => { if (state.hostId === null) resolve(); }));
  host.disconnect(); await gone;
  const replacement = await request(third, 'room:join', { code, name: 'Host', hostId: made.selfId });
  assert.equal(replacement.state.hostId, null);
  assert.equal((await request(third, 'room:lock', { locked: true })).ok, false);
  assert.equal((await request(guest, 'timer:control', { action: 'start' })).ok, true);
  guest.disconnect(); third.disconnect();
  await new Promise(r => setTimeout(r, 30)); advance(100);
  const fresh = await client();
  const expired = await request(fresh, 'room:join', { code, name: 'Late' });
  assert.equal(expired.ok, false); assert.match(expired.error, /not found/i);
});

test('host removes a peer authoritatively; removed peers lose all room mutations and updates', async t => {
  const { client } = await setup(t);
  const host = await client(), guest = await client(), third = await client();
  const created = await request(host, 'room:create', { name: 'Host' });
  const code = created.state.code;
  await request(guest, 'room:join', { code, name: 'Guest' });
  await request(third, 'room:join', { code, name: 'Third' });
  assert.equal((await request(guest, 'room:remove', { participantId: host.id })).ok, false);
  assert.equal((await request(host, 'room:remove', { participantId: host.id })).ok, false);
  assert.equal((await request(host, 'room:remove', { participantId: 'x'.repeat(200) })).ok, false);
  const removed = new Promise<any>(resolve => guest.once('room:removed', resolve));
  const result = await request(host, 'room:remove', { participantId: guest.id });
  assert.equal(result.ok, true); assert.equal(result.state.participants.length, 2);
  assert.deepEqual(await removed, { code, error: 'The host removed you from this room. Your private draft is unchanged. Join again only when invited; removal is not a ban.' });
  for (const [event, payload] of [['timer:control', { action: 'start' }], ['intention:share', { text: 'No membership' }], ['intention:withdraw', {}], ['room:lock', { locked: false }]]) {
    assert.equal((await request(guest, event as string, payload)).ok, false);
  }
  let updates = 0; guest.on('room:state', () => updates++);
  await request(third, 'timer:control', { action: 'start' });
  await new Promise(r => setTimeout(r, 30)); assert.equal(updates, 0);
});

test('creator controls admission; guests cannot lock, everyone can control the clock', async t => {
  const { client } = await setup(t);
  const host = await client(), guest = await client(), newcomer = await client();
  const created = await request(host, 'room:create', { name: 'Host' });
  assert.equal(created.state.hostId, host.id);
  assert.equal(created.state.locked, false);
  assert.equal(created.state.maxParticipants, 16);
  const code = created.state.code;
  await request(guest, 'room:join', { code, name: 'Guest' });
  const denied = await request(guest, 'room:lock', { locked: true });
  assert.equal(denied.ok, false); assert.match(denied.error, /host/i);
  const locked = await request(host, 'room:lock', { locked: true });
  assert.equal(locked.ok, true); assert.equal(locked.state.participants.length, 2);
  const blocked = await request(newcomer, 'room:join', { code, name: 'New' });
  assert.equal(blocked.ok, false); assert.match(blocked.error, /locked/i);
  for (const action of ['start', 'pause', 'reset']) {
    const reply = await request(guest, 'timer:control', { action }); assert.equal(reply.ok, true);
    assert.equal(reply.state.locked, true);
  }
  assert.equal((await request(host, 'room:lock', { locked: 'false' })).ok, false);
  await request(host, 'room:lock', { locked: false });
  assert.equal((await request(newcomer, 'room:join', { code, name: 'New' })).ok, true);
});
