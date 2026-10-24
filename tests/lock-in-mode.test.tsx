import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { App } from '../src/App.js';

async function setup(t: { after: (fn: () => void) => void }, stored?: string, broken = false) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  if (stored) dom.window.sessionStorage.setItem('studyroom.lockIn', stored);
  if (broken) Object.defineProperty(dom.window, 'sessionStorage', { get() { throw Error('denied'); } });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const rtl = await import('@testing-library/react');
  t.after(() => { rtl.cleanup(); dom.window.close(); });
  const view = rtl.render(<React.StrictMode><App /></React.StrictMode>);
  return { ...rtl, ...view, dom, q: rtl.within(view.container), locked: () => view.container.querySelector('.room-backdrop')!.classList.contains('lock-in-mode') };
}

test('secret rejects repeat, composition, modifiers, text entry and interrupted sequences', async t => {
  const v = await setup(t);
  assert.equal(v.container.querySelector('iframe'), null);
  assert.equal(v.dom.window.sessionStorage.length,0,'fresh default writes no mode preference');
  for (const flags of [{ repeat: true }, { isComposing: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }]) {
    for (let i=0;i<5;i++) v.fireEvent.keyDown(v.dom.window.document,{key:'l',...flags});
    assert.equal(v.locked(),false,JSON.stringify(flags));
  }
  for(let i=0;i<5;i++) v.fireEvent.keyDown(v.q.getByLabelText('Your session intention'),{key:'l'});
  assert.equal(v.locked(),false);
  for (const html of ['<select><option>Learning</option></select>', '<div contenteditable="true"><span>Draft</span></div>']) {
    const host=v.dom.window.document.createElement('div');host.innerHTML=html;v.dom.window.document.body.append(host);
    for(let i=0;i<5;i++)v.fireEvent.keyDown(host.querySelector('span,select')!,{key:'l'});
    assert.equal(v.locked(),false,'editable descendants and selects are not secret commands');host.remove();
  }
  for(const key of ['l','l','x','l','l','l']) v.fireEvent.keyDown(v.dom.window.document,{key});
  assert.equal(v.locked(),false);
});

test('deliberate keyboard reveal loads exact official player; explicit exit preserves draft and running clock', async t => {
  const v = await setup(t);
  v.fireEvent.change(v.q.getByLabelText('Your session intention'),{target:{value:'Keep my work'}});
  v.fireEvent.click(v.q.getByRole('button',{name:'Start focus'}));
  for(let i=0;i<5;i++) v.fireEvent.keyDown(v.dom.window.document,{key:'l'});
  assert.equal(v.locked(),true);
  await v.waitFor(()=>assert.equal(v.container.querySelector('iframe')?.getAttribute('src'),'https://open.spotify.com/embed/track/2KpZZ1cyChx3REhma5nOv6?utm_source=generator'));
  assert.ok(v.q.getByRole('link',{name:'Open in Spotify (new tab)'}));
  v.fireEvent.click(v.q.getByRole('button',{name:'Exit Lock In Mode'}));
  assert.equal(v.locked(),false);
  assert.equal((v.q.getByLabelText('Your session intention') as HTMLTextAreaElement).value,'Keep my work');
  assert.ok(v.container.querySelector('[data-action="pause"]'),'running control remains available under locked copy');
  assert.equal(v.container.querySelector('iframe'),null);
});

test('five wordmark taps reveal without navigation; Escape exits', async t => {
  const v = await setup(t);
  const brand=v.q.getByRole('button',{name:'study room'});
  for(let i=0;i<5;i++) v.fireEvent.click(brand);
  assert.equal(v.locked(),true);
  v.fireEvent.keyDown(v.dom.window.document,{key:'Escape'});
  assert.equal(v.locked(),false);
});

test('StrictMode restores deliberate preference without contacting Spotify; storage denial remains usable', async t => {
  const v = await setup(t,'1');
  assert.equal(v.locked(),true);
  assert.equal(v.dom.window.sessionStorage.getItem('studyroom.lockIn'),'1');
  assert.equal(v.container.querySelector('iframe'),null,'reload is not fresh provider consent');
  v.fireEvent.click(v.q.getByRole('button',{name:'Exit Lock In Mode'}));
  assert.equal(v.dom.window.sessionStorage.getItem('studyroom.lockIn'),'0');
});

test('unavailable session storage does not block activation or exit', async t => {
  const v=await setup(t,undefined,true);
  for(let i=0;i<5;i++) v.fireEvent.keyDown(v.dom.window.document,{key:'l'});
  assert.equal(v.locked(),true);
  v.fireEvent.click(v.q.getByRole('button',{name:'Exit Lock In Mode'}));
  assert.equal(v.locked(),false);
});
