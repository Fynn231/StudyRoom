import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createStudyServer } from '../server/app.js';

test('intentions are opt in and withdrawal removes only the callers intention, with room isolation', async t => {
  const app = createStudyServer();
  const url = await app.listen(0);
  const sockets: Socket[] = [];
  t.after(async () => { sockets.forEach(s => s.disconnect()); await app.close(); });
  async function client() {
    const s = io(url, { forceNew: true, reconnection: false }); sockets.push(s);
    await new Promise<void>(r => s.once('connect', r)); return s;
  }
  const a = await client(), b = await client(), c = await client();
  const req = (s: Socket, event: string, data: any): Promise<any> => s.timeout(1000).emitWithAck(event, data);
  const room = await req(a, 'room:create', { name: 'Cedar', intention: 'PRIVATE SYNTHETIC DRAFT' });
  assert.equal(JSON.stringify(room).includes('PRIVATE SYNTHETIC DRAFT'), false);
  await req(b, 'room:join', { name: 'Fern', code: room.state.code });
  const isolated = await req(c, 'room:create', { name: 'Moss' });
  let foreignEvents = 0; c.on('room:state', () => foreignEvents++);
  const shareA = await req(a, 'intention:share', { text: 'Read synthetic chapter', participantId: b.id });
  assert.equal(shareA.ok, true);
  await req(b, 'intention:share', { text: 'Write synthetic notes' });
  const withdrawn = await req(a, 'intention:withdraw', { participantId: b.id });
  assert.equal(withdrawn.state.participants.find((p: any) => p.id === a.id).intention, undefined);
  assert.equal(withdrawn.state.participants.find((p: any) => p.id === b.id).intention, 'Write synthetic notes');
  await req(a, 'timer:control', { action: 'start' });
  await new Promise(r => setTimeout(r, 40));
  assert.equal(foreignEvents, 0);
  assert.equal(isolated.state.timer.endsAt, null);
});
