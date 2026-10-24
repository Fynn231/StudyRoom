import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { io } from 'socket.io-client';
import { createStudyServer } from '../server/app.js';
import { App } from '../src/App.js';
import type { Reply } from '../src/protocol.js';

test('real Party peers retain independent full-page appearance with no broadcasts, membership changes or URL disclosure', async t => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { render, fireEvent, within, waitFor, cleanup } = await import('@testing-library/react');
  const server = createStudyServer(); const endpoint = await server.listen(0);
  const peer = io(endpoint, { forceNew: true, reconnection: false });
  t.after(async () => { cleanup(); peer.disconnect(); await server.close(); dom.window.close(); });
  await new Promise<void>((resolve, reject) => { peer.once('connect', resolve); peer.once('connect_error', reject); });
  const created: Reply = await peer.timeout(2000).emitWithAck('room:create', { name: 'Synthetic peer' });
  assert.ok(created.ok);
  const view = render(<App endpoint={endpoint} />), other = render(<App endpoint={endpoint} />);
  const q = within(view.container), r = within(other.container);
  for (const target of [q, r]) {
    fireEvent.click(target.getByRole('button', { name: 'Party' }));
    await waitFor(() => assert.equal((target.getByRole('button', { name: 'Join room' }) as HTMLButtonElement).disabled, false), { timeout: 5000 });
    fireEvent.change(target.getByLabelText('Your name'), { target: { value: target === q ? 'Synthetic first' : 'Synthetic second' } });
    fireEvent.change(target.getByLabelText('Invite code'), { target: { value: created.state.code } });
    fireEvent.click(target.getByRole('button', { name: 'Join room' }));
    await waitFor(() => assert.equal(target.getByLabelText('Room code').textContent, created.state.code));
    fireEvent.click(target.getByRole('button', { name: 'Keep personal clock' }));
  }
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
  const packets: unknown[] = [];
  peer.onAny((...args) => packets.push(args));
  const before = await peer.timeout(2000).emitWithAck('timer:control', { action: 'pause' }) as Reply;
  assert.ok(before.ok);
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
  packets.length = 0;
  const otherBackground = other.container.querySelector<HTMLElement>('.room-backdrop')!.style.background;
  const peerTimer = r.getByRole('timer');
  fireEvent.click(q.getByText('Appearance', { selector: 'summary' }));
  for (const name of ['Sage', 'Peach Glow', 'Lavender Mist', 'Ocean Haze']) fireEvent.click(q.getByRole('button', { name }));
  fireEvent.click(q.getByRole('button', { name: 'Juliette' }));
  fireEvent.click(q.getByLabelText('Falling flowers'));
  fireEvent.click(q.getByLabelText('Falling flowers'));
  for (const [name, toggle] of [['Moon Garden', 'Drifting moonlight'], ['Autumn Letters', 'Falling leaves']]) {
    fireEvent.click(q.getByRole('button', { name }));
    fireEvent.click(q.getByLabelText(toggle));
    fireEvent.click(q.getByLabelText(toggle));
  }
  fireEvent.change(q.getByLabelText('First custom HEX'), { target: { value: 'url(unsafe)' } });
  fireEvent.change(q.getByLabelText('First custom HEX'), { target: { value: '#001122' } });
  fireEvent.input(q.getByLabelText('First custom color'), { target: { value: '#123456' } });
  fireEvent.input(q.getByLabelText('Second custom color'), { target: { value: '#abcdef' } });
  assert.notEqual(view.container.querySelector<HTMLElement>('.room-backdrop')!.style.background, otherBackground);
  assert.equal(other.container.querySelector<HTMLElement>('.room-backdrop')!.style.background, otherBackground);
  fireEvent.click(q.getByRole('button', { name: 'Reset appearance to white and sage' }));
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 150)); });
  assert.deepEqual(packets, [], 'appearance never broadcasts to actual room peers');
  assert.equal(r.getByRole('timer'), peerTimer);
  assert.equal(dom.window.location.href, 'http://localhost/');
  assert.equal(dom.window.localStorage.length, 0);
  const after = await peer.timeout(2000).emitWithAck('timer:control', { action: 'pause' }) as Reply;
  assert.ok(after.ok);
  assert.deepEqual(after.state.participants, before.state.participants, 'socket identities and membership remain stable');
  assert.deepEqual(after.state.timer, before.state.timer);
  fireEvent.click(q.getByRole('button', { name: 'Solo' }));
  fireEvent.click(q.getByRole('button', { name: 'Sage' }));
  assert.ok(view.container.querySelector<HTMLElement>('.room-backdrop')!.style.background.includes('gradient'));
});
