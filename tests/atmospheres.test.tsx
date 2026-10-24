import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { App } from '../src/App.js';
import { StorageAccountProvider } from '../src/privateStorage.js';

async function setup(t: { after: (fn: () => void) => void }, stored?: string, owner: string | null = null) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  const prefix = owner === null ? '' : `studyroom.account.${encodeURIComponent(owner)}.`;
  dom.window.sessionStorage.setItem(prefix + 'studyroom.lockIn', '1');
  if (stored !== undefined) dom.window.localStorage.setItem(prefix + 'studyroom.lockedAtmosphere.v1', stored);
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const rtl = await import('@testing-library/react');
  const view = rtl.render(<React.StrictMode><StorageAccountProvider account={owner}><App /></StorageAccountProvider></React.StrictMode>);
  t.after(() => { rtl.cleanup(); dom.window.close(); });
  return { ...rtl, ...view, dom, q: rtl.within(view.container) };
}

test('fresh LOCKED IN defaults to Obsidian Static without writing storage or loading a provider', async t => {
  const v = await setup(t);
  assert.equal(v.container.querySelector('.locked-atmosphere')?.getAttribute('data-atmosphere'), 'obsidian-static');
  v.fireEvent.click(v.q.getByText('Atmosphere', { selector: 'summary' }));
  assert.ok(v.q.getByRole('button', { name: /Obsidian Static/ }));
  assert.equal(v.container.querySelectorAll('.locked-atmosphere').length, 1);
  assert.equal(v.container.querySelector('iframe'), null);
  assert.equal(v.dom.window.localStorage.getItem('studyroom.lockedAtmosphere.v1'), null);
});

const names = ['Obsidian Static', 'Ember Column', 'Contour Drift', 'Eclipse Bloom', 'Shard Field', 'Undertow', 'Signal Sweep', 'Wireframe Drift', 'Frost Lattice', 'Aurora Fold', 'Halftone Pulse', 'Orbital Ash'];
const structures = ['.grain + .scan', '.glow ~ .ember', 'svg path', '.halo + .core', '.shard', '.band', '.rings + .sweep', '.floor + .horizon', 'svg path', '.fold', '.dots', '.ring'];
test('all twelve approved choices mount only their distinct bounded effect without remounting live work', async t => {
  const v = await setup(t);
  v.fireEvent.click(v.q.getByText('Atmosphere', { selector: 'summary' }));
  const group = v.q.getByRole('group', { name: 'LOCKED IN atmospheres' });
  assert.equal(v.within(group).getAllByRole('button').length, 12);
  const draft = v.container.querySelector('.intention-surface textarea')!;
  v.fireEvent.change(draft, { target: { value: 'Preserve this private objective' } });
  const signatures = new Set<string>();
  for (const [i, name] of names.entries()) {
    v.fireEvent.click(v.within(group).getByRole('button', { name: new RegExp(name) }));
    const layer = v.container.querySelector('.locked-atmosphere')!;
    assert.equal(layer.getAttribute('data-atmosphere'), name.toLowerCase().replaceAll(' ', '-'));
    assert.equal(layer.getAttribute('aria-hidden'), 'true');
    assert.ok(layer.querySelector(structures[i]), `${name} uses its approved geometry`);
    assert.ok(layer.querySelectorAll('*').length <= 12, 'bounded DOM budget');
    signatures.add(layer.innerHTML);
    assert.equal(v.container.querySelectorAll('.locked-atmosphere').length, 1);
    assert.equal(v.container.querySelector('.intention-surface textarea'), draft, 'draft element never remounted');
    assert.equal((draft as HTMLTextAreaElement).value, 'Preserve this private objective');
    assert.equal(v.container.querySelector('iframe'), null, 'changing palettes never contacts a provider');
  }
  assert.equal(signatures.size, 12);
  v.fireEvent.click(v.q.getByRole('button', { name: 'Exit Lock In Mode' }));
  assert.equal(v.container.querySelector('.locked-atmosphere'), null);
  assert.equal(v.q.queryByRole('group', { name: 'LOCKED IN atmospheres' }), null);
  for (let i = 0; i < 5; i++) v.fireEvent.keyDown(v.dom.window.document, { key: 'l' });
  assert.equal(v.container.querySelector('.locked-atmosphere')?.getAttribute('data-atmosphere'), 'orbital-ash');
});

test('deliberate selection and motion preference are account-scoped and reload restores without provider consent', async t => {
  const v = await setup(t, JSON.stringify({ id: 'frost-lattice', motion: false }), 'qa/account');
  const key = 'studyroom.account.qa%2Faccount.studyroom.lockedAtmosphere.v1';
  assert.equal(v.container.querySelector('.locked-atmosphere')?.getAttribute('data-atmosphere'), 'frost-lattice');
  assert.equal(v.container.querySelector('.locked-atmosphere')?.getAttribute('data-motion'), 'false');
  assert.equal(v.container.querySelector('iframe'), null);
  v.fireEvent.click(v.q.getByText('Atmosphere', { selector: 'summary' }));
  v.fireEvent.click(v.q.getByRole('button', { name: /Aurora Fold/ }));
  assert.deepEqual(JSON.parse(v.dom.window.localStorage.getItem(key)!), { id: 'aurora-fold', motion: false });
  assert.equal(v.dom.window.localStorage.getItem('studyroom.lockedAtmosphere.v1'), null);
  assert.equal(v.dom.window.localStorage.getItem('studyroom.account.other.studyroom.lockedAtmosphere.v1'), null);
  v.fireEvent.click(v.q.getByLabelText('Animate atmosphere'));
  assert.deepEqual(JSON.parse(v.dom.window.localStorage.getItem(key)!), { id: 'aurora-fold', motion: true });
});

test('malformed private selections fall back to Obsidian without silently rewriting them', async t => {
  for (const stored of ['not json', 'null', '[]', '{}', '{"id":"unknown","motion":true}', '{"id":"ember-column","motion":"false"}', '{"id":"__proto__","motion":true}']) {
    const v = await setup(t, stored);
    assert.equal(v.container.querySelector('.locked-atmosphere')?.getAttribute('data-atmosphere'), 'obsidian-static', stored);
    assert.equal(v.dom.window.localStorage.getItem('studyroom.lockedAtmosphere.v1'), stored);
    v.unmount();
  }
});

test('motion off is explicit and visibility events pause only the background', async t => {
  const v = await setup(t);
  v.fireEvent.click(v.q.getByText('Atmosphere', { selector: 'summary' }));
  v.fireEvent.click(v.q.getByLabelText('Animate atmosphere'));
  assert.equal(v.container.querySelector('.locked-atmosphere')?.getAttribute('data-motion'), 'false');
  Object.defineProperty(v.dom.window.document, 'hidden', { configurable: true, value: true });
  v.fireEvent(v.dom.window.document, new v.dom.window.Event('visibilitychange'));
  assert.equal(v.container.querySelector('.locked-atmosphere')?.getAttribute('data-paused'), 'true');
  Object.defineProperty(v.dom.window.document, 'hidden', { configurable: true, value: false });
  v.fireEvent(v.dom.window.document, new v.dom.window.Event('visibilitychange'));
  assert.equal(v.container.querySelector('.locked-atmosphere')?.getAttribute('data-paused'), 'false');
  assert.equal(v.container.querySelector('.locked-atmosphere')?.getAttribute('data-motion'), 'false');
});
