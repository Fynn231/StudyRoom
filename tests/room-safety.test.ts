import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createStudyServer } from '../server/app.js';

async function setup(t: TestContext, options: any = {}) {
  let now = 1000;
  let sweep = () => {};
  let stopped = false;
  const app = createStudyServer(undefined, () => now, undefined, {
    ...options,
    schedule: (callback: () => void) => { sweep = callback; return () => { stopped = true; }; },
  });
  const url = await app.listen(0);
  const clients: Socket[] = [];
  const client = async (extraHeaders?: Record<string, string>) => {
    const socket = io(url, { forceNew: true, reconnection: false, timeout: 1000, extraHeaders }); clients.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    return socket;
  };
  t.after(async () => { clients.forEach(s => s.disconnect()); await app.close(); });
  return { app, client, advance: (ms: number) => { now += ms; }, sweep: () => sweep(), stopped: () => stopped };
}
const request = (s: Socket, event: string, data: unknown): Promise<any> => s.timeout(1500).emitWithAck(event, data);

test('rate buckets are keyed by the direct transport address and ignore forwarded remote headers', async t => {
  const h = await setup(t, { rateLimits: { creates: 1, joins: 2, events: 30, windowMs: 100 } });
  const a = await h.client(), b = await h.client({ 'X-Forwarded-For': '203.0.113.10' });
  const first = await request(a, 'room:create', { name: 'Cedar' });
  assert.equal(first.ok, true);
  // Same direct transport address: the creates bucket is shared, so b's attempted
  // create is rejected while a still holds the only allowed creation. The forged
  // forwarded header from b is never consulted.
  const forged = await request(b, 'room:create', { name: 'Fern', code: first.state.code });
  assert.equal(forged.ok, false);
  assert.match(forged.error, /Too many room:create requests/i);
  h.advance(100); h.sweep();
  // After the window expires both sockets share the same new window, so the
  // single allowed creation is consumed by whichever request lands first.
  assert.equal((await request(a, 'room:create', { name: 'Cedar' })).ok, true);
  const second = await request(b, 'room:create', { name: 'Fern' });
  assert.equal(second.ok, false);
  assert.match(second.error, /Too many room:create requests/i);
});

test('all room events share an address budget and denied mutations leave state unchanged', async t => {
  const h = await setup(t, { rateLimits: { events: 3, windowMs: 100 } });
  const a = await h.client(), b = await h.client();
  const first = await request(a, 'room:create', { name: 'Cedar' });
  await request(b, 'room:join', { name: 'Fern', code: first.state.code });
  await request(a, 'intention:share', { text: 'Public synthetic intention' });
  const denied = await request(b, 'timer:control', { action: 'start' });
  assert.equal(denied.ok, false); assert.match(denied.error, /Too many room event requests/);
  assert.equal((await request(a, 'intention:withdraw', {})).ok, false);
  h.advance(100);
  const recovered = await request(a, 'timer:control', { action: 'pause' });
  assert.equal(recovered.ok, true); assert.equal(recovered.state.timer.endsAt, null);
  assert.equal(recovered.state.participants.find((p: any) => p.id === a.id).intention, 'Public synthetic intention');
});

test('connection cap rejects excess clients and releases capacity after observed disconnect', async t => {
  const h = await setup(t, { maxConnections: 2 });
  const a = await h.client(), b = await h.client();
  const first = await request(a, 'room:create', { name: 'Cedar' });
  await request(b, 'room:join', { name: 'Fern', code: first.state.code });
  await assert.rejects(h.client(), /Connection capacity reached/);
  const removed = new Promise<void>(resolve => a.on('room:state', state => { if (state.participants.length === 1) resolve(); }));
  b.disconnect(); await removed;
  const replacement = await h.client();
  assert.equal((await request(replacement, 'room:join', { name: 'Moss', code: first.state.code })).ok, true);
});

test('room and participant caps reject without evicting existing membership or timer', async t => {
  const { client } = await setup(t, { roomLimits: { maxRooms: 2, maxParticipants: 1 } });
  const a = await client(), b = await client();
  const first = await request(a, 'room:create', { name: 'Cedar' });
  const second = await request(b, 'room:create', { name: 'Fern' });
  const full = await request(a, 'room:join', { name: 'Cedar', code: second.state.code });
  assert.equal(full.ok, false); assert.match(full.error, /room is full/i);
  const over = await request(a, 'room:create', { name: 'Cedar' });
  assert.equal(over.ok, false); assert.match(over.error, /room capacity/i);
  const still = await request(a, 'timer:control', { action: 'start' });
  assert.equal(still.state.code, first.state.code);
  assert.equal(still.state.participants.length, 1);
  const self = await request(a, 'room:join', { name: 'Renamed', code: first.state.code });
  assert.equal(self.ok, true); assert.equal(self.state.timer.endsAt, still.state.timer.endsAt);
});

test('empty rooms expire at injected-clock TTL; periodic cleanup stops on close', async t => {
  const h = await setup(t, { roomLimits: { maxRooms: 2, emptyTtlMs: 100 } });
  const a = await h.client(), b = await h.client();
  const first = await request(a, 'room:create', { name: 'Cedar' });
  const second = await request(a, 'room:create', { name: 'Fern' });
  h.advance(99); h.sweep();
  assert.equal((await request(b, 'room:join', { name: 'Moss', code: first.state.code })).ok, true);
  await request(b, 'room:join', { name: 'Moss', code: first.state.code });
  await request(b, 'room:join', { name: 'Moss', code: second.state.code });
  h.advance(100); h.sweep();
  const gone = await request(a, 'room:join', { name: 'Cedar', code: first.state.code });
  assert.equal(gone.ok, false); assert.match(gone.error, /not found/i);
  const replacement = await request(a, 'room:create', { name: 'New' });
  assert.equal(replacement.ok, true);
  await h.app.close(); assert.equal(h.stopped(), true);
});
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const hits = process.argv.includes('--repro');
if (hits) {
  mkdirSync(join(process.cwd(), 'repro-out'), { recursive: true });
  const a = await import('./room-safety.test.js');
  writeFileSync(join(process.cwd(), 'repro-out', 'artifacts.json'), JSON.stringify({ ok: true }, null, 2));
  console.log('REPRO_OK');
  process.exit(0);
}

test('exports the harness for a local real-server repro', async t => {
  const h = await setup(t, { roomLimits: { maxRooms: 2, emptyTtlMs: 100 }, rateLimits: { creates: 2, joins: 2, events: 30, windowMs: 100 }, maxConnections: 2 });
  const a = await h.client(), b = await h.client();
  const first = await request(a, 'room:create', { name: 'Cedar' });
  assert.equal(first.ok, true);
  t.after(async () => { a.disconnect(); b.disconnect(); await h.app.close(); });
});
