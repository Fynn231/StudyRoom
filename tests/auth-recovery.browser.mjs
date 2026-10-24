import { tmpdir as publicationTmpdir } from 'node:os';
// Parent-boundary exercise only: real disposable Chrome + actual built client.
// Hosted CONFIG and provider rejection are synthetic. No accounts are accessed.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,mkdir,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import WebSocket from 'ws';
import {createStudyServer} from '../server/app.ts';
import {siteHandler} from '../server/site.ts';
const scratch=publicationTmpdir();
const out=join(scratch,'studyroom-browser','browser-followup');
await mkdir(out,{recursive:true});
const app=createStudyServer(siteHandler);
let chrome,profile,ws;let sequence=0;const pending=new Map();const errors=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<160;i++){try{const value=await fn();if(value)return value;}catch{}await sleep(50);}throw Error('Timed out: '+label);}
function call(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
try{
 const url=await app.listen(0); // Respect sandbox EPERM; do not work around it.
 profile=await mkdtemp(join(scratch,'studyroom-auth-chrome-'));
 chrome=spawn((process.env.CHROME_BIN || 'chromium'),[
  '--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync',
  '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank',
 ],{env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:scratch,LANG:'en_US.UTF-8'},stdio:'ignore'});
 const portFile=await until(async()=>await readFile(join(profile,'DevToolsActivePort'),'utf8'),'Chrome port');
 const [port,path]=portFile.trim().split('\n');ws=new WebSocket(`ws://127.0.0.1:${port}${path}`);await once(ws,'open');
 let mode='local',sessionId;
 ws.on('message',data=>{
  const message=JSON.parse(String(data));
  if(message.id){const entry=pending.get(message.id);if(entry){pending.delete(message.id);message.error?entry.reject(Error(message.error.message)):entry.resolve(message.result);}return;}
  if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);
  if(message.method==='Fetch.requestPaused'){
   const p=message.params;const requestUrl=new URL(p.request.url);
   const respond=(status,body)=>call('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:url},{name:'Access-Control-Allow-Headers',value:'authorization,apikey,content-type,x-client-info,x-supabase-api-version'}],body:Buffer.from(JSON.stringify(body)).toString('base64')},sessionId);
   if(mode==='synthetic-hosted' && requestUrl.pathname==='/api/config')void respond(200,{mode:'hosted',auth:{required:true,url:'https://synthetic.invalid',anonKey:'sb_publishable_synthetic'}});
   else if(requestUrl.origin!==url)void respond(p.request.method==='OPTIONS'?200:400,{message:'Synthetic provider rejection: delivery not configured',error_code:'synthetic_provider_unavailable'});
   else void call('Fetch.continueRequest',{requestId:p.requestId},sessionId);
  }
 });
 const target=await call('Target.createTarget',{url:'about:blank'});sessionId=(await call('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
 await call('Page.enable',{},sessionId);await call('Runtime.enable',{},sessionId);await call('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]},sessionId);
 const evaluate=async expression=>(await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId)).result.value;
 await call('Page.navigate',{url},sessionId);
 await until(()=>evaluate(`!!document.querySelector('textarea') && document.body.innerText.includes('Personal focus')`),'local focus workspace');
 await evaluate(`document.querySelector('textarea').value='SYNTHETIC LOCAL DRAFT'`);
 assert.equal(await evaluate(`document.body.innerText.includes('Sign in to Study Room')`),false);
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
 let shot=await call('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(join(out,'local-1440.png'),Buffer.from(shot.data,'base64'));
 mode='synthetic-hosted';await call('Page.navigate',{url},sessionId);
 await until(()=>evaluate(`document.body.innerText.includes('Sign in to Study Room')`),'synthetic hosted gate');
 assert.equal(await evaluate(`!!document.querySelector('textarea')`),false,'private App stays unmounted');
 assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Send magic link').disabled`),false);
 await evaluate(`document.querySelector('input[name=email]').value='synthetic@example.invalid';document.querySelector('form').requestSubmit()`);
 await until(()=>evaluate(`!!document.querySelector('[role=status]')`),'synthetic provider rejection displayed');
 assert.equal(await evaluate(`!!document.querySelector('textarea')`),false);
 for(const width of [1440,390]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===390},sessionId);
  shot=await call('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(join(out,`synthetic-hosted-${width}.png`),Buffer.from(shot.data,'base64'));
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true,'no horizontal overflow');
 }
 assert.deepEqual(errors,[]);
 await writeFile(join(out,'result.json'),JSON.stringify({ok:true,local:'actual built client / local server',hostedGate:'synthetic public config, real AuthProvider/AuthGate, synthetic rejected provider',realProviderVerified:false,errors},null,2));
 console.log('Disposable Chrome local + synthetic hosted gate passed; real provider integration unverified.');
}finally{
 if(ws?.readyState===WebSocket.OPEN){try{await call('Browser.close');}catch{}ws.close();}
 if(chrome && chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([once(chrome,'exit'),sleep(3000)]);}
 await app.close();
 if(profile){for(let i=0;i<10;i++){try{await rm(profile,{recursive:true,force:true});break;}catch{await sleep(100);}}}
}
