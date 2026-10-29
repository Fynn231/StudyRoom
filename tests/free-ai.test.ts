import {test} from 'node:test';import assert from 'node:assert/strict';import {inferFree} from '../server/freeAi.js';
const request={requestId:'11111111-1111-4111-8111-111111111111',budgetMinutes:5,sources:[{id:'22222222-2222-4222-8222-222222222222',text:'Study one section'}],answers:[]};
const plan={objectives:['Understand the section'],steps:[{title:'Explain one idea',instructions:'Read and summarize one idea.',estimatedMinutes:5,sourceIds:[request.sources[0].id]}],questions:[]};
test('hosted free adapter pins endpoint and zero prices; sends only validated request and returns a validated plan',async()=>{
 let calls=0;
 const result=await inferFree({key:'synthetic-server-key',fetch:async(input,init)=>{calls++;assert.equal(input,'https://openrouter.ai/api/v1/chat/completions');const body=JSON.parse(init!.body as string);assert.equal(body.model,'openrouter/free');assert.equal(body.models,undefined);assert.equal(body.tools,undefined);assert.equal(body.provider.allow_fallbacks,false);assert.deepEqual(body.provider.max_price,{prompt:0,completion:0});assert.equal(body.provider.data_collection,'deny');assert.deepEqual(JSON.parse(body.messages[1].content),request);return Response.json({model:'synthetic/free',usage:{cost:0},choices:[{message:{content:JSON.stringify(plan)}}]});}},request,new AbortController().signal);
 assert.equal(calls,1);assert.deepEqual(result.plan,plan);assert.equal(result.verification.cost,0);assert.equal(JSON.stringify(result).includes('synthetic-server-key'),false);
});
test('free adapter rejects charged/unconfirmed/invalid output without a retry or paid fallback',async()=>{
 for(const value of [{model:'synthetic',usage:{cost:1},choices:[]},{model:'synthetic',choices:[]},{model:'synthetic',usage:{cost:0},choices:[{message:{content:JSON.stringify({...plan,steps:[{...plan.steps[0],sourceIds:['33333333-3333-4333-8333-333333333333']}]})}}]}]){
  let calls=0;await assert.rejects(inferFree({key:'synthetic-server-key',fetch:async()=>{calls++;return Response.json(value);}},request,new AbortController().signal));assert.equal(calls,1);
 }
});

test('free provider rate and outage failures are explicit, bounded and never retried',async()=>{
 const {FreeAiUnavailable}=await import('../server/freeAi.js');
 for(const status of [429,503,402]){
  let calls=0;await assert.rejects(inferFree({key:'synthetic-server-key',fetch:async()=>{calls++;return new Response('upstream private error',{status});}},request,new AbortController().signal),e=>e instanceof FreeAiUnavailable&&e.limited===(status===429)&&!e.message.includes('private'));
  assert.equal(calls,1);
 }
});
