import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStudyServer} from '../server/app.js';
test('health revision exposes only an exact commit SHA, never arbitrary environment values',async t=>{
 const original=process.env.RENDER_GIT_COMMIT;const app=createStudyServer();const url=await app.listen(0);
 t.after(async()=>{if(original===undefined)delete process.env.RENDER_GIT_COMMIT;else process.env.RENDER_GIT_COMMIT=original;await app.close();});
 for(const [input,expected] of [['a'.repeat(40),'a'.repeat(40)],['sensitive-malformed-value',null]] as const){process.env.RENDER_GIT_COMMIT=input;assert.deepEqual(await(await fetch(url+'/healthz')).json(),{ok:true,revision:expected});}
});
