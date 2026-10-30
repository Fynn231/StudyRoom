import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {JSDOM} from 'jsdom';
import {App} from '../src/App.js';
import {AuthProvider} from '../src/auth.js';
import {AuthGate} from '../src/AuthGate.js';
test('hosted Plan session and Define protocol each send one explicit AI request; Home preserves work',async t=>{
 const dom=new JSDOM('<html><body></body></html>',{url:'https://study.example'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true});
 const requests:any[]=[];let limited=false;const original=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{
  if(String(input)==='/api/config')return Response.json({mode:'hosted',auth:{required:true,url:'https://synthetic.invalid',anonKey:'sb_publishable_synthetic',publicOrigin:'https://study.example'}});
  if(String(input)==='/api/session')return Response.json({ok:true});
  if(String(input)==='/api/ai/status')return Response.json({configured:true,liveVerified:false});
  if(String(input)==='/api/ai/plan'){const request=JSON.parse(String(init?.body));requests.push(request);if(limited)return Response.json({error:'Rate limited'},{status:429});return Response.json({requestId:request.requestId,plan:{objectives:['Review'],steps:[{title:'Explain one idea',instructions:'Write one explanation.',estimatedMinutes:5,sourceIds:[request.sources[0].id]}],questions:[]}});}
  return Response.json({});
 };
 const session={user:{id:'synthetic',email:'synthetic@example.invalid',user_metadata:{}},access_token:'synthetic',expires_at:Math.floor(Date.now()/1000)+3600};
 const factory=()=>({auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),dispose:async()=>{}}}) as any;
 const rtl=await import('@testing-library/react');t.after(()=>{rtl.cleanup();globalThis.fetch=original;dom.window.close();});
 const view=rtl.render(<AuthProvider clientFactory={factory}><AuthGate><App/></AuthGate></AuthProvider>),q=rtl.within(view.container);
 await rtl.waitFor(()=>assert.ok(q.getByRole('button',{name:'Plan session'})));
 rtl.fireEvent.change(q.getByLabelText('Your session intention'),{target:{value:'Review one chapter'}});assert.equal(requests.length,0,'typing is private');
 rtl.fireEvent.click(q.getByRole('button',{name:'Plan session'}));await rtl.waitFor(()=>assert.ok(q.getByRole('button',{name:'Use reviewed plan'})));assert.equal(requests.length,1);assert.equal(requests[0].intention.goal,'Review one chapter');assert.equal(requests[0].intention.mode,'Steps');
 rtl.fireEvent.click(q.getByRole('button',{name:'Use reviewed plan'}));rtl.fireEvent.click(q.getByRole('checkbox',{name:'Explain one idea'}));
 const draft=q.getByLabelText('Your session intention'),timer=q.getByRole('timer');
 rtl.fireEvent.click(q.getByRole('button',{name:'Home'}));assert.ok(q.getByRole('button',{name:'Continue last session'}));assert.equal(requests.length,1,'Home never sends AI');rtl.fireEvent.click(q.getByRole('button',{name:'Skip welcome'}));assert.equal(q.getByLabelText('Your session intention'),draft);assert.equal(q.getByRole('timer'),timer);assert.equal((q.getByRole('checkbox',{name:'Explain one idea'}) as HTMLInputElement).checked,true);
 for(let i=0;i<5;i++)rtl.fireEvent.click(q.getByRole('button',{name:'study room'}));
 assert.equal(requests.length,1,'theme changes never send AI');limited=true;rtl.fireEvent.click(q.getByRole('button',{name:'Define protocol'}));await rtl.waitFor(()=>assert.match(q.getByRole('alert').textContent??'',/rate-limited/));assert.equal(requests.length,2);assert.equal((q.getByRole('checkbox',{name:'Explain one idea'}) as HTMLInputElement).checked,true,'failed direct planning retains progress');
 rtl.fireEvent.click(q.getByRole('button',{name:'Exit Lock In Mode'}));assert.equal(requests.length,2);assert.equal(q.getByRole('timer').textContent,'25:00');
});
