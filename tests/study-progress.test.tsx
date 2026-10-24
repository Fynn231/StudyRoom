import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { GoalNotes } from '../src/GoalNotesPanel.js';

test('explicit snapshot opt-in, independent saved copy survives source clear and reload; resume updates progress', async t => {
 const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost' });
 Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, FileReader: dom.window.FileReader, ArrayBuffer: dom.window.ArrayBuffer, IS_REACT_ACT_ENVIRONMENT: true });
 const original = globalThis.fetch; let requests = 0; globalThis.fetch = (async () => { requests++; return new Response(JSON.stringify({configured:false,liveVerified:false})); }) as typeof fetch;
 const {render,fireEvent,within,waitFor,cleanup} = await import('@testing-library/react');
 t.after(()=>{cleanup();dom.window.close();globalThis.fetch=original;});
 let writes=0; const set=dom.window.Storage.prototype.setItem; dom.window.Storage.prototype.setItem=function(k,v){writes++;set.call(this,k,v);};
 let chosen=''; let view=render(<GoalNotes commitment="" onChoose={s=>{chosen=s;}}/>); let q=within(view.container);
 fireEvent.click(q.getByText('Saved study plans',{selector:'summary'}));
 assert.ok(q.getByText('No saved study plans yet.')); assert.equal(writes,0); assert.equal(requests,0);
 fireEvent.click(q.getByText('Goals / notes',{selector:'summary'}));
 fireEvent.change(q.getByLabelText('Choose Markdown notes'),{target:{files:[new dom.window.File(['# Private\nRAW_NOT_TO_SAVE\n- [ ] Explain <b>light</b>'],'SECRET_FILENAME.md')]}});
 await waitFor(()=>assert.ok(q.getByRole('button',{name:'Build session roadmap'})));
 fireEvent.click(q.getByRole('button',{name:'Build session roadmap'})); assert.equal(writes,0);
 fireEvent.click(q.getByRole('button',{name:'Save on this device'})); assert.equal(writes,1);
 const raw=dom.window.localStorage.getItem('study-room.saved-study-plans.v1')!;
 assert.ok(raw.includes('Explain <b>light</b>')); for(const token of ['RAW_NOT_TO_SAVE','SECRET_FILENAME','source','excerpt','file-0:']) assert.ok(!raw.includes(token),token);
 fireEvent.click(q.getByRole('button',{name:'Clear imported notes'})); assert.ok(q.getByRole('button',{name:'Resume plan'}));
 view.unmount(); view=render(<GoalNotes commitment="" onChoose={s=>{chosen=s;}}/>); q=within(view.container);
 fireEvent.click(q.getByText('Saved study plans',{selector:'summary'}));
 fireEvent.click(q.getByRole('button',{name:'Resume plan'}));
 assert.ok(q.getByText(/Original source documents are not loaded or stored/));
 assert.equal(document.activeElement?.getAttribute('data-resumed-heading'),'true','Resume deliberately moves keyboard focus to the saved copy');
 fireEvent.click(q.getByRole('checkbox',{name:'Explain <b>light</b>'})); assert.ok(q.getByText('1/1 saved steps done'));
 fireEvent.click(q.getByRole('button',{name:'Use saved step as private intention'}));assert.equal(chosen,'Explain <b>light</b>');assert.equal(view.container.querySelector('b'),null);
 view.unmount(); view=render(<GoalNotes commitment="" onChoose={()=>{}}/>);q=within(view.container);fireEvent.click(q.getByText('Saved study plans',{selector:'summary'}));fireEvent.click(q.getByRole('button',{name:'Resume plan'}));assert.ok(q.getByText('1/1 saved steps done'));
 assert.equal(requests,0); // import, render, save and restore never make even a status request
});

test('AI snapshots exclude provenance/questions/answers and refinement never overwrites saved progress',async t=>{
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,FileReader:dom.window.FileReader,ArrayBuffer:dom.window.ArrayBuffer,IS_REACT_ACT_ENVIRONMENT:true});
 const original=globalThis.fetch;let calls=0;globalThis.fetch=(async(_url:unknown,o?:RequestInit)=>{if(!o?.body)return new Response(JSON.stringify({configured:true,liveVerified:false}));calls++;const r=JSON.parse(o.body as string);return new Response(JSON.stringify({requestId:r.requestId,plan:{objectives:['Synthetic objective '+calls],steps:[{title:'Same step title',instructions:calls===1?'Original reviewed instructions':'New refined instructions',estimatedMinutes:3,sourceIds:[r.sources[0].id]}],questions:[{question:'PRIVATE_QUESTION',sourceIds:[r.sources[0].id]}]}}));}) as typeof fetch;
 const {render,fireEvent,within,waitFor,cleanup}=await import('@testing-library/react');t.after(()=>{cleanup();dom.window.close();globalThis.fetch=original;});
 const view=render(<GoalNotes commitment="" onChoose={()=>{}}/>),q=within(view.container);fireEvent.click(q.getByText('Goals / notes',{selector:'summary'}));fireEvent.change(q.getByLabelText('Choose Markdown notes'),{target:{files:[new dom.window.File(['# Synthetic\nPRIVATE_RAW_PASSAGE'],'PRIVATE_FILENAME.md')]}});await waitFor(()=>assert.ok(view.container.querySelector('.ai-study')));
 const ai=within(view.container.querySelector<HTMLElement>('.ai-study')!);fireEvent.click(ai.getByText('Choose excerpts for AI',{selector:'summary'}));fireEvent.click(ai.getAllByRole('checkbox')[0]);fireEvent.click(ai.getByRole('button',{name:'Generate AI study plan'}));await waitFor(()=>assert.ok(ai.getByText('Original reviewed instructions')));fireEvent.click(ai.getByRole('checkbox',{name:'Same step title'}));fireEvent.click(ai.getByRole('button',{name:'Save on this device'}));
 const first=dom.window.localStorage.getItem('study-room.saved-study-plans.v1')!;for(const marker of ['PRIVATE_QUESTION','PRIVATE_RAW_PASSAGE','PRIVATE_FILENAME','sourceIds','questions','answers'])assert.equal(first.includes(marker),false,marker);
 fireEvent.click(ai.getByText('Optional AI questions',{selector:'summary'}));fireEvent.change(ai.getByLabelText('PRIVATE_QUESTION'),{target:{value:'PRIVATE_ANSWER'}});fireEvent.click(ai.getByRole('button',{name:'Refine AI plan with answers'}));await waitFor(()=>assert.ok(ai.getByText('New refined instructions')));assert.equal(dom.window.localStorage.getItem('study-room.saved-study-plans.v1'),first);assert.ok(ai.getByText('0/1 AI steps done'));
 fireEvent.click(ai.getByRole('button',{name:'Save on this device'}));const stored=JSON.parse(dom.window.localStorage.getItem('study-room.saved-study-plans.v1')!);assert.equal(stored.plans.length,2);assert.notEqual(stored.plans[0].id,stored.plans[1].id);assert.equal(stored.plans[0].steps[0].done,true);assert.equal(stored.plans[1].steps[0].done,false);assert.equal(stored.plans[0].steps[0].instructions,'Original reviewed instructions');assert.equal(stored.plans[1].steps[0].instructions,'New refined instructions');assert.equal(JSON.stringify(stored).includes('PRIVATE_ANSWER'),false);assert.equal(calls,2);
});
