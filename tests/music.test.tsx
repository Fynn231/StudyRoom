import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { App } from '../src/App.js';
import { Music } from '../src/Music.js';
import { useRoomAmbience } from '../src/useRoomAmbience.js';

test('explicit selected player replaces one iframe; invalid edits preserve active fallback and unloading stops it', async t => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { render, fireEvent, within, cleanup } = await import('@testing-library/react');
  t.after(() => { cleanup(); dom.window.close(); });
  const v=render(<Music />), q=within(v.container);
  assert.equal(v.container.querySelector<HTMLDetailsElement>('.music-custom')?.open,false,'custom selection stays secondary to the player');
  const id='2KpZZ1cyChx3REhma5nOv6';
  for(const kind of ['track','album','playlist']) {
    const url=`https://open.spotify.com/${kind}/${id}`;
    fireEvent.change(q.getByLabelText('Spotify link'),{target:{value:url+'?si=private'}});
    fireEvent.click(q.getByRole('button',{name:'Select music link'}));
    fireEvent.click(q.getByRole('button',{name:'Load selected Spotify player'}));
    assert.equal(v.container.querySelectorAll('iframe').length,1);
    assert.equal(v.container.querySelector('iframe')!.src,`https://open.spotify.com/embed/${kind}/${id}?utm_source=generator`);
    assert.equal(q.getByRole('link',{name:'Open in Spotify (new tab)'}).getAttribute('href'),url);
  }
  fireEvent.change(q.getByLabelText('Spotify link'),{target:{value:'https://evil.test/song'}});
  fireEvent.click(q.getByRole('button',{name:'Select music link'}));
  assert.ok(q.getByRole('alert'));
  assert.equal(q.getByRole('link',{name:'Open in Spotify (new tab)'}).getAttribute('href'),`https://open.spotify.com/playlist/${id}`,'active player always retains its fallback');
  fireEvent.click(q.getByRole('button',{name:'Unload Spotify player'}));
  assert.equal(v.container.querySelector('iframe'),null);
});

test('Music selects only exact HTTPS Spotify content links and exposes an explicit isolated launch', async t => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { render, fireEvent, within, cleanup } = await import('@testing-library/react');
  t.after(() => { cleanup(); dom.window.close(); });
  const view = render(<App />); const q = within(view.container);
  const panel = view.container.querySelector<HTMLDetailsElement>('.music-panel')!;
  assert.equal(panel.open, false, 'compact disclosure by default');
  assert.ok(panel.compareDocumentPosition(q.getByRole('timer')) & dom.window.Node.DOCUMENT_POSITION_PRECEDING, 'music stays available below the central focus timer');
  fireEvent.click(q.getByText('Music', { selector: 'summary' }));
  const input = q.getByLabelText('Spotify link');
  assert.equal(q.queryAllByRole('link', { name: 'Open in Spotify (new tab)' }).length, 0);
  const id = '0123456789ABCDEFGHIJKL';
  for (const kind of ['track', 'album', 'playlist']) {
    const url = `https://open.spotify.com/${kind}/${id}`;
    fireEvent.change(input, { target: { value: `${url}?si=SYNTHETIC#fragment` } });
    assert.equal(q.queryAllByRole('link', { name: 'Open in Spotify (new tab)' }).length, 0);
    fireEvent.click(q.getByRole('button', { name: 'Select music link' }));
    const link = q.getByRole('link', { name: 'Open in Spotify (new tab)' }) as HTMLAnchorElement;
    assert.equal(link.href, url); assert.equal(link.target, '_blank');
    assert.ok(link.relList.contains('noopener')); assert.ok(link.relList.contains('noreferrer'));
    assert.equal(link.getAttribute('referrerpolicy'), 'no-referrer');
  }
  for (const value of ['javascript:alert(1)', 'data:text/html,bad', `spotify:track:${id}`, `http://open.spotify.com/track/${id}`, `https://open.spotify.com.evil.test/track/${id}`, `https://evil.test@open.spotify.com/track/${id}`, `https://open.spotify.com@evil.test/track/${id}`, `https://u:p@open.spotify.com/track/${id}`, `https://open.spotify.com:444/track/${id}`, `https://open.spotify.com\\@evil.test/track/${id}`, `https://%6fpen.spotify.com/track/${id}`, `https://open.spotify.com/../track/${id}`, `https://open.spotify.com/track/too-short`, `https://open.spotify.com/artist/${id}`, `https://open.spotify.com/track/${id} extra`, `//open.spotify.com/track/${id}`]) {
    fireEvent.change(input, { target: { value } });
    fireEvent.click(q.getByRole('button', { name: 'Select music link' }));
    assert.equal(q.queryAllByRole('link', { name: 'Open in Spotify (new tab)' }).length, 0, value);
    assert.match(q.getByRole('alert').textContent!, /HTTPS.*open\.spotify\.com/i);
  }
  assert.equal(view.container.querySelectorAll('iframe,audio,video,img[src]').length, 0);
  assert.equal(dom.window.localStorage.length, 0);
});


