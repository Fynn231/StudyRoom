import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createStudyServer } from '../server/app.js';

test('deadline expiry is authoritative and cannot be resurrected by a late start', async t => {
  // The clock is controlled; the HTTP server and both Socket.IO connections are real.
  let now = 100000;
  const app = createStudyServer(undefined, () => now);
  const url = await app.listen(0);
  const a = io(url, { reconnection: false }), b = io(url, { reconnection: false });
  t.after(async () => { a.disconnect(); b.disconnect(); await app.close(); });
  await Promise.all([a, b].map(s => new Promise<void>(r => s.once('connect', r))));
  const room: any = await a.timeout(1000).emitWithAck('room:create', { name: 'Cedar' });
  await b.timeout(1000).emitWithAck('room:join', { name: 'Fern', code: room.state.code });
  const started: any = await a.timeout(1000).emitWithAck('timer:control', { action: 'start', durationMinutes: 1 });
  assert.equal(started.state.timer.endsAt, 160000);
  now += 10000;
  const repeated: any = await b.timeout(1000).emitWithAck('timer:control', { action: 'start' });
  assert.equal(repeated.state.timer.endsAt, 160000);
  now = 160001;
  const expired: any = await b.timeout(1000).emitWithAck('timer:control', { action: 'start' });
  assert.equal(expired.state.timer.endsAt, null);
  assert.equal(expired.state.timer.remainingMs, 0);
  const reset: any = await a.timeout(1000).emitWithAck('timer:control', { action: 'reset' });
  assert.equal(reset.state.timer.remainingMs, 60000);
});
