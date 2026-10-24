import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { App } from '../src/App.js';

test('private reflection records one outcome per session and requires an explicit new session', async t => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { render, fireEvent, within, cleanup } = await import('@testing-library/react');
  t.after(() => { cleanup(); dom.window.close(); });
  const view = render(<App />); const q = within(view.container);
  fireEvent.click(q.getByText('Private history', { selector: 'summary' }));
  assert.ok(q.getByText('No private sessions yet.'));
  fireEvent.change(q.getByLabelText('Your session intention'), { target: { value: 'SYNTHETIC COMMITMENT' } });
  fireEvent.click(q.getByRole('button', { name: 'Start focus' }));
  fireEvent.click(q.getByRole('button', { name: 'Finish privately' }));
  assert.ok(q.getByRole('button', { name: 'Resume focus' }));
  fireEvent.change(q.getByLabelText('Reflection note (optional)'), { target: { value: 'SYNTHETIC NOTE' } });
  fireEvent.change(q.getByLabelText('Session outcome'), { target: { value: 'completed' } });
  fireEvent.click(q.getByRole('button', { name: 'Save private reflection' }));
  const history = within(q.getByRole('list', { name: 'Private sessions' }));
  assert.equal(history.getAllByRole('listitem').length, 1);
  assert.ok(history.getByText('SYNTHETIC COMMITMENT'));
  assert.ok(history.getByText('SYNTHETIC NOTE'));
  assert.ok(history.getByText('completed'));
  assert.equal((q.getByRole('button', { name: 'Finish privately' }) as HTMLButtonElement).disabled, true);
  assert.equal(dom.window.localStorage.length, 0);
  for (const outcome of ['partial', 'blocked']) {
    fireEvent.click(q.getByRole('button', { name: 'New private session' }));
    fireEvent.click(q.getByRole('button', { name: 'Finish privately' }));
    fireEvent.change(q.getByLabelText('Session outcome'), { target: { value: outcome } });
    fireEvent.click(q.getByRole('button', { name: 'Save private reflection' }));
    assert.ok(history.getByText(outcome));
  }
  assert.equal(history.getAllByRole('listitem').length, 3);
  fireEvent.click(q.getByRole('button', { name: 'Clear private history' }));
  assert.ok(q.getByText('No private sessions yet.'));
  assert.equal((q.getByRole('button', { name: 'Finish privately' }) as HTMLButtonElement).disabled, true, 'clearing history must not permit duplicate completion');
});
