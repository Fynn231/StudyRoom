import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { io } from 'socket.io-client';

for (const entry of ['start', 'dev']) {
  test(`actual ${entry} entrypoint serves the UI and two socket clients, then closes`, { timeout: 15000 }, async t => {
    const child = spawn(process.execPath, ['--import', 'tsx', `server/${entry}.ts`], { cwd: process.cwd(), env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stderr.on('data', data => output += data);
    const exited = once(child, 'exit');
    t.after(async () => { child.kill('SIGTERM'); await exited; });
    const url = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`No startup URL: ${output}`)), 10000);
      child.stdout.on('data', data => {
        output += data;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { clearTimeout(timeout); resolve(match[0]); }
      });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Exited ${code}: ${output}`)); });
    });
    assert.match(await (await fetch(url)).text(), /Study Room/);
    const a = io(url, { reconnection: false }), b = io(url, { reconnection: false });
    try {
      await Promise.all([a, b].map(s => new Promise<void>((resolve, reject) => { s.once('connect', resolve); s.once('connect_error', reject); })));
      const room: any = await a.timeout(2000).emitWithAck('room:create', { name: 'Cedar' });
      const joined: any = await b.timeout(2000).emitWithAck('room:join', { name: 'Fern', code: room.state.code });
      assert.equal(joined.state.participants.length, 2);
    } finally { a.disconnect(); b.disconnect(); }
    assert.equal(output.includes('Error:'), false, output);
  });
}