test('Lock In opens music tools without a featured track or provider autoload, even with a saved choice', async t => {
  const dom = new JSDOM('<!doctype html><body></body>', {url:'http://localhost'});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
  dom.window.localStorage.setItem('studyroom.musicPrefs.v1',JSON.stringify({provider:'spotify',spotify:'https://open.spotify.com/playlist/0123456789ABCDEFGHIJKL',apple:null}));
  const rtl=await import('@testing-library/react');
  t.after(()=>{rtl.cleanup();dom.window.close();});
  const v=rtl.render(<Music lockIn activation={1}/>);
  assert.equal(!!v.container.querySelector('iframe'),false,'mode activation is not consent to load a provider');
  assert.doesNotMatch(v.container.textContent!,/AZALI|ALTERED OBSIDIAN|featured/i);
  assert.equal(v.container.querySelector<HTMLDetailsElement>('.music-panel')!.open,true);
  rtl.fireEvent.click(rtl.within(v.container).getByRole('button',{name:'Load saved Spotify player'}));
  assert.equal(v.container.querySelector('iframe')?.getAttribute('src'),'https://open.spotify.com/embed/playlist/0123456789ABCDEFGHIJKL?utm_source=generator','saved deliberate links remain manually loadable');
});


test('explicit embed selection stops room audio conservatively without claiming detected playback', async t => {
 const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const rtl=await import('@testing-library/react');t.after(()=>{rtl.cleanup();dom.window.close();});
 function Host(){const room=useRoomAmbience(false);return <><output data-testid="stopped">{String(room.preference.stopped)}</output><button onClick={room.play}>Room Play</button><Music/></>;}
 const v=rtl.render(<Host/>),q=rtl.within(v.container);
 rtl.fireEvent.change(q.getByLabelText('Spotify link'),{target:{value:'https://open.spotify.com/track/0123456789ABCDEFGHIJKL'}});
 rtl.fireEvent.click(q.getByText('Select music link'));
 assert.equal(q.getByTestId('stopped').textContent,'false','selecting a URL alone does not stop ambience');
 rtl.fireEvent.click(q.getByText('Load selected Spotify player'));
 assert.equal(q.getByTestId('stopped').textContent,'true','explicit source switch stops room audio before embed loads');
 assert.match(v.container.textContent!,/Loading does not confirm playback/);
 rtl.fireEvent.click(q.getByText('Room Play'));assert.equal(q.getByTestId('stopped').textContent,'true','selected embed must be unloaded before resuming');
 rtl.fireEvent.click(q.getByText('Unload Spotify player'));
 assert.equal(q.getByTestId('stopped').textContent,'true','unload does not auto resume');
 rtl.fireEvent.click(q.getByText('Room Play'));assert.equal(q.getByTestId('stopped').textContent,'false');
});
