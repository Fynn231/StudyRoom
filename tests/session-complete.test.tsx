import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { App } from '../src/App.js';
import { SessionComplete } from '../src/SessionComplete.js';
import { clearSessions, creatorNoteSeen, isSessionRecord, loadSessions, markCreatorNoteSeen, parseSessions, rateSession, saveSession, SESSIONS_KEY, type SessionRecord } from '../src/sessionRecords.js';

const record = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 'session-1', completedAt: '2026-10-23T17:00:00.000Z', focusedMs: 1500000, plannedMs: 1500000,
  stepsDone: 2, stepsTotal: 3, rating: null, focusRating: null, ...over
});

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    map
  };
}

test('a session is stored independently of feedback, once, with a bounded schema', () => {
  const storage = fakeStorage();
  assert.equal(saveSession(record(), storage).ok, true);
  assert.equal(storage.map.has(SESSIONS_KEY), true);
  assert.equal(loadSessions(storage).sessions[0].rating, null, 'stored before any rating');
  assert.equal(saveSession(record(), storage).duplicate, true);
  assert.equal(loadSessions(storage).sessions.length, 1, 'no duplicate session');
  assert.equal(isSessionRecord({ ...record(), id: '' }), false);
  assert.equal(isSessionRecord({ ...record(), rating: 6 }), false);
  assert.equal(isSessionRecord({ ...record(), focusedMs: -1 }), false);
  for (let i = 2; i <= 205; i++) saveSession(record({ id: `session-${i}`, completedAt: `2026-10-23T17:${String(i % 60).padStart(2, '0')}:00.000Z` }), storage);
  assert.equal(loadSessions(storage).sessions.length, 200, 'bounded to 200');
});

test('one rating per session: rating updates the record and never appends another', () => {
  const storage = fakeStorage();
  saveSession(record(), storage);
  assert.equal(rateSession('session-1', 4, 3, storage).ok, true);
  const after = loadSessions(storage).sessions;
  assert.equal(after.length, 1);
  assert.equal(after[0].rating, 4);
  assert.equal(after[0].focusRating, 3);
  assert.equal(rateSession('session-1', 5, null, storage).ok, true);
  assert.equal(loadSessions(storage).sessions.length, 1);
  assert.equal(loadSessions(storage).sessions[0].rating, 5);
  assert.equal(rateSession('missing', 5, null, storage).ok, false, 'no orphan rating');
  assert.equal(rateSession('session-1', 9, null, storage).ok, false);
});

test('corrupt or ambiguous storage fails closed and is never overwritten', () => {
  const broken = fakeStorage();
  broken.map.set(SESSIONS_KEY, '{not json');
  const parsed = parseSessions(broken.map.get(SESSIONS_KEY)!);
  assert.equal(parsed.blocked, true);
  assert.deepEqual(parsed.sessions, []);
  assert.equal(saveSession(record(), broken).ok, false);
  assert.equal(broken.map.get(SESSIONS_KEY), '{not json', 'corrupt data preserved');
  const dupes = JSON.stringify([record(), record()]);
  assert.equal(parseSessions(dupes).blocked, true, 'duplicate ids rejected');
});

test('creator note is full on the first completion, then remembered', () => {
  const storage = fakeStorage();
  assert.equal(creatorNoteSeen(storage), false);
  markCreatorNoteSeen(storage);
  assert.equal(creatorNoteSeen(storage), true);
  saveSession(record(), storage);
  assert.equal(clearSessions(storage), true);
  assert.equal(storage.map.has(SESSIONS_KEY), false);
});

test('both completion variants share logic while presentation changes', async t => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  const rtl = await import('@testing-library/react');
  t.after(() => { rtl.cleanup(); dom.window.close(); });
  const closed: number[] = [];
  saveSession(record(), dom.window.localStorage as never); // App stores the session before feedback exists
  const view = rtl.render(<SessionComplete open record={record()} locked={false} firstVisit onClose={() => closed.push(1)} />);
  const q = rtl.within(view.container);
  assert.equal(q.getByRole('dialog').getAttribute('aria-modal'), 'true');
  assert.match(q.getByRole('heading').textContent!, /showed up today/i);
  assert.match(view.container.textContent!, /25 min/);
  assert.match(view.container.textContent!, /2 of 3/);
  assert.match(view.container.textContent!, /Fynn, creator of Study Room/);
  rtl.fireEvent.click(q.getAllByLabelText('4 out of 5')[0]);
  rtl.fireEvent.click(q.getByRole('button', { name: 'Save feedback' }));
  const saved = loadSessions(dom.window.localStorage as never).sessions[0];
  assert.equal(saved.rating, 4);
  assert.equal(loadSessions(dom.window.localStorage as never).sessions.length, 1);
  assert.match(q.getByRole('status').textContent!, /Saved on this device/);
  rtl.fireEvent.keyDown(dom.window.document, { key: 'Escape' });
  assert.equal(closed.length, 1, 'Escape closes');

  view.rerender(<SessionComplete open record={record({ rating: null, focusRating: null })} locked firstVisit={false} onClose={() => closed.push(2)} />);
  assert.match(q.getByRole('heading').textContent!, /Mission accomplished/i);
  assert.match(view.container.textContent!, /Until the next mission/);
  assert.match(view.container.textContent!, /PROTOCOL COMPLETE/);
  rtl.fireEvent.click(q.getByRole('button', { name: 'Close mission report' }));
  assert.ok(closed.includes(2));
});

test('a completed timer opens the dialog with real data; skip closes without blocking, and a new cycle becomes a new record', async t => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  const originalNow = performance.now; let now = 0; performance.now = () => now;
  const rtl = await import('@testing-library/react');
  t.after(() => { rtl.cleanup(); performance.now = originalNow; dom.window.close(); });
  const view = rtl.render(<App />); const q = rtl.within(view.container);
  assert.equal(view.container.querySelector('[role="dialog"]'), null, 'no prompt before a session');
  rtl.fireEvent.click(q.getByRole('button', { name: 'Start focus' }));
  assert.equal(view.container.querySelector('[role="dialog"]'), null, 'ongoing timer is not interrupted');
  now = 1500001;
  rtl.fireEvent.click(q.getByRole('button', { name: 'Pause focus' }));
  const dialog = await q.findByRole('dialog');
  assert.match(dialog.textContent!, /25 min/);
  assert.equal(q.getByRole('timer').textContent, '00:00', 'completion is not blocked');
  assert.equal(loadSessions(dom.window.localStorage as never).sessions.length, 1, 'saved without feedback');
  rtl.fireEvent.click(q.getByRole('button', { name: 'Skip' }));
  assert.equal(view.container.querySelector('[role="dialog"]'), null);
  assert.equal(loadSessions(dom.window.localStorage as never).sessions.length, 1);

  rtl.fireEvent.click(q.getByRole('button', { name: 'Reset timer' }));
  rtl.fireEvent.click(q.getByRole('button', { name: 'Start focus' }));
  now += 1500001;
  rtl.fireEvent.click(q.getByRole('button', { name: 'Pause focus' }));
  await q.findByRole('dialog');
  const sessions = loadSessions(dom.window.localStorage as never).sessions;
  assert.equal(sessions.length, 2, 'a new cycle is a new record');
  assert.equal(creatorNoteSeen(dom.window.localStorage as never), true, 'creator note remembered after first completion');
});
