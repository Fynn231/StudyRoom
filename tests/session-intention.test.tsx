import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { App } from '../src/App.js';
import { GoalNotes } from '../src/GoalNotesPanel.js';

test('imported roadmaps use the same bounded editor without losing source identity or mutating saved copies', async t => {
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,FileReader:dom.window.FileReader,ArrayBuffer:dom.window.ArrayBuffer,IS_REACT_ACT_ENVIRONMENT:true});
 const original=globalThis.fetch;globalThis.fetch=(async()=>new Response(JSON.stringify({configured:false,liveVerified:false}))) as typeof fetch;
 const {render,fireEvent,within,waitFor,cleanup}=await import('@testing-library/react');t.after(()=>{cleanup();dom.window.close();globalThis.fetch=original;});
 const v=render(<GoalNotes commitment="" onChoose={()=>{}}/>),q=within(v.container);fireEvent.click(q.getByText('Goals / notes',{selector:'summary'}));fireEvent.change(q.getByLabelText('Choose Markdown notes'),{target:{files:[new dom.window.File(['# Outcome\n- [ ] First real task\n- [ ] Second real task'],'original.md')]}});
 await waitFor(()=>assert.ok(q.getByRole('button',{name:'Build session roadmap'})));fireEvent.click(q.getByRole('button',{name:'Build session roadmap'}));
 const panel=within(v.container.querySelector<HTMLElement>('.roadmap-panel')!);const first=v.container.querySelector('.roadmap-step')!.getAttribute('data-step-id');
 fireEvent.click(panel.getByText('Edit step 1',{selector:'summary'}));fireEvent.change(panel.getByRole('textbox',{name:'Step 1 title'}),{target:{value:'Reviewed task title'}});
 fireEvent.change(panel.getByRole('textbox',{name:'Step 1 checkpoint / benchmark'}),{target:{value:'Record one checked result'}});
 fireEvent.click(panel.getByRole('button',{name:'Move step 1 down'}));assert.equal(v.container.querySelectorAll('.roadmap-step')[1].getAttribute('data-step-id'),first);
 assert.ok(panel.getByText(/Source excerpt: First real task/));
 fireEvent.click(panel.getByRole('button',{name:'Save on this device'}));const raw=dom.window.localStorage.getItem('study-room.saved-study-plans.v1')!;
 for(let i=0;i<10;i++)fireEvent.click(panel.getByRole('button',{name:'Add step'}));assert.equal(v.container.querySelectorAll('.roadmap-step').length,12);assert.equal((panel.getByRole('button',{name:'Add step'}) as HTMLButtonElement).disabled,true);
 fireEvent.change(panel.getByRole('textbox',{name:'Step 2 title'}),{target:{value:'  '}});assert.equal((panel.getByRole('button',{name:'Save another copy on this device'}) as HTMLButtonElement).disabled,true);
 assert.equal(dom.window.localStorage.getItem('study-room.saved-study-plans.v1'),raw);
});

