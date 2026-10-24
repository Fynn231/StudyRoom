import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {JSDOM} from 'jsdom';
import {StudyProgress,SaveStudyPlan} from '../src/StudyProgress.js';
import {snapshotPlan,STUDY_PLANS_KEY,parseSavedPlans,writeSavedPlans,SAVED_LIMITS,type PlanDraft} from '../src/savedStudyStore.js';
const draft:PlanDraft={title:'Same title',kind:'ai',objectives:['Reviewed objective'],steps:[{title:'Explain <img src=x onerror=alert(1)>',instructions:'Reviewed instructions',minutes:5,done:false}]};

test('quota errors are visible outside collapsed library, preserve original and never claim saved',async t=>{
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const {render,fireEvent,within,cleanup}=await import('@testing-library/react');t.after(()=>{cleanup();dom.window.close();});
 dom.window.Storage.prototype.setItem=function(){throw new dom.window.DOMException('Synthetic quota full','QuotaExceededError');};
 const view=render(<StudyProgress commitment="" onChoose={()=>{}}><SaveStudyPlan draft={draft}/></StudyProgress>),q=within(view.container);
 fireEvent.click(q.getByRole('button',{name:'Save on this device'}));
 assert.equal(!!q.getByRole('alert').closest('details'),false,'failed Save must be visible while library is collapsed');
 assert.equal(dom.window.localStorage.length,0);assert.equal(!!q.queryByText(/Copy saved\./),false);
});

test('unreadable library fails closed, does not offer stale copies or overwrite damaged value',async t=>{
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const {render,fireEvent,within,cleanup}=await import('@testing-library/react');t.after(()=>{cleanup();dom.window.close();});
 dom.window.localStorage.setItem(STUDY_PLANS_KEY,JSON.stringify({version:1,plans:[snapshotPlan(draft)]}));
 const view=render(<StudyProgress commitment="" onChoose={()=>{}}><SaveStudyPlan draft={draft}/></StudyProgress>),q=within(view.container);
 fireEvent.click(q.getByText('Saved study plans',{selector:'summary'}));assert.ok(q.getByRole('button',{name:'Resume plan'}));
 dom.window.localStorage.setItem(STUDY_PLANS_KEY,'{CORRUPT_ORIGINAL');fireEvent.click(q.getByRole('button',{name:'Reload saved library'}));
 assert.equal(!!q.queryByRole('button',{name:'Resume plan'}),false);
 fireEvent.click(q.getByRole('button',{name:'Save on this device'}));assert.equal(dom.window.localStorage.getItem(STUDY_PLANS_KEY),'{CORRUPT_ORIGINAL');assert.equal(q.queryByText('Plan saved on this device.'),null);
});

test('bounded strict versioned allowlist, duplicates and malformed entries never normalize silently',()=>{
 const plan=snapshotPlan({...draft,source:{excerpt:'NO'},answers:['NO'],token:'NO'} as PlanDraft);const raw=JSON.stringify({version:1,plans:[plan]});assert.equal(raw.includes('NO'),false);assert.deepEqual(parseSavedPlans(raw).plans,[plan]);
 const bad:any[]=[null,[],{}, {version:2,plans:[]},{version:1,plans:[],unknown:1},{version:1,plans:[plan,plan]}, {version:1,plans:Array(21).fill(plan)}];
 for(const patch of [{title:'x'.repeat(241)},{objectives:Array(9).fill('x')},{steps:[]},{steps:Array(13).fill(plan.steps[0])},{steps:[{...plan.steps[0],title:'x'.repeat(241)}]},{steps:[{...plan.steps[0],instructions:'x'.repeat(2001)}]},{steps:[{...plan.steps[0],minutes:0}]},{steps:[{...plan.steps[0],minutes:1.5}]},{steps:[{...plan.steps[0],done:'true'}]},{steps:[{...plan.steps[0],sourceIds:['secret']}]},{id:'source-id'},{createdAt:-1},{createdAt:Number.MAX_SAFE_INTEGER,updatedAt:Number.MAX_SAFE_INTEGER},{updatedAt:0},{keepUpdated:null},{source:'secret'}])bad.push({version:1,plans:[{...plan,...patch}]});
 for(const value of bad)assert.throws(()=>parseSavedPlans(JSON.stringify(value)));for(const value of ['broken','x'.repeat(SAVED_LIMITS.payload+1)])assert.throws(()=>parseSavedPlans(value));
 const other=snapshotPlan(draft);assert.notEqual(other.id,plan.id);assert.notEqual(other.steps[0].id,plan.steps[0].id);assert.equal(parseSavedPlans(JSON.stringify({version:1,plans:[plan,other]})).plans.length,2);
});

