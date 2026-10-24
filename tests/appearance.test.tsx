import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { App } from '../src/App.js';

test('Appearance presets immediately change the existing focus surface without replacing the running timer or draft', async t => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { render, fireEvent, within, cleanup } = await import('@testing-library/react');
  t.after(() => { cleanup(); dom.window.close(); });
  const view = render(<App />); const q = within(view.container);
  const surface = view.container.querySelector<HTMLElement>('.room-backdrop')!;
  const timer = q.getByRole('timer');
  const draft = q.getByLabelText('Your session intention') as HTMLTextAreaElement;
  fireEvent.change(draft, { target: { value: 'SYNTHETIC APPEARANCE DRAFT' } });
  fireEvent.click(q.getByLabelText('Enable focus chime'));
  fireEvent.click(q.getByRole('button', { name: 'Start focus' }));
  fireEvent.click(q.getByText('Appearance', { selector: 'summary' }));
  const values = new Set<string>();
  for (const name of ['Sage', 'Peach Glow', 'Lavender Mist', 'Ocean Haze']) {
    fireEvent.click(q.getByRole('button', { name }));
    values.add(surface.style.background);
    assert.equal(q.getByRole('button', { name }).getAttribute('aria-pressed'), 'true');
    assert.equal(view.container.querySelector('.room-backdrop'), surface);
    assert.equal(q.getByRole('timer'), timer);
    assert.equal(q.getByLabelText('Your session intention'), draft);
    assert.equal(draft.value, 'SYNTHETIC APPEARANCE DRAFT');
    assert.ok(q.getByRole('button', { name: 'Pause focus' }));
  }
  assert.equal(values.size, 4);
  assert.ok([...values].every(value => value.includes('gradient')));
  assert.ok(q.getByText(/Only your view.*this tab/));
});

test('custom two-color selections retain original hex values while rendering validated exact page stops', async t => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { render, fireEvent, within, cleanup } = await import('@testing-library/react');
  t.after(() => { cleanup(); dom.window.close(); });
  const view = render(<App />); const q = within(view.container);
  fireEvent.click(q.getByText('Appearance', { selector: 'summary' }));
  const first = q.getByLabelText('First custom color') as HTMLInputElement;
  const second = q.getByLabelText('Second custom color') as HTMLInputElement;
  const backdrop = view.container.querySelector<HTMLElement>('.room-backdrop')!;
  fireEvent.input(first, { target: { value: '#000000' } });
  fireEvent.input(second, { target: { value: '#ff00ff' } });
  assert.equal(first.value, '#000000'); assert.equal(second.value, '#ff00ff');
  assert.ok(backdrop.style.background.includes('gradient'));
  assert.match(backdrop.style.background, /rgb\(0, 0, 0\)/);
  assert.ok(q.getByText(/No whitening or color adjustment/));
  const { customGradient } = await import('../src/appearanceColors.js');
  for (const unsafe of ['', '#fff', '#ffffff00', 'red', 'url(https://example.invalid)', '#123456; color:red', '#gggggg', null, {}, '#123456\n']) {
    assert.equal(customGradient(unsafe, '#ffffff'), null);
    assert.equal(customGradient('#ffffff', unsafe), null);
  }
  assert.equal(customGradient('#000000', '#ff00ff'), 'linear-gradient(to bottom right, #000000, #ff00ff)');
});

test('editable HEX fields validate visibly, keep the last valid theme and synchronize native pickers without replacing work', async t => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { render, fireEvent, within, cleanup } = await import('@testing-library/react');
  t.after(() => { cleanup(); dom.window.close(); });
  const view = render(<App />), q = within(view.container);
  fireEvent.click(q.getByText('Appearance', { selector: 'summary' }));
  const hex = q.getByLabelText('First custom HEX') as HTMLInputElement;
  const picker = q.getByLabelText('First custom color') as HTMLInputElement;
  const timer = q.getByRole('timer'), draft = q.getByLabelText('Your session intention');
  fireEvent.change(draft, { target: { value: 'Synthetic hex draft' } });
  fireEvent.click(q.getByRole('button', { name: 'Start focus' }));
  fireEvent.change(hex, { target: { value: '#Ab12Cd' } });
  assert.equal(hex.value, '#Ab12Cd'); assert.equal(picker.value, '#ab12cd');
  const backdrop = view.container.querySelector<HTMLElement>('.room-backdrop')!;
  const valid = backdrop.style.background;
  assert.match(valid, /rgb\(171, 18, 205\)/); // jsdom serializes opaque hex to rgb; browser verifies direction.
  for (const invalid of ['#fff', '#12345g', 'red', 'url(https://example.invalid)', '#123456; color:red', '']) {
    fireEvent.change(hex, { target: { value: invalid } });
    assert.equal(backdrop.style.background, valid);
    assert.equal(hex.getAttribute('aria-invalid'), 'true');
    assert.ok(q.getByRole('alert').textContent?.includes('#RRGGBB'));
    assert.equal(picker.value, '#ab12cd');
  }
  fireEvent.input(picker, { target: { value: '#0000ff' } });
  assert.equal(hex.value, '#0000ff'); assert.equal(hex.getAttribute('aria-invalid'), 'false');
  assert.equal(q.queryByRole('alert'), null);
  assert.equal(q.getByRole('timer'), timer); assert.equal(q.getByLabelText('Your session intention'), draft);
  assert.equal((draft as HTMLTextAreaElement).value, 'Synthetic hex draft');
  assert.ok(q.getByRole('button', { name: 'Pause focus' }));
});