test('edit, reorder, add/remove and done/undo preserve focus and save a separate resumable copy', async t => {
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const {render,fireEvent,within,cleanup}=await import('@testing-library/react');t.after(()=>{cleanup();dom.window.close();});
 let v=render(<App/>),q=within(v.container);
 fireEvent.change(q.getByRole('textbox',{name:'Your session intention'}),{target:{value:'One concrete outcome'}});
 fireEvent.click(q.getByRole('button',{name:'Plan session'}));fireEvent.click(q.getByRole('button',{name:'Steps'}));
 const plan=within(v.container.querySelector<HTMLElement>('.session-plan')!);
 fireEvent.click(plan.getByText('Edit step 1',{selector:'summary'}));
 const title=plan.getByRole('textbox',{name:'Step 1 title'});title.focus();
 fireEvent.change(title,{target:{value:'Solve one example'}});assert.equal(document.activeElement,title);
 fireEvent.change(plan.getByRole('textbox',{name:'Step 1 checkpoint / benchmark'}),{target:{value:'One worked answer checked against notes'}});
 fireEvent.click(plan.getByRole('button',{name:'Move step 1 down'}));
 assert.equal((plan.getByRole('textbox',{name:'Step 2 title'}) as HTMLInputElement).value,'Solve one example');
 fireEvent.click(plan.getByRole('button',{name:'Move step 2 up'}));
 fireEvent.click(plan.getByRole('button',{name:'Add step'}));assert.equal(v.container.querySelectorAll('.session-plan .roadmap-step').length,4);
 fireEvent.click(plan.getByRole('button',{name:'Remove step 4'}));assert.equal(v.container.querySelectorAll('.session-plan .roadmap-step').length,3);
 fireEvent.click(q.getByRole('checkbox',{name:'Enable focus chime'}));fireEvent.click(q.getByRole('button',{name:'Start focus'}));
 fireEvent.click(plan.getByRole('checkbox',{name:'Solve one example'}));fireEvent.click(plan.getByRole('checkbox',{name:'Solve one example'}));fireEvent.click(plan.getByRole('checkbox',{name:'Solve one example'}));
 assert.ok(q.getByRole('button',{name:'Pause focus'}));assert.equal(dom.window.localStorage.length,0);
 fireEvent.click(plan.getByRole('button',{name:'Save on this device'}));
 const raw=dom.window.localStorage.getItem('study-room.saved-study-plans.v1')!;const saved=JSON.parse(raw).plans[0];
 assert.equal(saved.steps[0].title,'Solve one example');assert.equal(saved.steps[0].instructions,'One worked answer checked against notes');assert.equal(saved.steps[0].done,true);
 fireEvent.change(title,{target:{value:'Later source edit'}});assert.equal(dom.window.localStorage.getItem('study-room.saved-study-plans.v1'),raw);
 v.unmount();v=render(<App/>);q=within(v.container);fireEvent.click(q.getByText('Saved study plans',{selector:'summary'}));fireEvent.click(q.getByRole('button',{name:'Resume plan'}));
 assert.ok(q.getByRole('checkbox',{name:'Solve one example'}));assert.ok(q.getByText('One worked answer checked against notes'));
 assert.equal((q.getByRole('checkbox',{name:'Solve one example'}) as HTMLInputElement).checked,true);
});

test('time allocation uses the custom focus duration; benchmarks are editable targets and replacement is deliberate', async t => {
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const {render,fireEvent,within,cleanup}=await import('@testing-library/react');t.after(()=>{cleanup();dom.window.close();});
 const v=render(<App/>),q=within(v.container);fireEvent.change(q.getByRole('textbox',{name:'Your session intention'}),{target:{value:'Review chemistry'}});fireEvent.change(q.getByRole('spinbutton',{name:'Focus length'}),{target:{value:'7'}});
 fireEvent.click(q.getByRole('button',{name:'Plan session'}));fireEvent.click(q.getByRole('button',{name:'Time allocation'}));
 let panel=within(v.container.querySelector<HTMLElement>('.session-plan')!);
 const allocated=panel.getAllByRole('spinbutton',{name:/allocated minutes/,hidden:true}) as HTMLInputElement[];
 assert.equal(allocated.reduce((n,e)=>n+Number(e.value),0),7);
 let confirms=0;dom.window.confirm=()=>{confirms++;return false;};
 fireEvent.click(q.getByRole('button',{name:'Plan session'}));fireEvent.click(q.getByRole('button',{name:'Benchmarks'}));assert.equal(confirms,1);
 assert.equal((panel.getAllByRole('spinbutton',{name:/allocated minutes/,hidden:true}) as HTMLInputElement[]).reduce((n,e)=>n+Number(e.value),0),7);
 dom.window.confirm=()=>true;fireEvent.click(q.getByRole('button',{name:'Benchmarks'}));
 assert.ok(panel.getByText('Write 1 sentence naming the result you want.',{selector:'p'}));
 assert.ok(panel.getByText('Produce 1 example, answer or small artifact to review.',{selector:'p'}));
 assert.equal(dom.window.localStorage.length,0);assert.ok(q.getByRole('button',{name:'Start focus'}));
 fireEvent.click(q.getByRole('button',{name:'Plan session'}));fireEvent.click(q.getByRole('button',{name:'Skip'}));assert.equal(v.container.querySelectorAll('.session-plan .roadmap-step').length,3);
});

