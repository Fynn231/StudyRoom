import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
test('explicit local AI launcher configures durable route without a startup model probe', async t => {
 const pkg=JSON.parse(await readFile(new URL('../../package.json',import.meta.url),'utf8'));
 assert.equal(pkg.scripts['start:ai'],'node --import tsx tests/local-only/start-ai.mjs','missing explicit local AI launcher');
 const child=spawn(process.execPath,['--import','tsx','server/start-ai.ts'],{cwd:new URL('../..',import.meta.url),env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}});
 const url=await new Promise<string>((resolve,reject)=>{let raw='';const timer=setTimeout(()=>reject(Error('Startup deadline')),5000);child.stdout.on('data',c=>{raw+=c;const u=raw.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];if(u){clearTimeout(timer);resolve(u);}});child.on('error',reject);child.on('exit',()=>{clearTimeout(timer);reject(Error('Startup failed'));});});
 assert.deepEqual(await(await fetch(url+'/api/ai/status')).json(),{configured:true,liveVerified:false});
});
