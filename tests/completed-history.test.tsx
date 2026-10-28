import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {JSDOM} from 'jsdom';
import {CompletedSessions} from '../src/CompletedSessions.js';
import {SESSIONS_KEY,saveSession,rateSession} from '../src/sessionRecords.js';

test('completed history reads saved cycles and updated ratings without writing or exposing private content',async t=>{
 const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true});
 const {render,fireEvent,within,waitFor,cleanup}=await import('@testing-library/react');t.after(()=>{cleanup();dom.window.close();});
 saveSession({id:'cycle',completedAt:'2026-10-28T12:00:00Z',focusedMs:60000,plannedMs:60000,stepsDone:1,stepsTotal:2,rating:null,focusRating:null},dom.window.localStorage);
 const view=render(<CompletedSessions changeToken=""/>),q=within(view.container);
 const details=view.container.querySelector('details')!;details.open=true;fireEvent(details,new dom.window.Event('toggle'));
 await waitFor(()=>assert.ok(q.getByRole('list',{name:'Completed timer sessions'})));
 assert.match(view.container.textContent!,/1 min focused/);
 rateSession('cycle',4,null,dom.window.localStorage);view.rerender(<CompletedSessions changeToken="cycle"/>);
 await waitFor(()=>assert.match(view.container.textContent!,/Experience: 4\/5/));
 const saved=dom.window.localStorage.getItem(SESSIONS_KEY);dom.window.localStorage.setItem(SESSIONS_KEY,'invalid');
 fireEvent(window,new dom.window.StorageEvent('storage',{key:SESSIONS_KEY}));
 await waitFor(()=>assert.match(q.getByRole('alert').textContent!,/preserved/));assert.equal(dom.window.localStorage.getItem(SESSIONS_KEY),'invalid');assert.ok(saved);
});
