import { tmpdir as publicationTmpdir } from 'node:os';
// Actual StudyRoom, disposable Chrome, real Spotify network (no fixtures).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createStudyServer } from '../server/app.ts';
import { siteHandler } from '../server/site.ts';
const out=process.env.STUDY_EVIDENCE ?? publicationTmpdir();
const scratch=publicationTmpdir();
await mkdir(out,{recursive:true}); const profile=await mkdtemp(join(scratch,'sr-lockin-chrome-'));
const server=createStudyServer(siteHandler); const url=await server.listen(0);
const chrome=spawn((process.env.CHROME_BIN || 'chromium'),['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{env:{...process.env,TMPDIR:scratch},stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); let ws,id=0;
const pending=new Map(),errors=[],requests=[],responses=[],failures=[],frames=[],observations=[],shots=[],contexts=[];
const savedKey='study-room.saved-study-plans.v1';
async function until(fn,label){for(let i=0;i<200;i++){try{const r=await fn();if(r)return r;}catch{}await sleep(50);}throw Error('Timed out: '+label);}
function send(method,params={},sessionId){const n=++id;return new Promise((resolve,reject)=>{const t=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},15000);pending.set(n,{resolve:r=>{clearTimeout(t);resolve(r);},reject});ws.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});}
async function ev(s,expression,contextId){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,...(contextId?{contextId}:{})},s);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;}
async function page(width){const {targetId}=await send('Target.createTarget',{url:'about:blank'});const {sessionId:s}=await send('Target.attachToTarget',{targetId,flatten:true});for(const m of ['Runtime.enable','Network.enable','Page.enable'])await send(m,{},s);await send('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390},s);if(width===390)await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1},s);await send('Page.navigate',{url},s);await until(()=>ev(s,`!!document.querySelector('[role=timer]')`),'app');return s;}
async function hit(s,selector,touch=false){const p=await ev(s,`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);if(touch){await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]},s);await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},s);}else{for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1},s);}await sleep(60);}
async function click(s,text,tag='button'){await ev(s,`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(tag)})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('missing '+${JSON.stringify(text)});e.setAttribute('data-hit','');})()`);await hit(s,'[data-hit]');await ev(s,`document.querySelector('[data-hit]')?.removeAttribute('data-hit')`);}
async function key(s,key='l',extra={}){await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key==='l'?'KeyL':'Escape',windowsVirtualKeyCode:key==='l'?76:27,...extra},s);await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key==='l'?'KeyL':'Escape',windowsVirtualKeyCode:key==='l'?76:27},s);}
async function type(s,selector,text){await hit(s,selector);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:4,commands:['selectAll']},s);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:4},s);await send('Input.insertText',{text},s);await sleep(60);assert.equal(await ev(s,`document.querySelector(${JSON.stringify(selector)}).value`),text);}
async function shot(s,name,selector){await ev(s,`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start'});true`);const {data}=await send('Page.captureScreenshot',{format:'png'},s);await writeFile(join(out,name),Buffer.from(data,'base64'));shots.push(name);}
async function style(s){return ev(s,`(()=>{const b=document.querySelector('.room-backdrop'),timer=document.querySelector('.timer'),label=document.querySelector('.timer-controls label'),primary=document.querySelector('.timer-buttons .primary');const c=e=>{const s=getComputedStyle(e);return{background:s.backgroundColor,color:s.color,font:s.fontFamily,filter:s.filter,animation:s.animationName,transition:s.transitionDuration}};return{backdrop:getComputedStyle(b).backgroundImage,atmosphere:[...document.querySelectorAll('.locked-atmosphere *')].map(e=>getComputedStyle(e).animationName).filter(n=>n!=='none').join(', ')||'none',atmosphereEffects:[...document.querySelectorAll('.locked-atmosphere *')].map(e=>{const s=getComputedStyle(e);return{opacity:s.opacity,transform:s.transform,dash:s.strokeDashoffset,position:s.backgroundPosition}}),timer:c(timer),label:c(label),primary:c(primary),shell:c(document.querySelector('.app-shell')),flowers:document.querySelector('.flower-layer')?getComputedStyle(document.querySelector('.flower-layer')).display:null,width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth};})()`);}
async function snapshot(s){return ev(s,`({flowerCount:document.querySelectorAll('.flower').length,falling:document.querySelector('.appearance input[type=checkbox]')?.checked,draft:document.querySelector('.intention-surface textarea').value,steps:[...document.querySelectorAll('.session-plan .step-check')].map(e=>({text:e.textContent,done:e.querySelector('input').checked})),imported:[...document.querySelectorAll('.roadmap-panel .step-check')].map(e=>({text:e.textContent,done:e.querySelector('input').checked})),saved:localStorage.getItem(${JSON.stringify(savedKey)}),people:document.querySelector('.people')?.textContent,code:document.querySelector('[aria-label="Room code"]')?.textContent,running:!!document.querySelector('[data-action=pause]')})`);}
try{
 const f=await until(()=>readFile(join(profile,'DevToolsActivePort'),'utf8'),'DevToolsActivePort');const [port,path]=f.trim().split('\n');ws=new WebSocket(`ws://127.0.0.1:${port}${path}`);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
 ws.on('message',raw=>{const m=JSON.parse(raw.toString());if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown'||(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error'))errors.push(m);if(m.method==='Network.requestWillBeSent')requests.push({session:m.sessionId,url:m.params.request.url,method:m.params.request.method});if(m.method==='Network.responseReceived')responses.push({session:m.sessionId,url:m.params.response.url,status:m.params.response.status});if(m.method==='Network.loadingFailed')failures.push(m);if(m.method==='Network.webSocketFrameSent')frames.push({session:m.sessionId,payload:m.params.response.payloadData});if(m.method==='Runtime.executionContextCreated')contexts.push({session:m.sessionId,...m.params.context});if(m.method==='Page.javascriptDialogOpening')void send('Page.handleJavaScriptDialog',{accept:true},m.sessionId);});
 for(const width of [1440,390]){
  const s=await page(width);await ev(s,`localStorage.clear();sessionStorage.clear();true`);
  assert.equal(await ev(s,`document.querySelectorAll('iframe').length`),0);
  const externalBefore=requests.filter(r=>r.session===s&&!r.url.startsWith(url));assert.equal(externalBefore.length,0,'normal load third parties');
  await hit(s,'.chime-controls input');await click(s,'Appearance','summary');await click(s,'Juliette');await hit(s,'.appearance input[type=checkbox]');assert.equal(await ev(s,`document.querySelectorAll('.flower').length`),24);await click(s,'Appearance','summary');
  await shot(s,`${width}-default.png`,'.masthead');const original=await style(s);
  await type(s,'.intention-surface textarea','PRIVATE_LOCKIN_STUDY');await click(s,'Plan session');await click(s,'Steps');await hit(s,'.session-plan .step-edit summary');await type(s,'.session-plan .step-edit input','Preserve edited task');await hit(s,'.session-plan .step-check input');
  await type(s,'.session-plan .save-study-plan input',`Lock in ${width}`);await hit(s,'.session-plan .save-study-plan button');
  await click(s,'Goals / notes','summary');const {root}=await send('DOM.getDocument',{},s);const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'.goal-panel input[type=file]'},s);await send('DOM.setFileInputFiles',{nodeId,files:[new URL('../docs/sim/project-focus-session.md',import.meta.url).pathname]},s);await until(()=>ev(s,`document.querySelectorAll('.goal-source .goal-line button').length===7`),'seven tasks');await click(s,'Build session roadmap');await hit(s,'.roadmap-panel .step-check input');
  await click(s,'Party');await until(()=>ev(s,`!!document.querySelector('.party-entry-form')&&!document.querySelector('.party-entry-form button').disabled`),'party connected');await type(s,'.party-entry-form input','Lock QA');await click(s,'Create room');await until(()=>ev(s,`!!document.querySelector('[aria-label="Room code"]')`),'room');await click(s,'Keep personal clock');await click(s,'Start focus');
  const before=await snapshot(s),frameCount=frames.filter(f=>f.session===s).length,startClock=await ev(s,`document.querySelector('[role=timer]').textContent`);
  if(width===390){for(let i=0;i<5;i++)await hit(s,'.wordmark',true);}else{await hit(s,'.wordmark');for(let i=0;i<5;i++)await key(s);}
  await until(()=>ev(s,`!!document.querySelector('.lock-in-mode')`),'lock in');
  const lockedCopy=await ev(s,`({title:document.title,brand:document.querySelector('.wordmark')?.textContent,hero:document.querySelector('h1')?.textContent,focus:document.querySelector('.focus-top h2')?.textContent,status:document.querySelector('.focus-top [role=status]')?.textContent,primary:document.querySelector('[data-action]')?.textContent,summaries:[...document.querySelectorAll('summary')].map(e=>e.textContent)})`);
  assert.match(lockedCopy.title,/LOCKED IN/,'tab title changes');
  assert.match(lockedCopy.brand,/LOCKED IN/,'wordmark changes');
  assert.equal(lockedCopy.hero,'Eliminate distractions.','hero copy changes');
  assert.equal(lockedCopy.focus,'Primary Directive','focus heading changes');
  assert.equal(lockedCopy.status,'Protocol active','locked status announced');
  assert.equal(lockedCopy.primary,'Suspend Focus','running control uses locked language');
  for(const label of ['Soundtrack','Atmosphere','Protocol brief','Protect your focus','Archived missions','Intel / notes']) assert.ok(lockedCopy.summaries.includes(label),label);
  const locked=await style(s);observations.push({width,original,locked,lockedCopy});
  assert.notEqual(locked.backdrop,original.backdrop);assert.match(locked.timer.font,/mono/i);assert.equal(await ev(s,`getComputedStyle(document.querySelector('.appearance input[type=color]')).filter`),'grayscale(1)','native color wells stay monochrome without changing chosen colors');assert.equal(locked.shell.filter,'none');assert.equal(locked.flowers,'none');// Palette colors are intentionally atmosphere-specific; computed WCAG contrast is asserted below.
  assert.notEqual(locked.atmosphere,'none');assert.equal(locked.width,locked.scrollWidth,'overflow');
  assert.deepEqual(await snapshot(s),before,'mode preserves live work and party');await sleep(1200);assert.notEqual(await ev(s,`document.querySelector('[role=timer]').textContent`),startClock);const moving=await style(s);assert.notDeepEqual(moving.atmosphereEffects,locked.atmosphereEffects,'actual selected atmosphere interpolates over time');observations.push({width,motionBefore:locked.atmosphereEffects,motionAfter:moving.atmosphereEffects});
  const accessibility=await ev(s,`(()=>{const rgb=x=>x.match(/[0-9.]+/g).slice(0,3).map(Number),lum=c=>c.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((n,x,i)=>n+x*[.2126,.7152,.0722][i],0),contrast=(a,b)=>{const x=lum(rgb(a)),y=lum(rgb(b));return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};const label=document.querySelector('.timer-controls label'),primary=document.querySelector('.timer-buttons .primary');return{labelContrast:contrast(getComputedStyle(label).color,getComputedStyle(document.querySelector('.focus-surface')).backgroundColor),primaryContrast:contrast(getComputedStyle(primary).color,getComputedStyle(primary).backgroundColor),targets:[...document.querySelectorAll('.timer-buttons button,.wordmark,.lock-in-panel button,.launch-link,.music-panel summary,.step-actions button')].filter(e=>e.checkVisibility()).map(e=>({text:e.textContent.trim(),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))}})()`);
  assert.ok(accessibility.labelContrast>=4.5);assert.ok(accessibility.primaryContrast>=4.5);assert.ok(accessibility.targets.every(e=>e.width>=44&&e.height>=44));observations.push({width,accessibility});
  assert.equal(await ev(s,`document.querySelectorAll('iframe').length`),1);assert.equal(await ev(s,`document.querySelector('iframe').src`),'https://open.spotify.com/embed/track/2KpZZ1cyChx3REhma5nOv6?utm_source=generator');
  await shot(s,`${width}-locked-overview.png`,'.masthead');await shot(s,`${width}-locked-timer.png`,'.focus-surface');await shot(s,`${width}-locked-plan.png`,'.session-plan');await shot(s,`${width}-spotify.png`,'.music-panel');
  // Inspect the actual cross-origin provider DOM through its own CDP context, never app imitation.
  await sleep(3500);let provider=[];
  const {root:providerRoot}=await send('DOM.getDocument',{},s);
  const {nodeId:providerNode}=await send('DOM.querySelector',{nodeId:providerRoot.nodeId,selector:'.spotify-player iframe'},s);
  const {node:providerOwner}=await send('DOM.describeNode',{nodeId:providerNode},s);
  assert.ok(providerOwner.frameId,'actual page Spotify iframe has a frame identity');
  // Other still-open device tabs may have the same track URL: URL alone is not ownership.
  const providerTargets=(await send('Target.getTargets')).targetInfos.filter(t=>t.type==='iframe'&&t.targetId===providerOwner.frameId&&t.url.startsWith('https://open.spotify.com/embed/'));
  for(const target of providerTargets){
    const {sessionId:ps}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
    await send('Runtime.enable',{},ps);await send('Network.enable',{},ps);
    try{provider.push({session:ps,targetUrl:target.url,body:await ev(ps,'document.body.innerText'),buttons:await ev(ps,`[...document.querySelectorAll('button')].map(e=>({label:e.getAttribute('aria-label'),text:e.textContent}))`)});}catch{}
  }
  for(const c of contexts.filter(c=>c.session===s&&c.origin==='https://open.spotify.com'&&c.auxData?.isDefault)){
    try{provider.push({context:c.id,body:await ev(s,'document.body.innerText',c.id),buttons:await ev(s,`[...document.querySelectorAll('button')].map(e=>({label:e.getAttribute('aria-label'),text:e.textContent}))`,c.id)});}catch{}
  }
  const playable=provider.find(p=>p.buttons.some(b=>/play/i.test(b.label??'')));
  let playAttempt=null;
  if(playable){const ps=playable.session??s,ctx=playable.context;const p=await ev(ps,`(()=>{const b=[...document.querySelectorAll('button')].find(e=>/play/i.test(e.getAttribute('aria-label')??''));const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,label:b.getAttribute('aria-label')};})()`,ctx);const host=await ev(s,`(()=>{const r=document.querySelector('iframe').getBoundingClientRect();return{x:r.x,y:r.y};})()`);for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x:host.x+p.x,y:host.y+p.y,button:'left',clickCount:1},s);await sleep(1800);playAttempt={clicked:p.label,after:await ev(ps,'document.body.innerText',ctx),buttonsAfter:await ev(ps,`[...document.querySelectorAll('button')].map(e=>({label:e.getAttribute('aria-label'),text:e.textContent}))`,ctx),media:await ev(ps,`[...document.querySelectorAll('audio,video')].map(e=>({paused:e.paused,currentTime:e.currentTime,muted:e.muted,error:e.error?.message}))`,ctx)};}
  observations.push({width,provider,playAttempt});await shot(s,`${width}-spotify-response.png`,'.spotify-player');
  assert.ok(provider.some(p=>p.body.includes('ALTERED OBSIDIAN')&&p.body.includes('AZALI')),'real provider renders exact supplied track');
  assert.ok(playAttempt?.buttonsAfter.some(b=>b.label==='Pause'),'actual provider Play control responds (not proof of audible/full-track sound)');
  assert.deepEqual(await snapshot(s),before);
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},s);const reduced=await style(s);assert.equal(reduced.atmosphere,'none');assert.equal(reduced.timer.transition,'0s');observations.push({width,reduced});
  // Persistent exit is reachable when provider has focus and on small screens.
  await hit(s,'.spotify-player iframe');await click(s,'Exit Lock In Mode');assert.equal(await ev(s,`!!document.querySelector('.lock-in-mode')`),false);assert.deepEqual(await snapshot(s),before);assert.equal(await ev(s,`document.querySelectorAll('iframe').length`),0);
  const restoredCopy=await ev(s,`({title:document.title,hero:document.querySelector('h1')?.textContent,focus:document.querySelector('.focus-top h2')?.textContent})`);
  assert.equal(restoredCopy.title,'Study Room — focus together','title restored');
  assert.equal(restoredCopy.hero,'One thing at a time.','normal copy restored');
  assert.equal(restoredCopy.focus,'Personal focus','normal heading restored');
  const restored=await style(s);assert.equal(restored.backdrop,original.backdrop);assert.equal(restored.timer.font,original.timer.font);assert.notEqual(restored.flowers,'none');assert.equal(frames.filter(f=>f.session===s).length,frameCount,'no mode/music/intent broadcast');await shot(s,`${width}-restored.png`,'.focus-surface');
  const saved=JSON.parse(before.saved).plans[0];await send('Page.reload',{},s);await until(()=>ev(s,`!!document.querySelector('[role=timer]')`),'reload');await click(s,'Saved study plans','summary');await click(s,'Resume plan');assert.equal(await ev(s,`document.querySelector('.resumed-study-plan .step-check span').textContent`),'Preserve edited task');assert.equal(await ev(s,`document.querySelector('.resumed-study-plan .step-check input').checked`),true);assert.equal((JSON.parse(await ev(s,`localStorage.getItem(${JSON.stringify(savedKey)})`))).plans[0].id,saved.id);
  await hit(s,'.wordmark');for(let i=0;i<5;i++)await key(s);await until(()=>ev(s,`!!document.querySelector('.lock-in-mode')`),'reveal before reload');await send('Page.reload',{},s);await until(()=>ev(s,`!!document.querySelector('.lock-in-mode')`),'restored lock theme');assert.equal(await ev(s,`document.querySelectorAll('iframe').length`),0,'mode restore does not auto-load provider');await click(s,'Exit Lock In Mode');
  await ev(s,`document.querySelector('.music-panel').open=true;true`);await click(s,'Choose another Spotify link','summary');await type(s,'.music-custom input','https://evil.test/song');await click(s,'Select music link');assert.ok(await ev(s,`!!document.querySelector('.music-custom [role=alert]')`));
  await type(s,'.music-custom input','https://open.spotify.com/track/2KpZZ1cyChx3REhma5nOv6?si=REMOVED');await click(s,'Select music link');assert.equal(await ev(s,`document.querySelectorAll('iframe').length`),0);await click(s,'Load selected Spotify player');assert.equal(await ev(s,`document.querySelectorAll('iframe').length`),1);await click(s,'Unload Spotify player');assert.equal(await ev(s,`document.querySelectorAll('iframe').length`),0);await click(s,'Clear music selection');
  // PWA: manifest is served, valid, and the production build registers the app-shell worker.
  const pwa=await ev(s,`(async()=>{const r=await fetch('/manifest.webmanifest');const m=await r.json();let regs=[];try{regs=await navigator.serviceWorker.getRegistrations()}catch{} return {status:r.status,name:m.name,display:m.display,icons:(m.icons||[]).length,link:!!document.querySelector('link[rel=manifest]'),sw:regs.length,start:m.start_url}})()`);
  assert.equal(pwa.status,200,'manifest served');assert.equal(pwa.display,'standalone');assert.ok(pwa.icons>=2,'192/512 icons');assert.ok(pwa.link,'manifest linked');
  await until(()=>ev(s,`navigator.serviceWorker.getRegistrations().then(r=>r.length>=1)`),'service worker');
  // Apple Music: no invented default track; strict validation; official embed only after explicit choice.
  await ev(s,`document.querySelector('.music-panel').open=true;true`);await click(s,'Apple Music','label');await sleep(150);
  assert.equal(await ev(s,`document.querySelectorAll('iframe').length`),0,'no invented Apple track');
  await click(s,'Choose an Apple Music link','summary');
  await type(s,'.music-custom-apple input','https://evil.test/song');await click(s,'Select Apple Music link');assert.ok(await ev(s,`!!document.querySelector('.music-custom-apple [role=alert]')`));
  await type(s,'.music-custom-apple input','https://music.apple.com/us/album/random-access-memories/617154241');await click(s,'Select Apple Music link');await click(s,'Load Apple Music player');
  assert.equal(await ev(s,`document.querySelector('iframe')?.getAttribute('title')`),'Official Apple Music player');
  assert.equal(await ev(s,`document.querySelector('iframe')?.getAttribute('src')`),'https://embed.music.apple.com/us/album/random-access-memories/617154241');
  await shot(s,`${width}-apple-music.png`,'.music-panel');
  await click(s,'Silent mode','label');await sleep(120);
  await shot(s,`${width}-silent.png`,'.music-panel');
  assert.equal(await ev(s,`document.querySelectorAll('iframe').length`),0,'silent unloads provider');
  assert.match(await ev(s,`document.querySelector('.music-panel [role=status]')?.textContent||''`),/Silent focus selected/i);
  await click(s,'Spotify','label');await click(s,'Load featured Spotify player');
  assert.equal(await ev(s,`document.querySelector('iframe')?.getAttribute('src')`),'https://open.spotify.com/embed/track/2KpZZ1cyChx3REhma5nOv6?utm_source=generator');
  // Focus setup is honest: guidance, not system control.
  await click(s,'Protect your focus','summary');await shot(s,`${width}-focus-setup.png`,'.focus-setup');
  const focusSetup=await ev(s,`document.querySelector('.focus-setup')?.textContent||''`);
  assert.match(focusSetup,/cannot turn on system Focus/i);assert.ok(!/Do Not Disturb is (now )?active/i.test(focusSetup));
  await hit(s,'.focus-setup input[type=checkbox]');
  assert.match(await ev(s,`document.querySelector('.focus-setup [role=status]')?.textContent||''`),/Recorded as your own confirmation/i);
  // Locked completion variant: start a 1-minute cycle, then advance the page clock so the
  // real completion path runs without waiting. Same data logic; presentation is locked.
  await type(s,'.duration-field input','1');await click(s,'Start focus');await sleep(300);
  if(width===390){for(let i=0;i<5;i++)await hit(s,'.wordmark',true);}else{await hit(s,'.wordmark');for(let i=0;i<5;i++)await key(s);}
  await until(()=>ev(s,`!!document.querySelector('.lock-in-mode')`),'relock for completion');
  await ev(s,`window.__pn=performance.now.bind(performance);performance.now=()=>window.__pn()+120000;true`);
  await until(()=>ev(s,`!!document.querySelector('.session-complete')`),'locked completion');
  const lockedComplete=await ev(s,`document.querySelector('.session-complete')?.textContent||''`);
  assert.match(lockedComplete,/MISSION ACCOMPLISHED|Mission accomplished/i);
  assert.match(lockedComplete,/Until the next mission/);
  await shot(s,`${width}-locked-complete.png`,'.session-complete');
  await click(s,'Close mission report');
  observations.push({width,actualTouch:width===390,activeTimerPreserved:true,editedCheckedAndImportedSevenTasksPreserved:true,savedIdentityReloaded:true,partyModeFrames:0,restored,restoredModeWithoutProvider:true,customExplicitSelectionLoadUnloadAndInvalidLink:true,lockedCopy,pwa,appleAndSilent:true,focusSetupHonest:true});await ev(s,`localStorage.clear();sessionStorage.clear();true`);
 }
 assert.ok(!frames.some(f=>/PRIVATE_LOCKIN_STUDY|2KpZZ1cyChx3REhma5nOv6|lockIn/.test(f.payload)));
 const appErrors=errors.filter(e=>!JSON.stringify(e).includes('spotify'));assert.equal(appErrors.length,0,JSON.stringify(appErrors));
 await writeFile(join(out,'observations.json'),JSON.stringify({passed:true,url,realNetwork:true,noFixtures:true,observations,shots,errors,appErrors,requests,responses,failures,frames},null,2));console.log(JSON.stringify({passed:true,url,shots:shots.length,observations:observations.length,errors:errors.length}));
}catch(error){await writeFile(join(out,'failure.json'),JSON.stringify({error:String(error),url,observations,shots,errors,requests,responses,failures,frames},null,2));throw error;}
finally{if(ws?.readyState===WebSocket.OPEN){await send('Browser.close').catch(()=>{});ws.close();}if(chrome.exitCode===null){await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(3000)]);if(chrome.exitCode===null){chrome.kill('SIGTERM');await new Promise(r=>chrome.once('exit',r));}}await server.close();await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});assert.equal(server.http.listening,false);await assert.rejects(fetch(url));await assert.rejects(access(profile));await writeFile(join(out,'cleanup.json'),JSON.stringify({serverListening:false,chromeExitCode:chrome.exitCode,profileRemoved:true,url,profile},null,2));}
