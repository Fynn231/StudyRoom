import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { Music } from '../src/Music.js';

test('synthetic SDK events, not connect or Play responses, determine playback; Silent tears down device', async t => {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://127.0.0.1:4173' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  const listeners = new Map<string, (event: any) => void>(); let disconnected = 0; let paused = 0; let played = false; let connected = 0;
  class Player {
    constructor(private options: any) {}
    addListener(name: string, fn: (event: any) => void) { listeners.set(name, fn); }
    async connect() { connected++; this.options.getOAuthToken((token: string) => assert.equal(token, 'SYNTHETIC_ACCESS')); return true; }
    async activateElement() {}
    async pause() { paused++; }
    async togglePlay() {}
    disconnect() { disconnected++; }
  }
  Object.assign(dom.window, { Spotify: { Player } });
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/status')) return Response.json({ spotify: { ready: true, authorized: true, blocker: null }, apple: { ready: false, blocker: 'disabled' } });
    if (String(url).endsWith('/token')) return Response.json({ access_token: 'SYNTHETIC_ACCESS', expiresAt: Date.now() + 60_000 });
    if (String(url).endsWith('/play')) { played = true; assert.equal(JSON.parse(init?.body as string).deviceId, 'synthetic-device'); return Response.json({ requested: true }); }
    return Response.json({ disconnected: true });
  };
  const rtl = await import('@testing-library/react'); t.after(() => { rtl.cleanup(); globalThis.fetch = original; dom.window.close(); });
  const view = rtl.render(<Music />); const q = rtl.within(view.container);
  rtl.fireEvent.click(q.getByRole('button', { name: 'Check account setup', hidden: true }));
  await rtl.waitFor(() => assert.ok(q.getByRole('button', { name: 'Enable Spotify device', hidden: true })));
  rtl.fireEvent.click(q.getByRole('button', { name: 'Enable Spotify device', hidden: true }));
  await rtl.waitFor(() => assert.ok(listeners.has('ready')));
  await rtl.act(async () => listeners.get('ready')!({ device_id: 'synthetic-device' }));
  assert.equal(view.container.textContent!.includes('Playing on this Spotify device.'), false);
  rtl.fireEvent.click(q.getByRole('button', { name: 'Play selected on Spotify device', hidden: true }));
  await rtl.waitFor(() => assert.equal(played, true));
  assert.equal(view.container.textContent!.includes('Playing on this Spotify device.'), false);
  await rtl.act(async () => listeners.get('player_state_changed')!({ paused: false }));
  assert.ok(view.container.textContent!.includes('Playing on this Spotify device.'));
  rtl.fireEvent.click(q.getByRole('button', { name: 'Load featured Spotify player', hidden: true }));
  await rtl.waitFor(() => assert.ok(disconnected > 0, 'loading an embed tears down the connected device'));
  const beforeSilent = disconnected;
  rtl.fireEvent.click(q.getByRole('button', { name: 'Enable Spotify device', hidden: true }));
  await rtl.waitFor(() => assert.equal(view.container.querySelector('iframe'), null, 'enabling SDK unloads the embed'));
  await rtl.waitFor(() => assert.equal(connected, 2));
  rtl.fireEvent.click(q.getByLabelText('Silent mode'));
  assert.ok(disconnected > beforeSilent, 'Silent tears down an active SDK device'); assert.ok(paused > 0);
  assert.equal(JSON.stringify([...Array(dom.window.localStorage.length)].map((_, i) => dom.window.localStorage.getItem(dom.window.localStorage.key(i)!))).includes('SYNTHETIC_ACCESS'), false);
});

test('account connection is explicit and fails closed without touching official embeds or storage', async t => {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://127.0.0.1:4173' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  const original = globalThis.fetch; let requests = 0;
  globalThis.fetch = async () => { requests++; return Response.json({ spotify: { ready: false, authorized: false, blocker: 'Missing SPOTIFY_CLIENT_ID and MUSIC_ORIGIN' }, apple: { ready: false, blocker: 'MusicKit registration missing' } }); };
  const rtl = await import('@testing-library/react');
  t.after(() => { rtl.cleanup(); globalThis.fetch = original; dom.window.close(); });
  const view = rtl.render(<Music />); const q = rtl.within(view.container);
  assert.equal(requests, 0);
  rtl.fireEvent.click(q.getByRole('button', { name: 'Check account setup', hidden: true }));
  await rtl.waitFor(() => assert.match(view.container.textContent!, /Missing SPOTIFY_CLIENT_ID/));
  assert.equal((q.getByRole('button', { name: 'Connect Spotify account', hidden: true }) as HTMLButtonElement).disabled, true);
  assert.equal(document.querySelector('script[src*="sdk.scdn.co"]'), null);
  rtl.fireEvent.click(q.getByRole('button', { name: 'Load featured Spotify player', hidden: true }));
  assert.match(view.container.querySelector('iframe')!.src, /^https:\/\/open.spotify.com\/embed\//);
  rtl.fireEvent.click(q.getByLabelText('Silent mode'));
  assert.equal(view.container.querySelector('iframe'), null);
  assert.equal(view.container.textContent!.includes('Check account setup'), false);
  assert.equal(dom.window.localStorage.getItem('studyroom.musicPrefs.v1')!.includes('token'), false);
});
