import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createStudyServer } from '../server/app.js';

test('malformed requests are rejected without crashes or room mutations', async t => {
  const app = createStudyServer(); const url = await app.listen(0);
  const a = io(url, { reconnection: false }), b = io(url, { reconnection: false });
  t.after(async () => { a.disconnect(); b.disconnect(); await app.close(); });
  await Promise.all([a, b].map(s => new Promise<void>(r => s.once('connect', r))));
  const req = (s: Socket, event: string, data: any): Promise<any> => s.timeout(1000).emitWithAck(event, data);
  for (const name of ['', '   ', 'x'.repeat(33), 8, null, 'bad\nname']) {
    assert.equal((await req(a, 'room:create', { name })).ok, false, `name ${JSON.stringify(name)}`);
  }
  for (const data of [null, [], 1, 'x', {}]) assert.equal((await req(a, 'room:create', data)).ok, false);
  assert.equal((await req(b, 'timer:control', { action: 'start' })).ok, false);
  const room = await req(a, 'room:create', { name: ' Cedar ' });
  assert.equal(room.state.participants[0].name, 'Cedar');
  await req(b, 'room:join', { name: 'Fern', code: room.state.code });
  for (const durationMinutes of [0, -1, 1.2, 181, '25', null, {}, Infinity]) {
    assert.equal((await req(b, 'timer:control', { action: 'start', durationMinutes })).ok, false);
  }
  for (const data of [null, [], {}, { action: 'explode' }, { action: 'reset', durationMinutes: 25 }]) {
    assert.equal((await req(a, 'timer:control', data)).ok, false);
  }
  for (const text of ['', '   ', 'x'.repeat(241), 5, null, 'bad\u0000text']) {
    assert.equal((await req(a, 'intention:share', { text })).ok, false);
  }
  for (const code of [null, 1, '', 'AAAAAAZ', '<script>', 'ZZZZZZ']) {
    assert.equal((await req(b, 'room:join', { name: 'Fern', code })).ok, false);
  }
  // Invalid no-ack packets must never throw; valid packets still work afterwards.
  a.emit('room:create', null); a.emit('timer:control', null); a.emit('intention:share', null);
  a.emit('room:create', null, 'not a callback');
  const state = await req(a, 'timer:control', { action: 'pause' });
  assert.equal(state.ok, true);
  assert.equal(state.state.timer.durationMs, 1500000);
  assert.equal(state.state.participants.length, 2);
});
