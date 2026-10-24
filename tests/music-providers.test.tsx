import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { appleMusicLink, loadMusicPrefs, MUSIC_PREFS_KEY, sanitizePrefs, saveMusicPrefs } from '../src/musicPrefs.js';
import { Music, featuredSpotify } from '../src/Music.js';

const ALBUM = 'https://music.apple.com/us/album/random-access-memories/617154241';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    get length() { return map.size; },
    map
  };
}

test('Apple Music links are normalized to the official embed and lookalikes are rejected', () => {
  assert.equal(appleMusicLink(ALBUM), 'https://embed.music.apple.com/us/album/random-access-memories/617154241');
  assert.equal(appleMusicLink('https://music.apple.com/us/playlist/focus/pl.123abc'), 'https://embed.music.apple.com/us/playlist/focus/pl.123abc');
  assert.equal(appleMusicLink('https://embed.music.apple.com/us/album/x/1'), 'https://embed.music.apple.com/us/album/x/1');
  for (const bad of [
    'http://music.apple.com/us/album/x/1',
    'https://music.apple.com.evil.test/us/album/x/1',
    'https://evil.test/us/album/x/1',
    'https://user:pass@music.apple.com/us/album/x/1',
    'https://music.apple.com:444/us/album/x/1',
    'https://music.apple.com/us/artist/x/1',
    'https://music.apple.com/us/album/x/1?uo=4',
    'javascript:alert(1)',
    'https://music.apple.com/us/album/../../x/1'
  ]) assert.equal(appleMusicLink(bad), null, bad);
});

test('Apple album song query retains the song identity and rejects ambiguous identifiers', () => {
  assert.equal(appleMusicLink(ALBUM + '?i=617154243&ls=1'), 'https://embed.music.apple.com/us/album/random-access-memories/617154241?i=617154243');
  assert.equal(appleMusicLink(ALBUM + '?i=bad'), null);
  assert.equal(appleMusicLink(ALBUM + '?i=1&i=2'), null);
});

test('preferences drop unknown fields, secrets and invalid links', () => {
  const clean = sanitizePrefs({ provider: 'apple', spotify: featuredSpotify, apple: ALBUM, token: 'secret', accessToken: 'x' });
  assert.deepEqual(clean, { provider: 'apple', spotify: featuredSpotify, apple: 'https://embed.music.apple.com/us/album/random-access-memories/617154241' });
  assert.equal(JSON.stringify(clean).includes('secret'), false);
  assert.deepEqual(sanitizePrefs({ provider: 'nope', spotify: 'https://evil.test/x', apple: 'https://evil.test/y' }), { provider: 'silent', spotify: null, apple: null });
  assert.deepEqual(loadMusicPrefs(fakeStorage()), { provider: 'silent', spotify: null, apple: null });
});

test('save then load preserves provider and links, and storage failures never throw', () => {
  const storage = fakeStorage();
  assert.equal(saveMusicPrefs({ provider: 'spotify', spotify: featuredSpotify, apple: null }, storage), true);
  assert.deepEqual(loadMusicPrefs(storage), { provider: 'spotify', spotify: featuredSpotify, apple: null });
  assert.equal(saveMusicPrefs({ provider: 'silent', spotify: null, apple: null }, storage), true);
  assert.equal(loadMusicPrefs(storage).provider, 'silent');
  const broken = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  assert.equal(saveMusicPrefs({ provider: 'silent', spotify: null, apple: null }, broken as never), false);
  assert.deepEqual(loadMusicPrefs(broken as never), { provider: 'silent', spotify: null, apple: null });
});

test('Music switches Spotify / Apple Music / Silent without inventing an Apple track', async t => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  const rtl = await import('@testing-library/react');
  t.after(() => { rtl.cleanup(); dom.window.close(); });
  const view = rtl.render(<Music />); const q = rtl.within(view.container);

  // Apple Music: no default track; providers never claim playback.
  rtl.fireEvent.click(q.getByLabelText('Apple Music'));
  assert.equal(view.container.querySelector('iframe'), null);
  assert.match(dom.window.localStorage.getItem(MUSIC_PREFS_KEY)!, /"provider":"apple"/);
  const appleInput = q.getByLabelText('Apple Music link');
  rtl.fireEvent.change(appleInput, { target: { value: 'https://evil.test/song' } });
  rtl.fireEvent.click(q.getByRole('button', { name: 'Select Apple Music link' }));
  assert.match(q.getByRole('alert').textContent!, /music\.apple\.com/i);
  rtl.fireEvent.change(appleInput, { target: { value: ALBUM } });
  rtl.fireEvent.click(q.getByRole('button', { name: 'Select Apple Music link' }));
  rtl.fireEvent.click(q.getByRole('button', { name: 'Load Apple Music player' }));
  const frame = view.container.querySelector('iframe')!;
  assert.equal(frame.getAttribute('title'), 'Official Apple Music player');
  assert.equal(frame.getAttribute('src'), 'https://embed.music.apple.com/us/album/random-access-memories/617154241');
  assert.ok(q.getByRole('link', { name: 'Open in Apple Music (new tab)' }));

  // Silent: unloads the provider entirely.
  rtl.fireEvent.click(q.getByLabelText('Silent mode'));
  assert.equal(view.container.querySelector('iframe'), null);
  assert.match(q.getByRole('status').textContent!, /Silent focus selected/i);
  assert.match(dom.window.localStorage.getItem(MUSIC_PREFS_KEY)!, /"provider":"silent"/);

  // Spotify remains the default provider and keeps the exact supplied track.
  rtl.fireEvent.click(q.getByLabelText('Spotify'));
  assert.equal(q.queryByRole('button', { name: 'Load selected Spotify player', hidden: true }), null, 'Apple selection must not leak into Spotify controls');
  assert.equal((q.getByLabelText('Spotify link') as HTMLInputElement).value, '', 'previous provider draft is cleared');
  rtl.fireEvent.click(q.getByRole('button', { name: 'Load featured Spotify player' }));
  assert.equal(view.container.querySelector('iframe')!.src, `https://open.spotify.com/embed/track/2KpZZ1cyChx3REhma5nOv6?utm_source=generator`);
  assert.equal(JSON.stringify(dom.window.localStorage.getItem(MUSIC_PREFS_KEY)).includes('token'), false);
});
