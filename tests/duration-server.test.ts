import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createStudyServer } from '../server/app.js';

test('arbitrary shared minutes are bounded and stale duration changes cannot replace a running or paused cycle', async t => {
  let now = 1000;
  const app = createStudyServer(undefined, () => now), url = await app.listen(0);
  const a = io(url, { reconnection: false });
  t.after(async () => { a.disconnect(); await app.close(); });
  await new Promise<void>(r => a.once('connect', r));
  const req = (data: object): Promise<any> => a.timeout(1000).emitWithAck('timer:control', data);
  await a.timeout(1000).emitWithAck('room:create', { name: 'Synthetic duration' });
  const started = await req({ action: 'start', durationMinutes: 37 });
  assert.equal(started.ok, true); assert.equal(started.state.timer.durationMs, 2220000);
  now += 1000;
  assert.equal((await req({ action: 'start', durationMinutes: 81 })).ok, false, 'stale fresh-start payload cannot overwrite a running shared cycle');
  const paused = await req({ action: 'pause' });
  assert.equal(paused.state.timer.durationMs, 2220000); assert.equal(paused.state.timer.remainingMs, 2219000);
  assert.equal((await req({ action: 'start', durationMinutes: 81 })).ok, false, 'paused cycles retain duration until explicit reset');
  const resumed = await req({ action: 'start' });
  assert.equal(resumed.state.timer.durationMs, 2220000); assert.equal(resumed.state.timer.endsAt, now + 2219000);
  await req({ action: 'reset' });
  const fresh = await req({ action: 'start', durationMinutes: 180 });
  assert.equal(fresh.ok, true); assert.equal(fresh.state.timer.durationMs, 10800000);
});
