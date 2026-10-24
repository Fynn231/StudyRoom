import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { App } from '../src/App.js';

test('own fresh Start and explicit preview sound; mute, resume, reset, load and audio denial do not block clocks', async t => {
  const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost' });
  let starts = 0, closes = 0, deny = false;
  class Audio {
    currentTime = 0; destination = {}; state = 'running';
    async resume() { if (deny) throw Error('NotAllowedError'); }
    async close() { closes++; this.state = 'closed'; }
    createGain() { return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    createOscillator() { return { frequency: { setValueAtTime() {} }, type: '', onended: null, connect() {}, disconnect() {}, start() { starts++; }, stop() {} }; }
  }
  Object.assign(dom.window, { AudioContext: Audio });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { render, fireEvent, within, cleanup } = await import('@testing-library/react');
  t.after(() => { cleanup(); dom.window.close(); });
  const view = render(<App />); const q = within(view.container);
  assert.equal(starts, 0);
  assert.equal((q.getByLabelText('Enable focus chime') as HTMLInputElement).checked, true);
  await React.act(async () => fireEvent.click(q.getByRole('button', { name: 'Start focus' })));
  assert.equal(starts, 3);
  fireEvent.click(q.getByRole('button', { name: 'Pause focus' }));
  await React.act(async () => fireEvent.click(q.getByRole('button', { name: 'Resume focus' })));
  assert.equal(starts, 3, 'resume is silent');
  fireEvent.click(q.getByRole('button', { name: 'Reset timer' }));
  fireEvent.click(q.getByLabelText('Enable focus chime'));
  await React.act(async () => fireEvent.click(q.getByRole('button', { name: 'Start focus' })));
  assert.equal(starts, 3, 'muted fresh start is silent');
  assert.equal((q.getByRole('button', { name: 'Preview chime' }) as HTMLButtonElement).disabled, true);
  fireEvent.click(q.getByLabelText('Enable focus chime'));
  await React.act(async () => fireEvent.click(q.getByRole('button', { name: 'Preview chime' })));
  assert.equal(starts, 6);
  fireEvent.click(q.getByRole('button', { name: 'Stop chime' }));
  assert.ok(closes >= 2);
  fireEvent.click(q.getByRole('button', { name: 'Reset timer' })); deny = true;
  await React.act(async () => fireEvent.click(q.getByRole('button', { name: 'Start focus' })));
  assert.equal(starts, 6);
  assert.ok(q.getByRole('button', { name: 'Pause focus' }));
  assert.ok(q.getByText(/Chime unavailable/));
  view.unmount();
});
