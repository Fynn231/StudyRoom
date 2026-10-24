import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { App } from '../src/App.js';

test('Solo is usable without a social room or reachable server', async t => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { render, fireEvent, within, cleanup } = await import('@testing-library/react');
  t.after(() => { cleanup(); dom.window.close(); });
  const view = render(<App endpoint="http://127.0.0.1:1" />); const q = within(view.container);
  assert.ok(q.getByRole('heading', { name: 'Personal focus' }));
  const draft = q.getByLabelText('Your session intention');
  fireEvent.change(draft, { target: { value: 'SYNTHETIC SOLO WORK' } });
  assert.equal((draft as HTMLTextAreaElement).value, 'SYNTHETIC SOLO WORK');
  assert.equal((q.getByRole('button', { name: 'Start focus' }) as HTMLButtonElement).disabled, false);
  fireEvent.click(q.getByRole('button', { name: 'Start focus' }));
  assert.ok(q.getByRole('button', { name: 'Pause focus' }));
  fireEvent.click(q.getByRole('button', { name: 'Pause focus' }));
  assert.ok(q.getByRole('button', { name: 'Resume focus' }));
  fireEvent.click(q.getByRole('button', { name: 'Reset timer' }));
  assert.equal(q.getByRole('timer').textContent, '25:00');
  assert.equal(q.queryByRole('button', { name: 'Share with room' }), null);
  fireEvent.click(q.getByRole('button', { name: 'Party' }));
  assert.ok(q.getByRole('heading', { name: 'Personal focus' }), 'Party lobby must not hide the private workspace');
  assert.equal((q.getByRole('button', { name: 'Start focus' }) as HTMLButtonElement).disabled, false);
  assert.equal((q.getByLabelText('Your session intention') as HTMLTextAreaElement).value, 'SYNTHETIC SOLO WORK');
  fireEvent.click(q.getByRole('button', { name: 'Solo' }));
  assert.equal(q.getByRole('timer').textContent, '25:00');
});


test('personal pause captures the current monotonic time rather than a stale display tick', async t => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { render, fireEvent, within, cleanup } = await import('@testing-library/react');
  const originalNow = performance.now;
  let now = 0; performance.now = () => now;
  t.after(() => { cleanup(); performance.now = originalNow; dom.window.close(); });
  const view = render(<App />); const q = within(view.container);
  fireEvent.click(q.getByRole('button', { name: 'Start focus' }));
  now = 1200;
  fireEvent.click(q.getByRole('button', { name: 'Pause focus' }));
  assert.equal(q.getByRole('timer').textContent, '24:59');
  assert.ok(q.getByRole('button', { name: 'Resume focus' }));
  now = 9000;
  fireEvent.click(q.getByRole('button', { name: 'Resume focus' }));
  now = 2000000;
  fireEvent.click(q.getByRole('button', { name: 'Pause focus' }));
  assert.equal(q.getByRole('timer').textContent, '00:00');
  assert.equal((q.getByRole('button', { name: 'Resume focus' }) as HTMLButtonElement).disabled, true);
  fireEvent.click(q.getByRole('button', { name: 'Reset timer' }));
  assert.equal(q.getByRole('timer').textContent, '25:00');
});
