import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createStudyServer } from '../server/app.js';

export const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
async function setup(t: any) {
  const app = createStudyServer();
  const url = await app.listen(0);
  const clients: Socket[] = [];
  t.after(async () => { clients.forEach(s => s.disconnect()); await app.close(); });
  async function client() {
    const socket = io(url, { forceNew: true, reconnection: false });
    clients.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    return socket;
  }
  return { app, url, client };
}
const request = (s: Socket, event: string, data?: unknown): Promise<any> => s.timeout(1500).emitWithAck(event, data);
async function until(check: () => boolean) {
  for (let i = 0; i < 100; i++) { if (check()) return; await delay(20); }
  assert.fail('state did not arrive');
}

test('two real clients create and join a room with live presence', async t => {
  const { client } = await setup(t);
  const a = await client(), b = await client();
  const created = await request(a, 'room:create', { name: 'Cedar' });
  assert.equal(created.ok, true);
  assert.match(created.state.code, /^[A-Z0-9]{6}$/);
  let latest: any;
  a.on('room:state', s => latest = s);
  const joined = await request(b, 'room:join', { name: 'Fern', code: created.state.code });
  assert.equal(joined.ok, true);
  await until(() => latest?.participants.length === 2);
  assert.deepEqual(latest.participants.map((p: any) => p.name).sort(), ['Cedar', 'Fern']);
});

test('authoritative timer start pause reset stays synchronized between clients', async t => {
  const { client } = await setup(t);
  const a = await client(), b = await client();
  const room = await request(a, 'room:create', { name: 'Cedar' });
  await request(b, 'room:join', { name: 'Fern', code: room.state.code });
  let latest: any;
  b.on('room:state', state => latest = state);
  const started = await request(a, 'timer:control', { action: 'start', durationMinutes: 1 });
  assert.equal(started.ok, true);
  assert.equal(started.state.timer.durationMs, 60000);
  await until(() => latest?.timer.endsAt === started.state.timer.endsAt);
  await delay(60);
  const paused = await request(b, 'timer:control', { action: 'pause' });
  assert.equal(paused.state.timer.endsAt, null);
  assert.ok(paused.state.timer.remainingMs < 60000);
  const resumed = await request(a, 'timer:control', { action: 'start' });
  assert.ok(resumed.state.timer.endsAt > resumed.state.serverNow);
  const reset = await request(b, 'timer:control', { action: 'reset' });
  assert.equal(reset.state.timer.endsAt, null);
  assert.equal(reset.state.timer.remainingMs, 60000);
});

test('disconnect removes presence and rejoin receives current running timer', async t => {
  const { client } = await setup(t);
  const a = await client(), b = await client();
  const created = await request(a, 'room:create', { name: 'Cedar' });
  await request(b, 'room:join', { code: created.state.code, name: 'Fern' });
  const started = await request(a, 'timer:control', { action: 'start' });
  let latest: any;
  a.on('room:state', s => latest = s);
  b.disconnect();
  await until(() => latest?.participants.length === 1);
  const reconnected = new Promise<void>(resolve => b.once('connect', resolve));
  b.connect();
  await reconnected;
  const rejoined = await request(b, 'room:join', { code: created.state.code, name: 'Fern' });
  assert.equal(rejoined.state.timer.endsAt, started.state.timer.endsAt);
  assert.equal(rejoined.state.participants.length, 2);
  const other = await request(b, 'room:create', { name: 'Fern' });
  assert.notEqual(other.state.code, created.state.code);
  await until(() => latest?.participants.length === 1);
});
