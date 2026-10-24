import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createMusicHandler} from '../server/music.js';
const config={supabaseUrl:'https://synthetic-music.invalid',anonKey:'sb_publishable_synthetic',publicOrigin:'https://study.example'};
const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const enc=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
const exp=Math.floor(Date.now()/1000)+60;const raw=`${enc({alg:'ES256',kid:'s'})}.${enc({sub:'one',aud:'authenticated',iss:config.supabaseUrl+'/auth/v1',exp,session_id:'session-one'})}`;
const token=`${raw}.${sign('sha256',Buffer.from(raw),{key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')}`;
const user={id:'one',sessionId:'session-one',expiresAt:exp*1000,email:'',name:''};
test('synthetic hosted music binds owner/session, callback cookie/state and original live token without bearer',async()=>{
 const original=globalThis.fetch;let live=true;let exchanges=0;
 globalThis.fetch=async input=>String(input).endsWith('jwks.json')?Response.json({keys:[{...keys.publicKey.export({format:'jwk'}),kid:'s',alg:'ES256'}]}):Response.json(live);
 const handler=createMusicHandler({clientId:'a'.repeat(32),origin:config.publicOrigin},{auth:config,fetch:async()=>{exchanges++;return Response.json({access_token:'SYNTHETIC_SPOTIFY',token_type:'Bearer',expires_in:60,scope:'streaming user-read-email user-read-private user-modify-playback-state'});}});
 const invoke=(url:string,method='GET',cookie='',identity:unknown={user,token})=>new Promise<{status:number;body:any;headers:Record<string,string>}>((resolve)=>{
  const headers:Record<string,string>={};let status=200;
  const req={url,method,headers:{host:'study.example',origin:config.publicOrigin,cookie}};
  const res=Object.assign(new EventEmitter(),{setHeader:(k:string,v:string)=>headers[k.toLowerCase()]=v,writeHead:(s:number,h?:Record<string,string>)=>{status=s;Object.assign(headers,h);},end:(s='')=>resolve({status,body:s?JSON.parse(s):null,headers})});
  void handler(req as any,res as any,identity as any);
 });
 try{
  const begin=await invoke('/api/music/spotify/begin','POST');assert.equal(begin.status,200);
  assert.match(begin.headers['set-cookie'],/; Secure/);let cookie=begin.headers['set-cookie'].split(';')[0];
  const state=new URL(begin.body.url).searchParams.get('state');const callback=`/api/music/spotify/callback?state=${state}&code=synthetic`;
  assert.equal((await invoke(callback,'GET','',null)).status,400);assert.equal(exchanges,0);
  const ok=await invoke(callback,'GET',cookie,null);assert.equal(ok.status,303);assert.equal(exchanges,1);
  cookie=ok.headers['set-cookie'].split(';')[0];
  assert.equal((await invoke('/api/music/spotify/token','POST',cookie,{user:{...user,id:'two'},token})).status,403);
  assert.equal((await invoke('/api/music/disconnect','POST',cookie,{user:{...user,sessionId:'other'},token})).status,403);
  assert.equal((await invoke('/api/music/spotify/token','POST',cookie)).body.access_token,'SYNTHETIC_SPOTIFY');
  const foreign={user:{...user,id:'two'},token};
  assert.equal((await invoke('/api/music/status','GET',cookie,foreign)).body.spotify.authorized,false);
  assert.equal((await invoke('/api/music/spotify/begin','POST',cookie,foreign)).status,200,'the next account can begin its own music connection');
  const pending=await invoke('/api/music/spotify/begin','POST');live=false;
  assert.equal((await invoke(`/api/music/spotify/callback?state=${new URL(pending.body.url).searchParams.get('state')}&code=synthetic`,'GET',pending.headers['set-cookie'].split(';')[0],null)).status,401);
  assert.equal(exchanges,1,'revoked original session never exchanges provider code');
 }finally{handler.close?.();globalThis.fetch=original;}
});
