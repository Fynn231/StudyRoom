import { tmpdir as publicationTmpdir } from 'node:os';
// Installed isolated Chrome only; no persistent profile, downloads or libraries.
// node --import tsx tests/vivid.browser.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createStudyServer } from '../server/app.ts';
import { siteHandler } from '../server/site.ts';
const scratch = publicationTmpdir();
const out = new URL('../.test-output/ai-study.browser/', import.meta.url);
await mkdir(out, { recursive: true });
const profile = await mkdtemp(join(scratch, 'sr-ai-chrome-'));
const config = { executable: process.execPath, script: new URL('../server/codex-inference.cjs', import.meta.url).pathname, timeoutMs: 60000 };
let server = createStudyServer(siteHandler, Date.now, config), url = await server.listen(0);
const chrome = spawn((process.env.CHROME_BIN || 'chromium'), ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { env: { ...process.env, TMPDIR: scratch }, stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws, id = 0;
const pending = new Map(), errors = [], requests = [], frames = [], observations = [], shots = [];
async function until(fn, label) { for (let i=0;i<100;i++) { try { const r=await fn(); if(r) return r; } catch {} await sleep(50); } throw Error(`Timed out: ${label}`); }
function send(method, params={}, sessionId) { const next=++id; return new Promise((resolve,reject) => { const t=setTimeout(()=>{pending.delete(next);reject(Error(`CDP timeout: ${method}`));},10000); pending.set(next,{resolve:r=>{clearTimeout(t);resolve(r);},reject:e=>{clearTimeout(t);reject(e);}}); ws.send(JSON.stringify({id:next,method,params,...(sessionId?{sessionId}:{})})); }); }
async function evaluate(session, expression) { const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},session); if(r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result?.value; }
async function page(width,height) { const {targetId}=await send('Target.createTarget',{url:'about:blank'}); const {sessionId:s}=await send('Target.attachToTarget',{targetId,flatten:true}); for(const m of ['Runtime.enable','Network.enable','Page.enable']) await send(m,{},s); await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390},s); await send('Page.navigate',{url},s); await until(()=>evaluate(s,`!!document.querySelector('[role="timer"]')`),'render'); return s; }
async function click(s,text,tag='button') { const p=await evaluate(s,`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(tag)})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('Missing '+${JSON.stringify(text)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`); for(const type of ['mousePressed','mouseReleased']) await send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1},s); await sleep(40); }
async function input(s,label,value) { await evaluate(s,`(()=>{const l=[...document.querySelectorAll('label')].find(e=>e.textContent.trim()===${JSON.stringify(label)});const e=document.getElementById(l.htmlFor);Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`); await sleep(30); }
async function typeHex(s,label,value) { await evaluate(s,`(()=>{const l=[...document.querySelectorAll('label')].find(e=>e.textContent.trim()===${JSON.stringify(label)});const e=document.getElementById(l.htmlFor);e.focus();e.select();})()`); await send('Input.insertText',{text:value},s); await sleep(35); }
async function flowers(s) { return evaluate(s,`[...document.querySelectorAll('.flower')].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{x:r.x,y:r.y,w:r.width,h:r.height,transform:s.transform,animation:s.animationName,duration:s.animationDuration,iterations:s.animationIterationCount,playState:s.animationPlayState,pointerEvents:s.pointerEvents};})`); }
async function read(s) { return evaluate(s,`(()=>{const e=document.querySelector('.room-backdrop'),r=e.getBoundingClientRect();return{background:getComputedStyle(e).backgroundImage,width:r.width,height:r.height,viewport:[innerWidth,innerHeight],scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],draft:document.querySelector('textarea').value,timer:document.querySelector('[role=timer]').textContent,storage:localStorage.length,url:location.href,focusSurface:getComputedStyle(document.querySelector('.focus-surface')).backgroundColor,targets:[...document.querySelectorAll('.appearance summary,.appearance button,.appearance input')].filter(e=>e.getBoundingClientRect().height).map(e=>({type:e.type||e.tagName,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}))};})()`); }
async function screenshot(s,name) { await evaluate(s,'scrollTo(0,0)'); const {cssContentSize:r}=await send('Page.getLayoutMetrics',{},s); const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:r.width,height:r.height,scale:1}},s); await writeFile(new URL(name,out),Buffer.from(data,'base64')); shots.push(name); }
// Composite each text node's real CSS background chain. Every normal readable
// text surface must become fully opaque BEFORE reaching arbitrary gradient.
async function contrast(s,label) {
 const result=await evaluate(s,`(()=>{
 const rgba=x=>{const a=x.match(/[\\d.]+/g)?.map(Number)||[];return [a[0]||0,a[1]||0,a[2]||0,a[3]??1];};
 const over=(a,b)=>{const z=a[3]+b[3]*(1-a[3]);return z?[0,1,2].map(i=>(a[i]*a[3]+b[i]*b[3]*(1-a[3]))/z).concat(z):[0,0,0,0];};
 const lum=c=>c.slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
 const entries=[]; const walker=document.createTreeWalker(document.querySelector('.app-shell'),NodeFilter.SHOW_TEXT);
 function check(e,text,pseudo){if(!text.trim()||e.closest('[aria-hidden=true],svg,:disabled')||!e.getClientRects().length||getComputedStyle(e).visibility!=='visible')return;
 let bg=[0,0,0,0],p=e;while(p&&!p.matches('.room-backdrop')){bg=over(bg,rgba(getComputedStyle(p).backgroundColor));if(bg[3]>=.999)break;p=p.parentElement;}
 const fg=rgba(getComputedStyle(e,pseudo).color),composite=over(fg,bg);const l=lum(composite),b=lum(bg),ratio=(Math.max(l,b)+.05)/(Math.min(l,b)+.05);
 entries.push({text:text.trim().slice(0,70),tag:e.tagName,cls:e.className,fg,bg,ratio,protected:bg[3]>=.999});}
 let n;while(n=walker.nextNode())check(n.parentElement,n.textContent);
 for(const e of document.querySelectorAll('input:not([type=color]):not([type=checkbox]),textarea,select')){check(e,e.value||'input');if(e.placeholder)check(e,e.placeholder,'::placeholder');}
 return{entries,failures:entries.filter(e=>!e.protected||e.ratio<4.5)};})()`);
 observations.push({label,contrast:result}); assert.deepEqual(result.failures,[],`${label} composited normal text contrast`); return result;
}
async function importFiles(s,names){const {root:r}=await send('DOM.getDocument',{},s);const {nodeId}=await send('DOM.querySelector',{nodeId:r.nodeId,selector:'.goal-panel input[type=file]'},s);await send('DOM.setFileInputFiles',{nodeId,files:names.map(n=>join(profile,n))},s);await sleep(30);}
async function hit(s,selector){const p=await evaluate(s,`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing selector');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1},s);await sleep(40);}
async function select(s,label,value){await evaluate(s,`(()=>{const l=[...document.querySelectorAll('label')].find(e=>e.textContent.trim()===${JSON.stringify(label)});const e=document.getElementById(l.htmlFor);e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await sleep(30);}
async function plan(s){return evaluate(s,`(()=>{const p=document.querySelector('.roadmap-panel');return{text:p?.textContent,ids:[...document.querySelectorAll('.roadmap-step')].map(e=>e.dataset.stepId),checks:[...document.querySelectorAll('.step-check input')].map(e=>e.checked),draft:document.querySelector('textarea').value,storage:[localStorage.length,sessionStorage.length],overflow:document.documentElement.scrollWidth>innerWidth};})()`);}

async function liveUntil(fn,label) { for(let i=0;i<1200;i++){const v=await fn();if(v)return v;await sleep(50);}throw Error('Model deadline: '+label); }
try {
 const portFile=await until(()=>readFile(join(profile,'DevToolsActivePort'),'utf8'),'Chrome');const [port,path]=portFile.trim().split('\n');ws=new WebSocket(`ws://127.0.0.1:${port}${path}`);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
 ws.on('message',raw=>{const m=JSON.parse(raw.toString());if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown'||(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error'))errors.push(m);if(m.method==='Network.requestWillBeSent')requests.push({session:m.sessionId,url:m.params.request.url});if(m.method==='Network.webSocketFrameSent')frames.push({session:m.sessionId,payload:m.params.response.payloadData});});
 await writeFile(join(profile,'synthetic-ai.md'),'# Synthetic Moon Study\nA moon reflects light from its star; it does not emit its own visible light. A crescent phase occurs when only part of its illuminated hemisphere faces an observer.\n- [ ] Compare reflected light and crescent phases\n- [x] EXCLUDED_COMPLETED_AI\n## Earlier\n- [ ] EXCLUDED_HISTORY_AI');
 for(const width of [1440,390]) {
  if(width===390){await server.close();server=createStudyServer(siteHandler,Date.now,config);url=await server.listen(0);}
  const s=await page(width,900);
  await evaluate(s,`window.aiCalls=[];window.realFetch=window.fetch;window.fetch=async function(...args){const entry={url:args[0],request:args[1]?.body?JSON.parse(args[1].body):null};if(String(args[0]).includes('/api/ai/plan'))aiCalls.push(entry);const r=await realFetch(...args);if(entry.request){entry.status=r.status;entry.response=await r.clone().json();}return r;};true`);
  await click(s,'Goals / notes','summary');await importFiles(s,['synthetic-ai.md']);await until(()=>evaluate(s,`!!document.querySelector('.ai-study')`),'AI import');
  await click(s,'Choose excerpts for AI','summary');
  assert.equal(await evaluate(s,`aiCalls.length`),0,'import/render/disclosure must not infer');
  assert.ok(await evaluate(s,`document.querySelector('.ai-study').textContent.includes('selected excerpts and any answers go to the configured model')`));
  assert.equal(await evaluate(s,`[...document.querySelectorAll('.ai-step-check input')].every(e=>e.getBoundingClientRect().width===22&&e.getBoundingClientRect().height===22)`),true,'AI checkbox dimensions');
  assert.equal(await evaluate(s,'document.documentElement.scrollWidth>innerWidth'),false,'preview overflow');
  await hit(s,'.ai-study .ai-step-check input');await screenshot(s,`${width}-selected-consent.png`);
  let peer, peerBefore, privateEventCount;
  if(width===1440){
   peer=await page(1440,900);await click(s,'Party');await input(s,'Your name','Synthetic AI owner');await until(()=>evaluate(s,`![...document.querySelectorAll('button')].find(e=>e.textContent==='Create room').disabled`),'connected');await click(s,'Create room');const code=await until(()=>evaluate(s,`document.querySelector('[aria-label="Room code"]')?.textContent`),'room');await click(s,'Keep personal clock');await click(peer,'Party');await input(peer,'Your name','Synthetic peer');await input(peer,'Invite code',code);await until(()=>evaluate(peer,`![...document.querySelectorAll('button')].find(e=>e.textContent==='Join room').disabled`),'peer connection');await click(peer,'Join room');await until(()=>evaluate(peer,`!!document.querySelector('[aria-label="Room code"]')`),'peer room');await click(peer,'Keep personal clock');await sleep(100);
   privateEventCount=frames.filter(f=>/^42/.test(f.payload)).length;peerBefore=await read(peer);
  }
  await click(s,'Generate AI study plan');
  await liveUntil(()=>evaluate(s,`!!document.querySelector('.ai-plan') || !!document.querySelector('.ai-study [role=alert]')`),'real generation');
  assert.equal(await evaluate(s,`document.querySelector('.ai-study [role=alert]')?.textContent??null`),null);
  const initial=await evaluate(s,`aiCalls[0]`);assert.equal(initial.status,200);assert.equal(initial.request.sources.length,1);assert.ok(!JSON.stringify(initial.request).includes('synthetic-ai.md'));assert.ok(!JSON.stringify(initial.request).includes('EXCLUDED_'));assert.equal(initial.response.verification.serverReportedModel,'gpt-6.1-sol');assert.equal(initial.response.verification.maxRetries,0);assert.equal(initial.response.verification.toolsEnabled,false);
  assert.ok(initial.response.plan.steps.every(x=>x.sourceIds.every(id=>initial.request.sources.some(s=>s.id===id))));assert.ok(initial.response.plan.steps.reduce((n,x)=>n+x.estimatedMinutes,0)<=25);
  assert.ok(initial.response.plan.questions.length>0,'real model should offer a relevant skippable question for this ambiguous study preference');
  await hit(s,'.ai-plan .ai-step-check input');assert.ok(await evaluate(s,`document.querySelector('.ai-plan [role=status]').textContent.startsWith('1/')`));await hit(s,'.ai-plan .ai-step-check input');
  await screenshot(s,`${width}-real-plan.png`);await click(s,'Optional AI questions','summary');
  const question=initial.response.plan.questions[0].question;await input(s,question,'I need a visual labelled diagram and a short self-quiz, not a long essay. I am a beginner.');
  assert.equal(await evaluate(s,'aiCalls.length'),1,'answer edits do not infer');await click(s,'Refine AI plan with answers');
  await liveUntil(()=>evaluate(s,`aiCalls[1]?.response`),'real refinement');
  const refined=await evaluate(s,'aiCalls[1]');assert.equal(refined.status,200);assert.equal(refined.request.answers[0].answer,'I need a visual labelled diagram and a short self-quiz, not a long essay. I am a beginner.');assert.notEqual(initial.request.requestId,refined.request.requestId);assert.equal(refined.response.verification.serverReportedModel,'gpt-6.1-sol');assert.ok(/diagram|sketch|draw|visual/i.test(JSON.stringify(refined.response.plan.steps)),'model meaningfully uses visual answer');assert.ok(/quiz|question|recall|test/i.test(JSON.stringify(refined.response.plan.steps)),'model uses self-quiz answer');
  assert.equal(await evaluate(s,'document.documentElement.scrollWidth>innerWidth'),false,'plan overflow');await contrast(s,`${width}-real-ai-refined`);await screenshot(s,`${width}-refined.png`);
  await click(s,'Build session roadmap');await hit(s,'.roadmap-panel .step-check input');await hit(s,'.ai-plan .ai-step-check input');
  await click(s,'Start focus');await sleep(1100);const before=await read(s);await hit(s,'.ai-plan .roadmap-step button');const after=await read(s);assert.equal(after.timer,before.timer);assert.ok(await evaluate(s,`[...document.querySelectorAll('button')].some(e=>e.textContent==='Pause focus')`));await click(s,'Pause focus');
  // Two real peers: no AI material/events or automatic sharing.
  if(width===1440){
   await hit(s,'.ai-plan .ai-step-check input');await hit(s,'.ai-plan .roadmap-step button');await sleep(100);assert.equal(frames.filter(f=>/^42/.test(f.payload)).length,privateEventCount);assert.equal((await read(peer)).draft,peerBefore.draft);assert.ok(!(await evaluate(peer,'document.body.textContent')).includes('Synthetic Moon Study'));assert.equal(await evaluate(s,'localStorage.length+sessionStorage.length'),0);assert.ok(!JSON.stringify(frames).includes('crescent'));await screenshot(peer,'peer-no-ai-leak.png');observations.push({realPeer:true,eventsUnchanged:privateEventCount});
  }
  // Honest backend failure: missing trusted executable, not a fake AI response.
  const good=config.executable;config.executable='/nonexistent/studyroom-inference-unavailable';await click(s,'Generate AI study plan');await until(()=>evaluate(s,`!!document.querySelector('.ai-study [role=alert]')`),'real provider launch failure');config.executable=good;
  assert.ok(await evaluate(s,`document.querySelector('.roadmap-panel [role=status]').textContent==='1/1 done'`));assert.ok(await evaluate(s,`!!document.querySelector('.ai-plan')`));await screenshot(s,`${width}-error-offline-intact.png`);
  // A real pending subprocess request is cancelled by Clear; no late resurrection.
  await click(s,'Generate AI study plan');await until(()=>evaluate(s,`document.querySelector('.ai-study')?.textContent.includes('Generating AI suggestions')`),'pending');await click(s,'Clear imported notes');await sleep(1200);assert.equal(await evaluate(s,`document.querySelector('.ai-study,.ai-plan,.roadmap-panel')`),null);assert.equal(await evaluate(s,'localStorage.length+sessionStorage.length'),0);
  observations.push({width,initial,refined,cancellationCleared:true,backendFailurePreservedOffline:true});
 }
 assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(requests.filter(r=>!r.url.startsWith('http://127.0.0.1:')).length,0);await writeFile(new URL('observations.json',out),JSON.stringify({passed:true,observations,shots,errors,requests,frames},null,2));console.log(JSON.stringify({passed:true,screenshots:shots.length,errors:errors.length,externalBrowserRequests:0}));
} catch(error){await writeFile(new URL('failure.json',out),JSON.stringify({error:String(error),observations,shots,errors,requests,frames},null,2));throw error;}
finally {
 if(ws?.readyState===WebSocket.OPEN){await send('Browser.close').catch(()=>{});ws.close();}if(chrome.exitCode===null){chrome.kill('SIGTERM');await new Promise(r=>chrome.once('exit',r));}await server.close();await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});assert.equal(server.http.listening,false);await assert.rejects(fetch(url));await assert.rejects(access(profile));await writeFile(new URL('cleanup.json',out),JSON.stringify({serverListening:server.http.listening,chromeExitCode:chrome.exitCode,profileRemoved:true,serverFetchRejected:true},null,2));
}