test('per-plan opt-out stops writes, distinguishes in-tab progress; deletion is isolated and storage events invalidate resumed copies',async t=>{
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});dom.window.confirm=()=>true;
 const {render,fireEvent,within,cleanup,act}=await import('@testing-library/react');t.after(()=>{cleanup();dom.window.close();});
 dom.window.localStorage.setItem('separate-history-key','REFLECTION');
 const view=render(<StudyProgress commitment="existing" onChoose={()=>{}}><SaveStudyPlan draft={draft}/></StudyProgress>),q=within(view.container);
 fireEvent.click(q.getByRole('button',{name:'Save on this device'}));fireEvent.click(q.getByRole('button',{name:'Save another copy on this device'}));
 fireEvent.click(q.getByText('Saved study plans',{selector:'summary'}));assert.equal(q.getAllByRole('button',{name:'Resume plan'}).length,2);
 fireEvent.click(q.getAllByRole('button',{name:'Resume plan'})[0]);
 fireEvent.click(q.getByRole('checkbox',{name:'Keep completion updated on this device for this plan'}));
 const before=dom.window.localStorage.getItem(STUDY_PLANS_KEY);fireEvent.click(q.getByRole('checkbox',{name:draft.steps[0].title}));
 assert.equal(dom.window.localStorage.getItem(STUDY_PLANS_KEY),before);assert.ok(q.getByText('1/1 steps done in this tab only'));
 fireEvent.click(q.getByRole('checkbox',{name:'Keep completion updated on this device for this plan'}));assert.equal(parseSavedPlans(dom.window.localStorage.getItem(STUDY_PLANS_KEY)).plans[0].steps[0].done,true);
 fireEvent.click(q.getAllByRole('button',{name:'Delete saved plan'})[0]);assert.equal(!!q.queryByRole('region',{name:'Resumed saved study plan'}),false);assert.equal(parseSavedPlans(dom.window.localStorage.getItem(STUDY_PLANS_KEY)).plans.length,1);assert.equal(dom.window.localStorage.getItem('separate-history-key'),'REFLECTION');
 fireEvent.click(q.getByRole('button',{name:'Resume plan'}));
 await act(async()=>{dom.window.localStorage.removeItem(STUDY_PLANS_KEY);dom.window.dispatchEvent(new dom.window.StorageEvent('storage',{key:STUDY_PLANS_KEY}));});
 assert.equal(!!q.queryByRole('region',{name:'Resumed saved study plan'}),false);assert.ok(q.getByText(/Saved plans changed in another tab/));
 fireEvent.click(q.getByRole('button',{name:'Save another copy on this device'}));fireEvent.click(q.getByRole('button',{name:'Clear saved study plans'}));assert.equal(dom.window.localStorage.getItem(STUDY_PLANS_KEY),null);assert.equal(dom.window.localStorage.getItem('separate-history-key'),'REFLECTION');
});

test('storage read/write/delete failures, compare-before-write and isolation are real failures, never success',()=>{
 const map=new Map<string,string>([['unrelated','reflection-history']]);const s={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>map.set(k,v),removeItem:(k:string)=>map.delete(k)} as unknown as Storage;const p=snapshotPlan(draft);
 const raw=writeSavedPlans(s,null,[p]);assert.equal(map.get('unrelated'),'reflection-history');assert.throws(()=>writeSavedPlans(s,null,[p]),/another tab/);assert.equal(writeSavedPlans(s,raw,[]),null);assert.equal(map.get('unrelated'),'reflection-history');
 for(const method of ['getItem','setItem','removeItem'] as const){const broken={...s,[method]:()=>{throw Error('INJECTED '+method);}};assert.throws(()=>writeSavedPlans(broken as Storage,null,method==='removeItem'?[]:[p]),/INJECTED/);}
 map.set(STUDY_PLANS_KEY,'{BAD');assert.throws(()=>writeSavedPlans(s,'{BAD',[p]));assert.equal(map.get(STUDY_PLANS_KEY),'{BAD');
});