test('resumed copy edits are staged until explicit save and retain saved identity and completion', async t => {
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const {render,fireEvent,within,cleanup}=await import('@testing-library/react');t.after(()=>{cleanup();dom.window.close();});
 let v=render(<App/>),q=within(v.container);fireEvent.change(q.getByRole('textbox',{name:'Your session intention'}),{target:{value:'Work on one outcome'}});fireEvent.click(q.getByRole('button',{name:'Plan session'}));fireEvent.click(q.getByRole('button',{name:'Steps'}));fireEvent.click(q.getByRole('button',{name:'Save on this device'}));
 fireEvent.click(q.getByText('Saved study plans',{selector:'summary'}));fireEvent.click(q.getByRole('button',{name:'Resume plan'}));
 const resumed=within(v.container.querySelector<HTMLElement>('.resumed-study-plan')!);fireEvent.click(resumed.getAllByRole('checkbox')[1]);
 const raw=dom.window.localStorage.getItem('study-room.saved-study-plans.v1')!,before=JSON.parse(raw).plans[0];
 fireEvent.click(resumed.getByRole('button',{name:'Edit saved plan'}));fireEvent.click(resumed.getByText('Edit step 1',{selector:'summary'}));fireEvent.change(resumed.getByRole('textbox',{name:'Step 1 title'}),{target:{value:'A revised saved step'}});fireEvent.change(resumed.getByRole('textbox',{name:'Step 1 checkpoint / benchmark'}),{target:{value:'One checked result'}});fireEvent.click(resumed.getByRole('button',{name:'Move step 1 down'}));assert.equal(dom.window.localStorage.getItem('study-room.saved-study-plans.v1'),raw);
 fireEvent.click(resumed.getByRole('button',{name:'Save plan edits on this device'}));const after=JSON.parse(dom.window.localStorage.getItem('study-room.saved-study-plans.v1')!).plans[0];assert.equal(after.id,before.id);assert.equal(after.steps[1].id,before.steps[0].id);assert.equal(after.steps[1].done,true);
 v.unmount();v=render(<App/>);q=within(v.container);fireEvent.click(q.getByText('Saved study plans',{selector:'summary'}));fireEvent.click(q.getByRole('button',{name:'Resume plan'}));assert.equal((q.getByRole('checkbox',{name:'A revised saved step'}) as HTMLInputElement).checked,true);assert.ok(q.getByText('One checked result'));
});

test('Enter opens optional local assistance, never focus; Shift+Enter and composition stay in the draft', async t => {
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const {render,fireEvent,within,cleanup}=await import('@testing-library/react');
 t.after(()=>{cleanup();dom.window.close();});
 const v=render(<App/>),q=within(v.container),draft=q.getByRole('textbox',{name:'Your session intention'});
 fireEvent.keyDown(draft,{key:'Enter'});
 assert.ok(q.getByRole('alert').textContent?.includes('1–240'));
 fireEvent.change(draft,{target:{value:'Review one concept'}});
 fireEvent.keyDown(draft,{key:'Enter',shiftKey:true});
 assert.equal(q.queryByRole('group',{name:'Optional planning help'}),null);
 fireEvent.keyDown(draft,{key:'Enter',isComposing:true});
 assert.equal(q.queryByRole('group',{name:'Optional planning help'}),null);
 fireEvent.keyDown(draft,{key:'Enter'});
 for(const name of ['Steps','Benchmarks','Time allocation','Skip'])assert.ok(q.getByRole('button',{name}));
 assert.equal(v.container.querySelectorAll('.roadmap-step').length,0);
 assert.ok(q.getByRole('button',{name:'Start focus'}));assert.equal(q.getByRole('timer').textContent,'25:00');
 assert.equal(dom.window.localStorage.length,0);
 fireEvent.click(q.getByRole('button',{name:'Skip'}));
 assert.equal(q.queryByRole('group',{name:'Optional planning help'}),null);
 assert.equal((draft as HTMLTextAreaElement).value,'Review one concept');
 fireEvent.click(q.getByRole('button',{name:'Plan session'}));assert.ok(q.getByRole('group',{name:'Optional planning help'}));
 fireEvent.click(q.getByRole('button',{name:'Steps'}));assert.equal(v.container.querySelectorAll('.session-plan .roadmap-step').length,3);
 assert.ok(q.getByText(/Editable starting structure/));assert.equal(q.getByRole('timer').textContent,'25:00');
 assert.equal(dom.window.localStorage.length,0);
});
