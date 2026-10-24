import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createStudyServer } from '../server/app.js';

test('loopback handshake accepts same-origin clients and rejects hostile Origin for polling and websocket', async t => {
  const app = createStudyServer(); const url = await app.listen(0);
  t.after(() => app.close());
  for (const transport of ['polling', 'websocket']) {
    for (const origin of [url, url.replace('127.0.0.1', 'localhost'), 'https://hostile.example', 'null', `${url}.hostile.example`]) {
      const socket = io(url, { forceNew: true, reconnection: false, timeout: 1000, transports: [transport], extraHeaders: { Origin: origin } });
      const accepted = await new Promise<boolean>(resolve => { socket.once('connect', () => resolve(true)); socket.once('connect_error', () => resolve(false)); });
      socket.disconnect();
      assert.equal(accepted, origin === url || origin === url.replace('127.0.0.1', 'localhost'), `${transport}: ${origin}`);
    }
  }
  const rejected = await fetch(url, { headers: { Origin: 'https://hostile.example' } });
  assert.equal(rejected.status, 403);
  // Node fetch normalizes Host; raw HTTP is needed to exercise this guard.
  const { get } = await import('node:http');
  const status = await new Promise<number | undefined>((resolve, reject) => {
    get(url, { headers: { Host: 'hostile.example' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(status, 403);
});
