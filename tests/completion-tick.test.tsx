import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { SessionComplete } from '../src/SessionComplete.js';
import { saveSession, loadSessions, type SessionRecord } from '../src/sessionRecords.js';

test('completion rating and focus survive parent timer ticks with a fresh close callback, then save once', async t => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { render, fireEvent, within, cleanup } = await import('@testing-library/react');
  t.after(() => { cleanup(); dom.window.close(); });
  const record: SessionRecord = { id: 'tick-regression', completedAt: '2026-10-24T18:00:00.000Z', focusedMs: 60000, plannedMs: 60000, stepsDone: 0, stepsTotal: 0, rating: null, focusRating: null };
  saveSession(record, dom.window.localStorage);
  const closes: string[] = [];
  const view = render(<SessionComplete open record={record} locked={false} firstVisit onClose={() => closes.push('old')} />), q = within(view.container);
  const rating = q.getAllByLabelText('4 out of 5')[0] as HTMLInputElement;
  fireEvent.click(rating); rating.focus();
  for (let i = 0; i < 4; i++) view.rerender(<SessionComplete open record={{ ...record }} locked={false} firstVisit onClose={() => closes.push('latest')} />);
  assert.equal(rating.checked, true, 'parent clock rerenders must not erase unsaved feedback');
  assert.equal(document.activeElement, rating, 'parent ticks must not steal keyboard focus');
  fireEvent.click(q.getByRole('button', { name: 'Save feedback' }));
  assert.equal(loadSessions(dom.window.localStorage).sessions[0].rating, 4);
  assert.equal(loadSessions(dom.window.localStorage).sessions.length, 1);
  fireEvent.keyDown(document, { key: 'Escape' }); assert.deepEqual(closes, ['latest']);
});
