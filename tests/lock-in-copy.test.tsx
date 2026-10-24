import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { App } from '../src/App.js';

async function setup(t: { after: (fn: () => void) => void }) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const rtl = await import('@testing-library/react');
  t.after(() => { rtl.cleanup(); dom.window.close(); });
  const view = rtl.render(<React.StrictMode><App /></React.StrictMode>);
  const q = rtl.within(view.container);
  return { ...rtl, ...view, q, dom };
}

test('normal language is unchanged and the title names Study Room', async t => {
  const v = await setup(t);
  assert.equal(v.dom.window.document.title, 'Study Room — focus together');
  assert.equal(v.q.getByRole('button', { name: 'study room' }).textContent, 'study room.');
  assert.equal(v.container.querySelector('h1')!.textContent, 'One thing at a time.');
  assert.equal(v.q.getByRole('button', { name: 'Start focus' }).getAttribute('data-action'), 'start');
  assert.equal(v.q.getByRole('button', { name: 'Party' }).textContent, 'Party');
});

test('locked mode centralizes title, brand, headings, controls and panel names', async t => {
  const v = await setup(t);
  for (let i = 0; i < 5; i++) v.fireEvent.keyDown(v.dom.window.document, { key: 'l' });
  assert.ok(v.container.querySelector('.lock-in-mode'));
  assert.equal(v.dom.window.document.title, 'LOCKED IN — focus protocol');
  assert.match(v.q.getByRole('button', { name: 'LOCKED IN' }).textContent!, /^LOCKED IN\.$/);
  assert.equal(v.container.querySelector('h1')!.textContent, 'Eliminate distractions.');
  assert.equal(v.q.getByRole('button', { name: 'Unit' }).textContent, 'Unit');
  assert.equal(v.container.querySelector('.focus-top h2')!.textContent, 'Primary Directive');
  assert.equal(v.container.querySelector('.focus-top [role="status"]')!.textContent, 'Awaiting initiation');
  const primary = v.container.querySelector('[data-action="start"]')!;
  assert.equal(primary.textContent, 'Initiate Focus');
  assert.equal(v.container.querySelector('.intention-surface h2')!.textContent, 'Current directive');
  assert.equal(v.q.getByLabelText('Primary objective').tagName, 'TEXTAREA');
  const summaries = [...v.container.querySelectorAll('summary')].map(s => s.textContent);
  for (const label of ['Protocol brief', 'Atmosphere', 'Soundtrack', 'Protect your focus', 'Intel / notes', 'Archived missions']) assert.ok(summaries.includes(label), label);
  assert.ok(summaries.includes('Exit Lock In Mode') === false, 'exit is a button, not a summary');
  assert.ok(v.q.getByRole('button', { name: 'Exit Lock In Mode' }));
});

test('leaving locked mode restores the normal language and title', async t => {
  const v = await setup(t);
  for (let i = 0; i < 5; i++) v.fireEvent.keyDown(v.dom.window.document, { key: 'l' });
  assert.equal(v.dom.window.document.title, 'LOCKED IN — focus protocol');
  v.fireEvent.click(v.q.getByRole('button', { name: 'Exit Lock In Mode' }));
  assert.equal(v.dom.window.document.title, 'Study Room — focus together');
  assert.equal(v.container.querySelector('h1')!.textContent, 'One thing at a time.');
  assert.equal(v.q.getByRole('button', { name: 'Start focus' }).textContent, 'Start focus');
  assert.equal(v.container.querySelector('.focus-top h2')!.textContent, 'Personal focus');
});

test('starting a focus cycle announces the locked status copy via a live region', async t => {
  const v = await setup(t);
  v.fireEvent.change(v.q.getByLabelText('Your session intention'), { target: { value: 'Hold the line' } });
  v.fireEvent.click(v.q.getByRole('button', { name: 'Start focus' }));
  for (let i = 0; i < 5; i++) v.fireEvent.keyDown(v.dom.window.document, { key: 'l' });
  const status = v.container.querySelector('.focus-top [role="status"]')!;
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.equal(status.textContent, 'Protocol active');
  assert.equal(v.container.querySelector('[data-action="pause"]')!.textContent, 'Suspend Focus');
  assert.equal((v.q.getByLabelText('Primary objective') as HTMLTextAreaElement).value, 'Hold the line');
});
