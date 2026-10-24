import { tmpdir as publicationTmpdir } from 'node:os';
// Actual built client + disposable Chrome. Hosted provider/session responses below
// are synthetic protocol fixtures, NOT genuine Supabase consent or login evidence.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,mkdir,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import WebSocket from 'ws';
import {createStudyServer} from '../server/app.ts';
import {siteHandler} from '../server/site.ts';
const scratch=publicationTmpdir(),out=process.env.STUDY_EVIDENCE||join(scratch,'studyroom-browser','browser');await mkdir(out,{recursive:true});
const app=createStudyServer(siteHandler);let chrome,profile,ws,aiApp,seq=0;const pending=new Map(),errors=[],posts=[];let hostedSession,callbackCalls=0;const hostedTargets=new Set();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,attempts=180){for(let i=0;i<attempts;i++){try{const r=await fn();if(r)return r;}catch{}await sleep(50);}throw Error('Timed out: '+label);}
function call(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
try{
 const url=await app.listen(0);profile=await mkdtemp(join(scratch,'studyroom-usability-chrome-'));
 chrome=spawn((process.env.CHROME_BIN || 'chromium'),['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:scratch,LANG:'en_US.UTF-8'},stdio:['ignore','ignore','pipe']});chrome.stderr.on('data',data=>process.stderr.write(data));
 const portFile=await until(async()=>await readFile(join(profile,'DevToolsActivePort'),'utf8'),'Chrome');const [port,path]=portFile.trim().split('\n');ws=new WebSocket(`ws://127.0.0.1:${port}${path}`);await once(ws,'open');
 ws.on('message',data=>{const m=JSON.parse(String(data));if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}return;}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);
  if(m.method==='Fetch.requestPaused'){const p=m.params,u=new URL(p.request.url),sid=m.sessionId;const respond=(status,body)=>call('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:url},{name:'Access-Control-Allow-Headers',value:'authorization,apikey,content-type,x-client-info,x-supabase-api-version'}],body:Buffer.from(JSON.stringify(body)).toString('base64')},sid);
   if(hostedTargets.has(sid)&&u.pathname==='/api/config')void respond(200,{mode:'hosted',auth:{required:true,url:'https://synthetic.invalid',anonKey:'sb_publishable_synthetic'}});
   else if(hostedTargets.has(sid)&&u.pathname==='/api/session')void respond(200,{ok:true});
   else if(u.hostname==='synthetic.invalid'){
    if(p.request.method==='OPTIONS')void respond(200,{});
    else if(u.pathname.endsWith('/otp')){posts.push({kind:'synthetic-email',redirect:u.searchParams.get('redirect_to')});void respond(200,{});}
    else if(u.pathname.endsWith('/verify')){callbackCalls++;void respond(200,hostedSession);}
    else if(u.pathname.endsWith('/user'))void respond(200,hostedSession.user);
    else void respond(400,{error:'Synthetic unavailable'});
   }else void call('Fetch.continueRequest',{requestId:p.requestId},sid);
  }
 });
 const ev=async(s,expression)=>(await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true},s)).result.value;
 async function tab(targetUrl,hosted=false){const t=await call('Target.createTarget',{url:'about:blank'}),s=(await call('Target.attachToTarget',{targetId:t.targetId,flatten:true})).sessionId;await call('Page.enable',{},s);await call('Runtime.enable',{},s);if(hosted){hostedTargets.add(s);await call('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]},s);}await call('Page.addScriptToEvaluateOnNewDocument',{source:`window.__partySockets=[];const WS=window.WebSocket;window.WebSocket=class extends WS{constructor(...args){super(...args);window.__partySockets.push(this)}};window.__sounds=[];const AC=window.AudioContext;window.AudioContext=class extends AC{createOscillator(){const o=super.createOscillator(),start=o.start.bind(o);o.start=(...a)=>{window.__sounds.push(o.frequency.value);return start(...a)};return o}}`},s);await call('Page.navigate',{url:targetUrl},s);return s;}
 const click=async(s,label)=>{
  // A peer's broadcast may arrive before this sender's acknowledgement. Wait for
  // the real enabled control; a DOM .click() can race React's pending render.
  const p=await until(()=>ev(s,`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)return null;b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`),'enabled '+label);
  for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1},s);
 };
 const hit=async(s,selector)=>{
  const p=await until(()=>ev(s,`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b||b.disabled)return null;b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`),'enabled '+selector);
  for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1},s);
 };
 const set=(s,label,value)=>ev(s,`(()=>{const l=[...document.querySelectorAll('label')].find(x=>x.textContent.trim()===${JSON.stringify(label)});const e=l?.control;if(!e)throw Error('field missing');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
 const has=(s,text)=>ev(s,`document.body.innerText.includes(${JSON.stringify(text)})`);const timer=s=>ev(s,`document.querySelector('[role=timer]')?.textContent`);
 const shot=async(s,name,width=1440,selector='main')=>{await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===390},s);await ev(s,`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'start'})`);await sleep(100);assert.equal(await ev(s,'document.documentElement.scrollWidth<=innerWidth'),true,'no horizontal overflow');const image=await call('Page.captureScreenshot',{format:'png'},s);await writeFile(join(out,name),Buffer.from(image.data,'base64'));};
 const a=await tab(url);await until(()=>has(a,'Personal focus'),'client A');assert.equal(await ev(a,'__sounds.length'),0);
 await set(a,'Focus length','37');await until(async()=>await timer(a)==='37:00','fresh preview');await sleep(1100);assert.equal(await timer(a),'37:00');await set(a,'Focus length','');assert.equal(await timer(a),'37:00');assert.equal(await has(a,'Enter a whole number'),true);await set(a,'Focus length','37');
 await click(a,'Start focus');await until(async()=>await ev(a,'__sounds.length')===3,'normal 3-tone');await click(a,'Pause focus');const paused=await timer(a);await sleep(1100);assert.equal(await timer(a),paused);await click(a,'Resume focus');assert.equal(await ev(a,'__sounds.length'),3);await click(a,'Reset timer');
 await click(a,'Party');await until(()=>ev(a,`![...document.querySelectorAll('button')].find(b=>b.textContent==='Create room').disabled`),'party socket');await set(a,'Your name','Synthetic host');await click(a,'Create room');const code=await until(()=>ev(a,`document.querySelector('[aria-label="Room code"]')?.textContent`),'created room');
 await click(a,'Copy link');await until(()=>has(a,'Invite link copied.'),'clipboard copy confirmation');assert.equal(await ev(a,`document.querySelector('[aria-label="Room invite link"]').value`),`${url}/?room=${code}`);assert.equal(await has(a,'same device'),true);
 const b=await tab(`${url}/?room=${code}`);await until(()=>has(b,'Join room'),'invite lobby');assert.equal(await ev(b,`document.activeElement===document.querySelector('input[placeholder="A name for this session"]')`),true);assert.equal(await ev(b,`document.querySelector('[aria-label="Room code"]')===null`),true);assert.equal(await ev(b,'__sounds.length'),0);
 await set(b,'Your name','Synthetic friend');await until(()=>ev(b,`![...document.querySelectorAll('button')].find(x=>x.textContent==='Join room').disabled`),'join enabled');await ev(b,`document.querySelector('input[placeholder="A name for this session"]').focus()`);await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'},b);await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},b);await until(()=>has(a,'Synthetic friend'),'real peer');for(const s of [a,b])await click(s,'Join room cycle');
 await set(a,'Focus length','7');assert.equal(await timer(a),'07:00');assert.equal(await timer(b),'25:00');await sleep(600);assert.equal(await timer(a),'07:00');await click(a,'Start focus');await until(()=>has(b,'In the flow'),'server Start reaches peer');assert.equal(await timer(b),'07:00');await click(b,'Pause focus');await until(()=>has(a,'A moment to pause'),'server Pause reaches host');await click(b,'Reset timer');await until(async()=>await timer(a)==='07:00','server Reset reaches host');assert.equal(await ev(b,'__sounds.length'),0,'remote Start and local Pause/Reset never play a start cue');
 await set(a,'Your session intention','Synthetic rice for 4');assert.equal(await has(b,'Synthetic rice for 4'),false);await click(a,'Share with room');await until(()=>has(b,'Synthetic rice for 4'),'opt-in share');await click(a,'Plan session');await set(a,'Paste a brief or external plan','1. Measure rice for 4\n2. Rinse rice\n3. Cook and check texture');await click(a,'Derive local checklist');await click(a,'Use reviewed plan');assert.equal(await has(b,'Measure rice for 4'),false,'private plan never broadcast');assert.equal(await has(b,'Spotify'),true,'independent music controls remain');
 await shot(a,'desktop-private-plan.png',1440,'.session-plan');await shot(a,'mobile-private-plan.png',390,'.session-plan');await shot(b,'peer-shared-clock.png',1440,'.focus-surface');
 // Admission is host-only; the shared timer remains collaborative for all.
 assert.equal(await ev(b,`!![...document.querySelectorAll('button')].find(x=>x.textContent==='Lock admission')`),false);
 await click(a,'Lock admission');await until(()=>has(b,'Admission locked'),'lock reaches existing peer');
 const c=await tab(`${url}/?room=${code}`);await until(()=>has(c,'Join room'),'third invite lobby');
 await set(c,'Your name','Synthetic newcomer');await set(c,'Your session intention','Private removed draft');
 await until(()=>ev(c,`![...document.querySelectorAll('button')].find(x=>x.textContent==='Join room').disabled`),'third socket');
 await click(c,'Join room');await until(()=>has(c,'This room is locked'),'locked admission error');assert.equal(await ev(c,`!!document.querySelector('[aria-label="Room code"]')`),false);
 await shot(a,'host-controls-desktop.png',1440,'.people-surface');await shot(a,'host-controls-mobile.png',390,'.people-surface');
 await click(a,'Unlock admission');await click(c,'Join room');await until(()=>has(a,'Synthetic newcomer'),'unlocked join');await click(c,'Join room cycle');
 await click(c,'Start focus');await until(()=>has(b,'In the flow'),'third participant Start sync');await click(b,'Pause focus');await until(()=>has(c,'A moment to pause'),'second participant Pause sync');await click(a,'Reset timer');await until(async()=>await timer(c)==='07:00','host Reset sync');
 await click(a,'Lock admission');await until(()=>has(c,'Admission locked'),'locked members remain');
 await hit(a,'button[aria-label="Remove Synthetic newcomer"]');await until(()=>has(c,'The host removed you'),'removal notice');
 assert.equal(await ev(c,`document.querySelector('textarea').value`),'Private removed draft');assert.equal(await ev(c,`!!document.querySelector('[aria-label="Room code"]')`),false);
 await click(c,'Join room');await until(()=>has(c,'This room is locked'),'removed membership cannot rejoin while locked');await shot(c,'removed-draft-mobile.png',390,'.party-lobby');
 await click(a,'Unlock admission');await click(c,'Join room');await until(()=>has(a,'Synthetic newcomer'),'explicit rejoin after removal');assert.equal(await has(a,'Private removed draft'),false);
 // Close the actual browser transport, not a mocked UI connection flag.
 await set(b,'Your session intention','Private reconnect draft');await click(b,'Share with room');await until(()=>has(a,'Private reconnect draft'),'explicit share before reconnect');
 const socketsBefore=await ev(b,'__partySockets.length');await ev(b,'__partySockets.filter(s=>s.readyState===1).forEach(s=>s.close())');
 await until(async()=>await ev(b,'__partySockets.length')>socketsBefore && await has(b,'Party connected') && await has(a,'Synthetic friend') && !await has(a,'Private reconnect draft'),'actual transport reconnect',250);
 assert.equal(await ev(b,`document.querySelector('textarea').value`),'Private reconnect draft');assert.equal(await has(b,'Shared focus'),true,'clock choice survives reconnect');
 // Denied clipboard permission is actionable without inventing a copied link.
 await ev(a,`window.__writeClipboard=navigator.clipboard.writeText.bind(navigator.clipboard);navigator.clipboard.writeText=async()=>{throw Error('Synthetic denied clipboard permission')}`);await click(a,'Copy link');await until(()=>has(a,'Copy unavailable. Select the link below.'),'copy fallback');
 assert.equal(await ev(a,`document.querySelector('[aria-label="Room invite link"]').value`),`${url}/?room=${code}`);await ev(a,`navigator.clipboard.writeText=window.__writeClipboard`);await call('Page.bringToFront',{},a);await click(a,'Copy link');await until(()=>has(a,'Invite link copied.'),'actual copy after fallback');
 // Real UI path with genuinely unconfigured AI: no synthetic successful AI plan.
 await set(a,'Change this plan','Use one pot');await click(a,'Request AI refinement');await until(()=>has(a,'AI unavailable'),'unconfigured AI fallback');assert.equal(await has(a,'Measure rice for 4'),true);assert.equal(await has(b,'Use one pot'),false);
 // LOCKED IN activation is silent; only its fresh Start schedules two tones.
 await click(a,'Keep personal clock');const n=await ev(a,'__sounds.length');for(let i=0;i<5;i++)await ev(a,`document.querySelector('.wordmark').click()`);assert.equal(await ev(a,'__sounds.length'),n);await ev(a,`document.querySelector('.timer-buttons button').click()`);await until(async()=>await ev(a,'__sounds.length')===n+2,'locked two-tone');await ev(a,`document.querySelector('.timer-buttons button').click()`);await ev(a,`document.querySelector('.timer-buttons button').click()`);assert.equal(await ev(a,'__sounds.length'),n+2,'resume silent');await shot(a,'locked-start-mobile.png',390,'.focus-surface');
 // Synthetic hosted callback: genuine built AuthProvider + SDK + AuthGate, but
 // fixtures replace the provider and live-session HTTP result.
 const exp=Math.floor(Date.now()/1000)+600,user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',user_metadata:{},app_metadata:{},created_at:new Date().toISOString()};
 hostedSession={access_token:[{alg:'HS256',typ:'JWT'},{sub:user.id,aud:'authenticated',role:'authenticated',exp,iat:exp-600,iss:'https://synthetic.invalid/auth/v1',session_id:'synthetic-browser-session'}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.synthetic',refresh_token:'synthetic-not-a-real-refresh',expires_in:600,expires_at:exp,token_type:'bearer',user};
 const h=await tab(`${url}/?room=${code}`,true);await until(()=>has(h,'Sign in to Study Room'),'hosted gate');assert.equal(await ev(h,`!!document.querySelector('[role=timer]')`),false);
 await set(h,'Email','synthetic@example.invalid');await click(h,'Send magic link');await until(()=>posts.length===1,'synthetic email begin');assert.equal(posts[0].redirect,`${url}/auth/confirm?room=${code}`);
 await call('Page.navigate',{url:`${url}/auth/confirm?token_hash=synthetic&type=email&invite_redirect=${encodeURIComponent(posts[0].redirect)}`},h);await until(()=>has(h,'Join room'),'hosted auth callback workspace');assert.equal(callbackCalls,1);assert.equal(await ev(h,'location.search'),`?room=${code}`);assert.equal(await ev(h,`document.querySelector('[aria-label="Room code"]')===null`),true);assert.equal(await ev(h,'__sounds.length'),0);assert.equal(await ev(h,`document.activeElement===document.querySelector('input[placeholder="A name for this session"]')`),true);
 await set(h,'Your session intention','Synthetic hosted goal');await click(h,'Plan session');assert.equal(await ev(h,`[...document.querySelectorAll('label')].find(x=>x.textContent.includes('Use local AI for planning choices')).control.disabled`),true);await set(h,'Paste a brief or external plan','First hosted task\nSecond hosted task');await click(h,'Derive local checklist');await click(h,'Use reviewed plan');await shot(h,'synthetic-hosted-fallback-mobile.png',390,'.session-plan');
 let genuineAI=false;
 if(process.env.STUDY_BROWSER_LIVE_AI==='1'){
  aiApp=createStudyServer(siteHandler,Date.now,{executable:process.execPath,script:resolve('server/codex-inference.cjs')});const liveUrl=await aiApp.listen(0),live=await tab(liveUrl);
  await until(()=>has(live,'Personal focus'),'live AI workspace');await set(live,'Your session intention','how to cook rice for 4');await click(live,'Plan session');
  await ev(live,`[...document.querySelectorAll('label')].find(x=>x.textContent.trim()==='Use local AI for planning choices').control.click()`);await click(live,'Time allocation');
  await until(()=>has(live,'Review replacement plan'),'genuine local bridge reply',1300);assert.equal(await has(live,'rice'),true);await click(live,'Use reviewed plan');
  const totals=await ev(live,`[...document.querySelectorAll('.session-plan input[type=number]')].map(x=>Number(x.value))`);assert.ok(totals.length>0);assert.ok(totals.every(n=>Number.isInteger(n)&&n>=1));assert.ok(totals.reduce((a,b)=>a+b,0)<=25);assert.equal(await timer(live),'25:00');assert.equal(await ev(live,'__sounds.length'),0);
  await shot(live,'genuine-ai-rice-desktop.png',1440,'.session-plan');await shot(live,'genuine-ai-rice-mobile.png',390,'.session-plan');genuineAI=true;
 }
 assert.deepEqual(errors,[]);await writeFile(join(out,'result.json'),JSON.stringify({ok:true,actualChrome:true,actualBuiltClient:true,twoRenderedClients:true,inviteExplicitJoin:true,inviteEnterJoin:true,hostLockRemove:true,threeRenderedClients:true,actualTransportReconnect:true,privateDraftSurvivesRemovalAndReconnect:true,clipboardFallback:true,privateDurationPreview:true,sharedStartPauseReset:true,intentionShareOptIn:true,privatePlanNotBroadcast:true,normalTones:3,lockedTones:2,resumeSilent:true,hostedCallback:'synthetic provider and session HTTP only',realProviderConsent:false,liveAI:'not configured on normal local server; actual error and pasted fallback verified',screenshots:genuineAI?10:8,genuineAI,errors},null,2));console.log('Actual disposable Chrome desktop/mobile: invite, two clients, clocks, privacy, fallback, audio and synthetic hosted callback passed.');
}catch(e){await writeFile(join(out,'failure.json'),JSON.stringify({error:String(e),errors},null,2));throw e;}
finally{if(ws?.readyState===WebSocket.OPEN){try{await call('Browser.close');}catch{}ws.close();}if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([once(chrome,'exit'),sleep(3000)]);}await app.close();await aiApp?.close();if(profile){for(let i=0;i<10;i++){try{await rm(profile,{recursive:true,force:true});break;}catch{await sleep(100);}}}}
