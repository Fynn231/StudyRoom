import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStudyServer } from '../server/app.js';
import { fileURLToPath } from 'node:url';
const request = { requestId: '11111111-1111-4111-8111-111111111111', budgetMinutes: 25, sources: [{ id: '22222222-2222-4222-8222-222222222222', text: 'Synthetic moons reflect light.' }], answers: [{ question: 'Synthetic mode?', answer: 'slow' }] };
const script = fileURLToPath(new URL('./fixtures/ai-slow.mjs', import.meta.url));
test('closing local server cancels active inference child instead of waiting for its model deadline', async () => {
 const app = createStudyServer(undefined, Date.now, { executable: process.execPath, script, timeoutMs: 3000 }); const url = await app.listen(0);
 const pending = fetch(url+'/api/ai/plan', { method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify(request) }).catch(() => null);
 await new Promise(r => setTimeout(r,150));
 const start=Date.now(); await app.close(); const elapsed=Date.now()-start; await pending;
 assert.ok(elapsed<1000, `close waited ${elapsed}ms for inference`);
});
test('concurrency, timeout, rate, stdout and errors are bounded', async t => {
 const app=createStudyServer(undefined,Date.now,{executable:process.execPath,script,timeoutMs:200});t.after(()=>app.close());const url=await app.listen(0);
 const post=(answer:string,signal?:AbortSignal)=>fetch(url+'/api/ai/plan',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({...request,answers:[{question:'Synthetic mode?',answer}]}),signal});
 const pending=post('slow');await new Promise(r=>setTimeout(r,50));assert.equal((await post('slow')).status,429);
 const timeout=await pending;assert.equal(timeout.status,502);assert.ok(!(await timeout.text()).includes('PRIVATE_SDK_ERROR'));
 assert.equal((await post('overflow')).status,502);
 const c=new AbortController();const aborted=post('slow',c.signal).catch(()=>null);await new Promise(r=>setTimeout(r,50));c.abort();await aborted;await new Promise(r=>setTimeout(r,50));
 assert.equal((await post('error')).status,502);assert.equal((await post('slow')).status,429);
});