test('reset restores white-to-sage without erasing notes, music, saved history, drafts or running clocks; appearance never uses storage', async t => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, FileReader: dom.window.FileReader, ArrayBuffer: dom.window.ArrayBuffer, IS_REACT_ACT_ENVIRONMENT: true });
  const { render, fireEvent, within, waitFor, cleanup } = await import('@testing-library/react');
  t.after(() => { cleanup(); dom.window.close(); });
  const view = render(<App />); const q = within(view.container);
  fireEvent.change(q.getByLabelText('Your session intention'), { target: { value: 'Synthetic retained draft' } });
  fireEvent.click(q.getByRole('button', { name: 'Finish privately' }));
  fireEvent.click(q.getByRole('button', { name: 'Save private reflection' }));
  fireEvent.click(q.getByText('Private history (1)', { selector: 'summary' }));
  fireEvent.click(q.getByLabelText('Store history on this device'));
  const stored = dom.window.localStorage.getItem('studyroom.private-history.v1');
  assert.ok(stored);
  fireEvent.click(q.getByRole('button', { name: 'New private session' }));
  fireEvent.click(q.getByText('Music', { selector: 'summary' }));
  fireEvent.change(q.getByLabelText('Spotify link'), { target: { value: 'https://open.spotify.com/track/0123456789ABCDEFGHIJKL' } });
  fireEvent.click(q.getByRole('button', { name: 'Select music link' }));
  fireEvent.click(q.getByText('Goals / notes', { selector: 'summary' }));
  fireEvent.change(q.getByLabelText('Choose Markdown notes'), { target: { files: [new dom.window.File(['- [ ] Synthetic imported task'], 'appearance.md', { type: 'text/markdown' })] } });
  await waitFor(() => assert.ok(q.getByText('Synthetic imported task')));
  fireEvent.click(q.getByLabelText('Enable focus chime'));
  fireEvent.click(q.getByRole('button', { name: 'Start focus' }));
  const nodes = ['.goal-source', '.selected-music', '.private-review', '[role="timer"]'].map(selector => view.container.querySelector(selector));
  fireEvent.click(q.getByText('Appearance', { selector: 'summary' }));
  fireEvent.input(q.getByLabelText('First custom color'), { target: { value: '#ff0000' } });
  fireEvent.click(q.getByRole('button', { name: 'Ocean Haze' }));
  fireEvent.click(q.getByRole('button', { name: 'Juliette' }));
  fireEvent.click(q.getByLabelText('Falling flowers'));
  fireEvent.change(q.getByLabelText('Second custom HEX'), { target: { value: '#0000ff' } });
  fireEvent.click(q.getByRole('button', { name: 'Reset appearance to white and sage' }));
  assert.equal(view.container.querySelector<HTMLElement>('.room-backdrop')!.style.background, '');
  assert.ok(q.getByText('Synthetic imported task'));
  assert.ok(q.getByRole('link', { name: 'Open in Spotify (new tab)' }));
  assert.ok(q.getByText('Private history (1)', { selector: 'summary' }));
  assert.ok(q.getByRole('button', { name: 'Pause focus' }));
  assert.equal((q.getByLabelText('Your session intention') as HTMLTextAreaElement).value, 'Synthetic retained draft');
  assert.equal((q.getByLabelText('First custom color') as HTMLInputElement).value, '#ffffff');
  assert.equal(dom.window.localStorage.getItem('studyroom.private-history.v1'), stored);
  assert.equal(dom.window.localStorage.length, 1);
  assert.deepEqual(['.goal-source', '.selected-music', '.private-review', '[role="timer"]'].map(selector => view.container.querySelector(selector)), nodes);
  Object.defineProperty(dom.window, 'localStorage', { configurable: true, get() { throw new Error('Storage must not be accessed'); } });
  fireEvent.click(q.getByRole('button', { name: 'Peach Glow' }));
  fireEvent.click(q.getByRole('button', { name: 'Reset appearance to white and sage' }));
  assert.equal(q.queryByRole('alert'), null);
  view.unmount();
  const fresh = render(<App />);
  assert.equal(fresh.container.querySelector<HTMLElement>('.room-backdrop')!.style.background, '');
});
