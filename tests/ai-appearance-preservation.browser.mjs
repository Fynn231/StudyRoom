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
const out = new URL('../.test-output/ai-appearance-preservation.browser/', import.meta.url);
await mkdir(out, { recursive: true });
const profile = await mkdtemp(join(scratch, 'sr-roadmap-preservation-chrome-'));
const server = createStudyServer(siteHandler), url = await server.listen(0);
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
try {
 const portFile=await until(()=>readFile(join(profile,'DevToolsActivePort'),'utf8'),'Chrome'); const [port,path]=portFile.trim().split('\n'); ws=new WebSocket(`ws://127.0.0.1:${port}${path}`); await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
 ws.on('message',raw=>{const m=JSON.parse(raw.toString());if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown'||(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error'))errors.push(m);if(m.method==='Network.requestWillBeSent')requests.push({session:m.sessionId,url:m.params.request.url});if(m.method==='Network.webSocketFrameSent')frames.push({session:m.sessionId,payload:m.params.response.payloadData});});
 for(const width of [1440,390]) {
  const s=await page(width,900),initial=await read(s);
  assert.match(initial.background,/linear-gradient\(to right bottom, rgb\(255, 255, 255\).*rgb\(128, 168, 121\)/);
  assert.equal(initial.scroll[0],width); assert.ok(Math.ceil(initial.height)>=initial.scroll[1]);
  await contrast(s,`${width}-default`); await screenshot(s,`${width}-default.png`);
  assert.ok(await evaluate(s,`document.querySelector('.music-panel').getBoundingClientRect().bottom < document.querySelector('.focus-surface').getBoundingClientRect().top && !document.querySelector('.music-panel').open`),'compact music is above the timer');
  await click(s,'Music','summary');
  await input(s,'Spotify link','https://open.spotify.com/playlist/0123456789ABCDEFGHIJKL');await click(s,'Select music link');
  await evaluate(s,`window.savedMusic=document.querySelector('.music-panel');window.savedMusicLink=document.querySelector('.launch-link');true`);
  await click(s,'Music','summary');
  for(const invalid of ['0','181','1.5','']) {
   await typeHex(s,'Focus length',invalid);await sleep(300);
   assert.ok(await evaluate(s,`document.querySelector('.duration-field input').getAttribute('aria-invalid')==='true'&&[...document.querySelectorAll('button')].find(e=>e.textContent==='Start focus').disabled`));
  }
  await typeHex(s,'Focus length','37');
  assert.equal(await evaluate(s,`document.querySelector('.duration-field input').value`),'37');
  await input(s,'Your session intention','SYNTHETIC VIVID DRAFT'); await click(s,'Start focus');
  assert.ok(await evaluate(s,`document.querySelector('[role=timer]').textContent==='37:00'&&document.querySelector('.duration-field input').disabled`));
  await evaluate(s,`window.savedTimer=document.querySelector('[role=timer]');window.savedDraft=document.querySelector('textarea');true`);
  await click(s,'Appearance','summary');
  for(const preset of ['Sage','Peach Glow','Lavender Mist','Ocean Haze','Forest Study','Rosewood','Blue Hour','Moon Garden','Autumn Letters','Juliette']) {
   await click(s,preset); const r=await read(s);assert.match(r.background,/to right bottom/);assert.equal(r.scroll[0],width);assert.ok(Math.ceil(r.height)>=r.scroll[1]);await contrast(s,`${width}-${preset}`);
   if(['Juliette','Forest Study','Moon Garden','Autumn Letters'].includes(preset)) {
    await screenshot(s,`${width}-${preset.replaceAll(' ','-')}.png`);
    await click(s,'Appearance','summary');await screenshot(s,`${width}-${preset.replaceAll(' ','-')}-workspace.png`);await click(s,'Appearance','summary');
   }
  }
  let before=await flowers(s);assert.equal(before.length,24);assert.ok(before.every(f=>f.animation==='none'&&f.pointerEvents==='none'));
  await evaluate(s,'scrollTo(0,0)');
  const exposure=await evaluate(s,`(()=>{const exposed=[];for(const e of document.querySelectorAll('.flower')){const r=e.getBoundingClientRect();for(const [dx,dy] of [[.5,.5],[.3,.3],[.7,.3]]){const x=r.x+r.width*dx,y=r.y+r.height*dy;let hit=document.elementFromPoint(x,y),covered=false;while(hit&&!hit.matches('.room-backdrop')){const bg=getComputedStyle(hit).backgroundColor;if(!bg.endsWith(', 0)')&&bg!=='transparent')covered=true;hit=hit.parentElement;}if(!covered&&x>48&&x<innerWidth-48&&y>0&&y<innerHeight)exposed.push({x,y});}}return exposed;})()`);
  assert.ok(exposure.length>0,'scattered decorations are actually exposed inside background gaps, not only sidelines');observations.push({width,internalGapSamples:exposure});
  await click(s,'Falling flowers','label');
  const animated=await flowers(s);await sleep(250);const moved=await flowers(s);
  assert.ok(animated.every(f=>f.animation==='flower-fall'&&f.iterations==='infinite'));assert.ok(moved.some((f,i)=>f.transform!==animated[i].transform),'flowers actually move');
  // Latest brief: scatter across exposed gaps, but never intercept or cover inputs.
  assert.ok(await evaluate(s,`getComputedStyle(document.querySelector('.flower-layer')).zIndex < getComputedStyle(document.querySelector('.app-shell')).zIndex && [...document.querySelectorAll('input,textarea,button')].filter(e=>e.getBoundingClientRect().height&&e.getBoundingClientRect().top>=0&&e.getBoundingClientRect().bottom<innerHeight).every(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})`));
  assert.ok(await evaluate(s,`document.querySelector('.flower-layer').getAttribute('aria-hidden')==='true'&&![...document.querySelectorAll('.flower-layer *')].some(e=>e.tabIndex>=0)`));
  await screenshot(s,`${width}-flowers-on.png`);
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},s); before=await flowers(s);await sleep(200);const reduced=await flowers(s);assert.ok(reduced.every(f=>f.animation==='none'));assert.deepEqual(reduced,before);
  await screenshot(s,`${width}-reduced-motion.png`);
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]},s);
  // Deterministic visibility event injection: browser lifecycle behavior varies in headless.
  await evaluate(s,`Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));true`);await sleep(40);const hidden=await flowers(s);assert.ok(hidden.every(f=>f.playState==='paused'));await sleep(100);assert.deepEqual(await flowers(s),hidden);
  await evaluate(s,`delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));true`);
  await click(s,'Falling flowers','label');assert.ok((await flowers(s)).every(f=>f.animation==='none'));
  for(const [theme,toggle,animation] of [['Moon Garden','Drifting moonlight','moon-drift'],['Autumn Letters','Falling leaves','leaf-flutter']]) {
   await click(s,theme);assert.ok((await flowers(s)).every(f=>f.animation==='none'));
   await click(s,toggle,'label');const start=await flowers(s);await sleep(250);const after=await flowers(s);
   assert.ok(start.every(f=>f.animation===animation));assert.ok(after.some((f,i)=>f.transform!==start[i].transform));
   await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},s);assert.ok((await flowers(s)).every(f=>f.animation==='none'));await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]},s);
   await evaluate(s,`Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));true`);await sleep(50);assert.ok((await flowers(s)).every(f=>f.playState==='paused'));await evaluate(s,`delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));true`);
   await screenshot(s,`${width}-${theme.replaceAll(' ','-')}-motion.png`);await click(s,toggle,'label');assert.ok((await flowers(s)).every(f=>f.animation==='none'));
  }
  await click(s,'Juliette');
  await click(s,'Appearance','summary');await screenshot(s,`${width}-juliette-collapsed.png`);await click(s,'Appearance','summary');
  observations.push({width,initial,animated,moved,reduced,hidden});
  await input(s,'First custom color','#00ff00');await input(s,'Second custom color','#ff00ff');
  assert.equal(await evaluate(s,`document.querySelector('.appearance input[type=text]').value`),'#00ff00');
  assert.match((await read(s)).background,/rgb\(0, 255, 0\).*rgb\(255, 0, 255\)/);await contrast(s,`${width}-native-green-magenta`);
  for(const pair of [['#000000','#ffffff'],['#ff0000','#0000ff'],['#000000','#000000']]) {
   await typeHex(s,'First custom HEX',pair[0]);await typeHex(s,'Second custom HEX',pair[1]);
   const r=await read(s); assert.equal(await evaluate(s,`document.querySelector('input[type=color]').value`),pair[0]);assert.equal(await evaluate(s,`document.querySelector('.flower-layer')`),null);await contrast(s,`${width}-${pair.join('-')}`);observations.push({width,pair,state:r});
  }
  await typeHex(s,'First custom HEX','#Ab12Cd');assert.equal(await evaluate(s,`document.querySelector('.appearance input[type=text]').value`),'#Ab12Cd');
  const last=await read(s);await typeHex(s,'First custom HEX','url(https://example.invalid)');assert.equal((await read(s)).background,last.background);assert.ok(await evaluate(s,`!!document.querySelector('.appearance input[aria-invalid=true]')&&!!document.querySelector('.appearance [role=alert]')`));
  await contrast(s,`${width}-invalid`);await screenshot(s,`${width}-invalid.png`);
  await typeHex(s,'First custom HEX','#ff0000');await typeHex(s,'Second custom HEX','#0000ff');
  assert.match((await read(s)).background,/rgb\(255, 0, 0\).*rgb\(0, 0, 255\)/);await screenshot(s,`${width}-exact-red-blue.png`);
  assert.ok(await evaluate(s,`savedTimer===document.querySelector('[role=timer]')&&savedDraft===document.querySelector('textarea')&&document.querySelector('textarea').value==='SYNTHETIC VIVID DRAFT'&&savedMusic===document.querySelector('.music-panel')&&savedMusicLink===document.querySelector('.launch-link')&&[...document.querySelectorAll('button')].some(e=>e.textContent==='Pause focus')`));
  const targets=(await read(s)).targets;assert.ok(targets.every(t=>t.w>=44&&t.h>=44),JSON.stringify(targets));
  await evaluate(s,`document.querySelector('.appearance button').focus()`);for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9},s);assert.ok(await evaluate(s,`document.activeElement.matches(':focus-visible')&&getComputedStyle(document.activeElement).outlineWidth==='3px'`));
  await click(s,'Reset appearance to white and sage');const reset=await read(s);assert.equal(reset.background,initial.background);assert.equal(reset.storage,0);assert.equal(reset.draft,'SYNTHETIC VIVID DRAFT');
  await click(s,'Appearance','summary');await screenshot(s,`${width}-reset.png`);
  await send('Emulation.setDeviceMetricsOverride',{width,height:3000,deviceScaleFactor:1,mobile:width===390},s);const tall=await read(s);assert.ok(tall.height>=3000&&Math.ceil(tall.height)>=tall.scroll[1]);assert.equal(tall.scroll[0],width);observations.push({width,reset,tall,targets});await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390},s);
  // Reload loses only the theme state (the app documents other tab state is volatile too).
  await click(s,'Appearance','summary');await click(s,'Juliette');await click(s,'Falling flowers','label');await send('Page.reload',{},s);await until(()=>evaluate(s,`!!document.querySelector('[role=timer]')`),'reload');assert.equal((await read(s)).background,initial.background);assert.equal((await flowers(s)).length,0);
  if(width===1440) {
   assert.equal(frames.filter(f=>f.session===s).length,0,'Solo has no social socket');
   const peer=await page(1440,900);await click(s,'Party');await input(s,'Your name','Synthetic first');await until(()=>evaluate(s,`![...document.querySelectorAll('button')].find(e=>e.textContent==='Create room').disabled`),'connect');await click(s,'Create room');const code=await until(()=>evaluate(s,`document.querySelector('[aria-label="Room code"]')?.textContent`),'room');await click(s,'Keep personal clock');
   await click(peer,'Party');await input(peer,'Your name','Synthetic second');await input(peer,'Invite code',code);await until(()=>evaluate(peer,`![...document.querySelectorAll('button')].find(e=>e.textContent==='Join room').disabled`),'peer connect');await click(peer,'Join room');await until(()=>evaluate(peer,`!!document.querySelector('[aria-label="Room code"]')`),'joined');await click(peer,'Keep personal clock');await sleep(100);
   const peerBefore=await read(peer),eventCount=frames.filter(f=>/^42/.test(f.payload)).length;
   await click(s,'Appearance','summary');await click(s,'Juliette');await click(s,'Falling flowers','label');await click(s,'Falling flowers','label');for(const [theme,toggle] of [['Moon Garden','Drifting moonlight'],['Autumn Letters','Falling leaves']]){await click(s,theme);await click(s,toggle,'label');await click(s,toggle,'label');}await typeHex(s,'First custom HEX','url(unsafe)');await typeHex(s,'First custom HEX','#000000');await click(s,'Forest Study');await click(s,'Reset appearance to white and sage');await sleep(150);
   assert.equal(frames.filter(f=>/^42/.test(f.payload)).length,eventCount,'no outgoing room events');const peerAfter=await read(peer);assert.equal(peerAfter.background,peerBefore.background);assert.equal(peerAfter.timer,peerBefore.timer);assert.equal((await flowers(peer)).length,0);await contrast(s,'party');await contrast(peer,'party-peer');observations.push({party:true,eventCount,afterEvents:frames.filter(f=>/^42/.test(f.payload)).length,peerBefore,peerAfter});
  }
 }
 assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(requests.filter(r=>!r.url.startsWith(url)).length,0);
 await writeFile(new URL('observations.json',out),JSON.stringify({passed:true,url,observations,shots,errors,requests,frames},null,2));console.log(JSON.stringify({passed:true,screenshots:shots.length,errors:errors.length,externalRequests:0,output:out.pathname}));
} catch(error) { await writeFile(new URL('failure.json',out),JSON.stringify({error:String(error),observations,shots,errors,requests,frames},null,2));throw error;
} finally {
 if(ws?.readyState===WebSocket.OPEN){await send('Browser.close').catch(()=>{});ws.close();}
 if(chrome.exitCode===null){chrome.kill('SIGTERM');await new Promise(r=>chrome.once('exit',r));}
 await server.close();await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});
 assert.equal(server.http.listening,false);
 await assert.rejects(fetch(url));await assert.rejects(access(profile));
 await writeFile(new URL('cleanup.json',out),JSON.stringify({url,serverListening:server.http.listening,chromeExitCode:chrome.exitCode,chromeSignal:chrome.signalCode,profile,profileRemoved:true,serverFetchRejected:true},null,2));
}
