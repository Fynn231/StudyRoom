import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { GoalNotes } from '../src/GoalNotesPanel.js';

for (const scenario of ['clear', 'reselect', 'stale error', 'unmount']) test(`${scenario} invalidates and aborts outstanding file reads`, async t => {
  const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost' });
  const readers: ControlledReader[] = [];
  class ControlledReader {
    result: ArrayBuffer | null = null; onload?: () => void; onerror?: () => void; onabort?: () => void; aborted = false;
    readAsArrayBuffer() { readers.push(this); }
    abort() { this.aborted = true; this.onabort?.(); }
    finish(text: string) { this.result = new TextEncoder().encode(text).buffer; this.onload?.(); }
  }
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, FileReader: ControlledReader, IS_REACT_ACT_ENVIRONMENT: true });
  const { render, fireEvent, within, cleanup } = await import('@testing-library/react');
  t.after(() => { cleanup(); dom.window.close(); });
  const view = render(<GoalNotes commitment="" onChoose={() => assert.fail('import is never a choice')} />); const q = within(view.container);
  const choose = (name: string) => fireEvent.change(q.getByLabelText('Choose Markdown notes'), { target: { files: [new dom.window.File(['stub'], name)] } });
  if (scenario === 'clear') {
  choose('old.md'); const cleared = readers.at(-1)!;
  fireEvent.click(q.getByRole('button', { name: 'Clear imported notes' }));
  await React.act(async () => cleared.finish('- [ ] CLEARED GHOST'));
  assert.equal(view.container.textContent!.includes('CLEARED GHOST'), false, 'clear must not resurrect an import');
  assert.equal(cleared.aborted, true);
  }
  if (scenario === 'reselect') {
  choose('older.md'); const older = readers.at(-1)!;
  choose('newer.md'); const newer = readers.at(-1)!;
  await React.act(async () => newer.finish('- [ ] NEWEST TASK'));
  await React.act(async () => older.finish('- [ ] STALE TASK'));
  assert.equal(view.container.textContent!.includes('STALE TASK'), false);
  assert.equal(view.container.textContent!.includes('NEWEST TASK'), true);
  assert.equal(older.aborted, true);
  }
  if (scenario === 'stale error') {
  choose('error.md'); const errored = readers.at(-1)!;
  choose('final.md'); const final = readers.at(-1)!;
  await React.act(async () => errored.onerror?.());
  assert.equal(view.container.textContent!.includes('Reading selected notes'), true, 'stale finally must not end current loading');
  assert.equal(q.queryAllByRole('alert').length, 0, 'stale errors are ignored');
  }
  if (scenario === 'unmount') {
  choose('unmount.md'); const final = readers.at(-1)!;
  view.unmount();
  assert.equal(final.aborted, true, 'unmount cancels the read and detaches its listeners');
  await React.act(async () => final.finish('- [ ] UNMOUNT GHOST'));
  }
});
