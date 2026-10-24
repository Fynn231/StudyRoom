import {test} from 'node:test';
import assert from 'node:assert/strict';
import {get} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {generateKeyPairSync,sign} from 'node:crypto';
import {io, type Socket} from 'socket.io-client';
import {createStudyServer} from '../server/app.js';
const disconnected=(socket:Socket)=>new Promise<void>(resolve=>socket.once('disconnect',()=>resolve()));
const config={STUDY_DEPLOYMENT_MODE:'hosted',STUDY_PROXY_POLICY:'render',STUDY_PUBLIC_ORIGIN:'https://study.example',SUPABASE_URL:'https://synthetic-network.invalid',SUPABASE_ANON_KEY:'sb_publishable_synthetic'};
const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const enc=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
function token(seconds=60){const raw=`${enc({alg:'ES256',kid:'network'})}.${enc({sub:'one',session_id:'synthetic-session',aud:'authenticated',iss:config.SUPABASE_URL+'/auth/v1',exp:Math.floor(Date.now()/1000)+seconds})}`;return `${raw}.${sign('sha256',Buffer.from(raw),{key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')}`;}
// Listener tests require the parent's normal boundary. Do not bypass sandbox
// EPERM. Provider responses below are synthetic, never real account evidence.
test('synthetic hosted websocket handshake/event/idle lifetime accepts live sessions and rejects expiry, revocation, outage and hostile origins',{timeout:20000},async t=>{
 const saved=Object.keys(config).map(k=>process.env[k]);Object.assign(process.env,config);
 const original=globalThis.fetch;let live=true;let outage=false;
 globalThis.fetch=async input=>{
  if(outage)throw Error('synthetic outage');
  if(String(input).endsWith('jwks.json'))return Response.json({keys:[{...keys.publicKey.export({format:'jwk'}),kid:'network',alg:'ES256'}]});
  assert.equal(String(input),config.SUPABASE_URL+'/rest/v1/rpc/studyroom_session_active');return Response.json(live);
 };
 const app=createStudyServer();const sockets:Socket[]=[];
 t.after(async()=>{sockets.forEach(s=>s.disconnect());await app.close();globalThis.fetch=original;Object.keys(config).forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];});});
 const url=await app.listen(0);
 const connect=async(value?:string,origin=config.STUDY_PUBLIC_ORIGIN)=>{
  const s=io(url,{forceNew:true,reconnection:false,timeout:2000,transports:['websocket'],extraHeaders:{Host:'study.example',Origin:origin},auth:{token:value}});sockets.push(s);
  const accepted=await new Promise<boolean>(resolve=>{s.once('connect',()=>resolve(true));s.once('connect_error',()=>resolve(false));});return{s,accepted};
 };
 for(const value of [undefined,'malformed',token(-1)])assert.equal((await connect(value)).accepted,false);
 assert.equal((await connect(token(),'https://hostile.example')).accepted,false);
 const good=await connect(token());assert.equal(good.accepted,true);
 assert.equal((await good.s.timeout(2000).emitWithAck('room:create',{name:'Synthetic'})).ok,true);
 live=false;const eventClosed=disconnected(good.s);good.s.emit('intention:share',{text:'must not publish'});await eventClosed;
 live=true;const idle=await connect(token());assert.equal(idle.accepted,true);live=false;
 const started=Date.now();await disconnected(idle.s);assert.ok(Date.now()-started<=8500,'5s poll plus 3s timeout bound (with scheduler tolerance)');
 live=true;const expiring=await connect(token(2));assert.equal(expiring.accepted,true);await disconnected(expiring.s);
 const error=await connect(token());assert.equal(error.accepted,true);outage=true;const errorClosed=disconnected(error.s);error.s.emit('room:create',{name:'Denied'});await errorClosed;
});

test('actual configured hosted launcher serves health/config/callback shell and rejects anonymous API without contacting a real provider',{timeout:15000},async t=>{
 const child=spawn(process.execPath,['--import','tsx','server/start.ts'],{cwd:process.cwd(),env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,...config,PORT:'0'},stdio:['ignore','pipe','pipe']});
 let output='';const exited=once(child,'exit');t.after(async()=>{child.kill('SIGTERM');await exited;});child.stderr.on('data',d=>output+=d);
 const url=await new Promise<string>((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('No startup URL: '+output)),8000);
  child.stdout.on('data',d=>{output+=d;const m=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});
  child.once('exit',()=>{clearTimeout(timer);reject(Error('Launcher exited: '+output));});
 });
 const read=(path:string,headers={})=>new Promise<{status:number;body:string}>((resolve,reject)=>{
  get(url+path,{headers:{Host:'study.example',...headers}},res=>{let body='';res.on('data',d=>body+=d);res.on('end',()=>resolve({status:res.statusCode!,body}));}).on('error',reject);
 });
 assert.equal((await read('/healthz')).status,200);
 const publicConfig=await read('/api/config');assert.equal(JSON.parse(publicConfig.body).auth.required,true);assert.doesNotMatch(publicConfig.body,/service_role|sb_secret/);
 assert.equal((await read('/api/session')).status,401);
 assert.match((await read('/auth/confirm?code=synthetic')).body,/<title>Study Room/);
 assert.equal((await read('/api/config',{Host:'hostile.example','X-Forwarded-Host':'study.example'})).status,403);
});
