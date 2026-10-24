import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { App } from '../src/App.js';
import type { RoomState } from '../src/protocol.js';

for (const scenario of ['success', 'rejected', 'late ack after preview']) test(`room chime: ${scenario}; joins, remote changes and disabled actions are silent`, async t => {
  const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost' }); let tones = 0;
  class Audio {
    currentTime = 0; destination = {}; async resume() {} async close() {}
    createGain() { return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    createOscillator() { return { frequency: { setValueAtTime() {} }, start() { tones++; }, stop() {}, connect() {}, disconnect() {}, onended: null }; }
  }
  Object.assign(dom.window, { AudioContext: Audio });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { render, fireEvent, waitFor, within, cleanup } = await import('@testing-library/react');
  const http = createServer(), io = new Server(http); await new Promise<void>(r => http.listen(0, '127.0.0.1', r));
  let ack!: (value: unknown) => void;
  const state: RoomState = { code: 'ABC123', participants: [], timer: { durationMs: 1500000, remainingMs: 1500000, endsAt: null }, serverNow: Date.now() };
  io.on('connection', s => {
    s.on('room:create', (_d, reply) => reply({ ok: true, state, selfId: s.id }));
    s.on('timer:control', (_d, reply) => { ack = reply; });
  });
  t.after(async () => { cleanup(); await new Promise<void>(r => io.close(() => r())); dom.window.close(); });
  const view = render(<App endpoint={`http://127.0.0.1:${(http.address() as any).port}`} />), q = within(view.container);
  fireEvent.click(q.getByRole('button', { name: 'Party' }));
  await waitFor(() => assert.equal((q.getByRole('button', { name: 'Create room' }) as HTMLButtonElement).disabled, false));
  fireEvent.change(q.getByLabelText('Your name'), { target: { value: 'Fixture' } });
  fireEvent.click(q.getByRole('button', { name: 'Create room' }));
  await waitFor(() => assert.equal(q.getByLabelText('Room code').textContent, 'ABC123'));
  fireEvent.click(q.getByRole('button', { name: 'Start focus' })); assert.equal(tones, 0);
  fireEvent.click(q.getByRole('button', { name: 'Join room cycle' }));
  await React.act(async () => { io.emit('room:state', { ...state, timer: { ...state.timer, endsAt: Date.now() + 1500000 } }); await new Promise(r => setTimeout(r, 30)); });
  assert.equal(tones, 0, 'remote start silent');
  await React.act(async () => { io.emit('room:state', state); await new Promise(r => setTimeout(r, 30)); });
  fireEvent.click(q.getByRole('button', { name: 'Start focus' }));
  await waitFor(() => assert.equal(typeof ack, 'function'));
  assert.equal(tones, 0, 'no sound before successful ack');
  if (scenario === 'late ack after preview') await React.act(async () => fireEvent.click(q.getByRole('button', { name: 'Preview chime' })));
  await React.act(async () => { ack(scenario === 'rejected' ? { ok: false, error: 'Fixture denied' } : { ok: true, state: { ...state, timer: { ...state.timer, endsAt: Date.now() + 1500000 } }, selfId: 'fixture' }); await new Promise(r => setTimeout(r, 30)); });
  assert.equal(tones, scenario === 'rejected' ? 0 : 3, 'only own accepted start or explicit preview, no stale duplicate');
  if (scenario === 'success') {
    await React.act(async () => { io.disconnectSockets(true); await new Promise(r => setTimeout(r, 30)); });
    assert.equal(tones, 3, 'disconnect is silent');
  }
});
