import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { io } from 'socket.io-client';
import { createStudyServer } from '../server/app.js';
import { App } from '../src/App.js';
import type { Reply } from '../src/protocol.js';

// Observe real inbound HTTP polling bodies and unmask real inbound WS text frames.
function observeWire(http: ReturnType<typeof createStudyServer>['http'], wire: string[]) {
  http.on('request', req => { if (req.method === 'POST') req.on('data', b => wire.push(b.toString())); });
  http.on('upgrade', (_req, socket) => {
    let pending = Buffer.alloc(0);
    socket.prependListener('data', chunk => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 2) {
        const masked = !!(pending[1] & 128); let length = pending[1] & 127, offset = 2;
        if (length === 126) { if (pending.length < 4) return; length = pending.readUInt16BE(2); offset = 4; }
        if (length === 127) { if (pending.length < 10) return; length = Number(pending.readBigUInt64BE(2)); offset = 10; }
        const end = offset + (masked ? 4 : 0) + length; if (pending.length < end) return;
        const mask = pending.subarray(offset, offset + 4); if (masked) offset += 4;
        const body = Buffer.from(pending.subarray(offset, end)); if (masked) for (let i = 0; i < body.length; i++) body[i] ^= mask[i % 4];
        wire.push(body.toString()); pending = pending.subarray(end);
      }
    });
  });
}

test('real two-client backend: imports/provenance/unshared choice never reach wire, peer or storage; only Share publishes choice', async t => {
  const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, FileReader: dom.window.FileReader, ArrayBuffer: dom.window.ArrayBuffer, IS_REACT_ACT_ENVIRONMENT: true });
  const { render, fireEvent, waitFor, within, cleanup } = await import('@testing-library/react');
  const app = createStudyServer(), wire: string[] = [], peerPackets: unknown[] = [], writes: string[] = [];
  observeWire(app.http, wire); const endpoint = await app.listen(0);
  const peer = io(endpoint, { forceNew: true, reconnection: false });
  const original = dom.window.Storage.prototype.setItem;
  dom.window.Storage.prototype.setItem = function(k, v) { writes.push(`${k}:${v}`); original.call(this, k, v); };
  t.after(async () => { cleanup(); peer.disconnect(); await app.close(); dom.window.close(); });
  await new Promise<void>(r => peer.once('connect', r));
  const created: Reply = await peer.timeout(2000).emitWithAck('room:create', { name: 'Fixture Fern' }); assert.ok(created.ok);
  peer.onAny((...args) => peerPackets.push(args));
  const view = render(<App endpoint={endpoint} />), q = within(view.container);
  fireEvent.click(q.getByRole('button', { name: 'Party' }));
  await waitFor(() => assert.equal((q.getByRole('button', { name: 'Join room' }) as HTMLButtonElement).disabled, false));
  fireEvent.change(q.getByLabelText('Your name'), { target: { value: 'Fixture Moss' } });
  fireEvent.change(q.getByLabelText('Invite code'), { target: { value: created.state.code } });
  fireEvent.click(q.getByRole('button', { name: 'Join room' }));
  await waitFor(() => assert.equal(q.getByLabelText('Room code').textContent, created.state.code));
  fireEvent.click(q.getByRole('button', { name: 'Keep personal clock' }));
  fireEvent.click(q.getByText('Goals / notes', { selector: 'summary' }));
  const file = new dom.window.File(['# Fixture\nRAW_PRIVATE_CONTEXT_Q7\n- [ ] CHOSEN_PRIVATE_TASK_Q7'], 'PRIVATE_FILENAME_Q7.md', { type: 'text/markdown' });
  fireEvent.change(q.getByLabelText('Choose Markdown notes'), { target: { files: [file] } });
  await waitFor(() => assert.ok(q.getByText('CHOSEN_PRIVATE_TASK_Q7', { selector: 'p' })));
  fireEvent.click(q.getByRole('button', { name: 'Build session roadmap' }));
  const roadmap = within(view.container.querySelector<HTMLElement>('.roadmap-panel')!);
  fireEvent.click(roadmap.getByRole('checkbox', { name: 'CHOSEN_PRIVATE_TASK_Q7' }));
  fireEvent.click(roadmap.getByText('Optional: refine this session', { selector: 'summary' }));
  fireEvent.change(roadmap.getByLabelText('How much time do you want to allow?'), { target: { value: '10' } });
  fireEvent.change(roadmap.getByLabelText('Which step should come next?'), { target: { value: 'file-0:line-3:source' } });
  fireEvent.click(roadmap.getByRole('button', { name: 'Apply session choices' }));
  assert.ok(roadmap.getByText('1/1 done'));
  fireEvent.click(roadmap.getByRole('checkbox', { name: 'CHOSEN_PRIVATE_TASK_Q7' }));
  fireEvent.click(q.getByRole('button', { name: 'Use as private intention' }));
  fireEvent.click(q.getByRole('button', { name: 'Clear imported notes' }));
  assert.equal(q.getByRole('timer').textContent, '25:00');
  assert.equal(view.container.querySelectorAll('.goal-source').length, 0);
  await React.act(async () => { await new Promise(r => setTimeout(r, 150)); });
  const before = JSON.stringify({ wire, peerPackets, writes, local: dom.window.localStorage, session: dom.window.sessionStorage });
  for (const token of ['PRIVATE_FILENAME_Q7', 'RAW_PRIVATE_CONTEXT_Q7', 'CHOSEN_PRIVATE_TASK_Q7']) assert.equal(before.includes(token), false, token);
  fireEvent.click(q.getByRole('button', { name: 'Share with room' }));
  await waitFor(() => assert.equal(JSON.stringify(peerPackets).includes('CHOSEN_PRIVATE_TASK_Q7'), true));
  console.log('Observed wire packets:', JSON.stringify(wire));
  assert.equal(wire.some(p => p.includes('intention:share') && p.includes('CHOSEN_PRIVATE_TASK_Q7')), true, 'observer actually sees the app outbound Share');
  for (const token of ['PRIVATE_FILENAME_Q7', 'RAW_PRIVATE_CONTEXT_Q7']) assert.equal(JSON.stringify({ wire, peerPackets, writes }).includes(token), false);
  assert.equal(writes.length, 0);
});
