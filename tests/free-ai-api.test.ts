import {test} from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {createInferenceHandler} from '../server/ai.js';
test('hosted free HTTP handler enforces origin and preserves manual fallback on provider limits',async()=>{
 const names=['STUDY_DEPLOYMENT_MODE','STUDY_PUBLIC_ORIGIN','SUPABASE_URL','SUPABASE_ANON_KEY','STUDY_PROXY_POLICY'];const previous=names.map(n=>process.env[n]);
 Object.assign(process.env,{STUDY_DEPLOYMENT_MODE:'hosted',STUDY_PUBLIC_ORIGIN:'https://study.example',SUPABASE_URL:'https://synthetic.invalid',SUPABASE_ANON_KEY:'sb_publishable_synthetic',STUDY_PROXY_POLICY:'render'});
 const request={requestId:'11111111-1111-4111-8111-111111111111',budgetMinutes:5,sources:[{id:'22222222-2222-4222-8222-222222222222',text:'Synthetic material'}],answers:[]};
 let limited=false,calls=0;const handler=createInferenceHandler(undefined,{key:'synthetic-server-key',fetch:async()=>{calls++;return limited?new Response('private',{status:429}):Response.json({model:'synthetic:free',usage:{cost:0},choices:[{message:{content:JSON.stringify({objectives:['Read'],steps:[{title:'Read',instructions:'Read the material.',estimatedMinutes:5,sourceIds:[request.sources[0].id]}],questions:[]})}}]});}});
 const server=createServer((req,res)=>void handler(req,res));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address() as import('node:net').AddressInfo;const base=`http://127.0.0.1:${address.port}`;
 try{
  const post=(origin:string)=>fetch(base+'/api/ai/plan',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(request)});
  assert.equal((await post('https://evil.invalid')).status,403);assert.equal(calls,0);
  assert.deepEqual(await(await fetch(base+'/api/ai/status')).json(),{configured:true,liveVerified:false});
  const good=await post('https://study.example');assert.equal(good.status,200);const body=await good.json();assert.equal(body.verification.cost,0);assert.equal(body.verification.provider,'openrouter-free');assert.equal(JSON.stringify(body).includes('synthetic-server-key'),false);
  limited=true;const failure=await post('https://study.example');assert.equal(failure.status,429);assert.match((await failure.json()).error,/rate-limited.*manual/i);assert.equal(calls,2,'exactly one upstream per user request');
 }finally{handler.close();await new Promise<void>(r=>server.close(()=>r()));names.forEach((n,i)=>{if(previous[i]===undefined)delete process.env[n];else process.env[n]=previous[i];});}
});
