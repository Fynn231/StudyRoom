import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createStudyServer} from '../server/app.js';
const origin='https://study.example';const provider='https://synthetic-http.invalid';
const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const enc=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
function token(exp=Math.floor(Date.now()/1000)+60){const raw=`${enc({alg:'ES256',kid:'s'})}.${enc({sub:'one',aud:'authenticated',iss:provider+'/auth/v1',exp,session_id:'session-one'})}`;return `${raw}.${sign('sha256',Buffer.from(raw),{key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')}`;}
// Actual HTTP request listener, in-memory transport: no sandbox listen permission needed.
export async function request(app:ReturnType<typeof createStudyServer>,url:string,tokenValue?:string,headers:Record<string,string>={},method='GET'){
 return new Promise<{status:number;body:string;headers:Record<string,string>}>((resolve,reject)=>{
  const req=Object.assign(new EventEmitter(),{url,method,headers:{host:'study.example',...(tokenValue?{authorization:`Bearer ${tokenValue}`} : {}),...headers},socket:{remoteAddress:'synthetic'}});
  const h:Record<string,string>={};let status=200;
  const res=Object.assign(new EventEmitter(),{setHeader:(k:string,v:string)=>h[k.toLowerCase()]=v,writeHead:(code:number,extra?:Record<string,string>)=>{status=code;Object.assign(h,extra);},end:(body='')=>resolve({status,body,headers:h})});
  try{app.http.emit('request',req,res);}catch(error){reject(error);}
 });
}
test('synthetic hosted HTTP checks each request via RPC; config is public; missing RPC, expiry, revocation and outage deny',async()=>{
 const names=['STUDY_PROXY_POLICY','STUDY_DEPLOYMENT_MODE','STUDY_PUBLIC_ORIGIN','SUPABASE_URL','SUPABASE_ANON_KEY'];const saved=names.map(n=>process.env[n]);
 Object.assign(process.env,{STUDY_PROXY_POLICY:'render',STUDY_DEPLOYMENT_MODE:'hosted',STUDY_PUBLIC_ORIGIN:origin,SUPABASE_URL:provider,SUPABASE_ANON_KEY:'sb_publishable_synthetic'});
 const original=globalThis.fetch;let live=true;let status=200;let rpc=0;
 globalThis.fetch=async input=>String(input).endsWith('jwks.json')?Response.json({keys:[{...keys.publicKey.export({format:'jwk'}),kid:'s',alg:'ES256'}]}):(rpc++,Response.json(live,{status}));
 const app=createStudyServer(undefined,Date.now,{executable:'/synthetic-must-never-run',script:'/synthetic-must-never-run'});
 try{
  assert.equal((await request(app,'/api/session',token())).status,200);assert.equal(rpc,1);
  assert.equal(JSON.parse((await request(app,'/api/ai/status',token())).body).configured,false);
  assert.equal((await request(app,'/api/ai/plan',token(),{origin},'POST')).status,503,'hosted personal subprocess is disabled even with explicit config');
  const config=await request(app,'/api/config');assert.equal(config.status,200);assert.deepEqual(Object.keys(JSON.parse(config.body).auth).sort(),['anonKey','required','url']);assert.doesNotMatch(config.body,/service_role|sb_secret|access_token/);
  assert.equal((await request(app,'/healthz')).status,200);
  assert.equal((await request(app,'/api/session')).status,401);
  assert.equal((await request(app,'/api/session',token(1))).status,401);
  live=false;assert.equal((await request(app,'/api/session',token())).status,401);
  status=404;assert.match((await request(app,'/api/session',token())).body,/session|setup|RPC/i);
  globalThis.fetch=async()=>{throw Error('synthetic provider outage');};assert.equal((await request(app,'/api/session',token())).status,401);
  assert.equal((await request(app,'/api/config',undefined,{origin:'https://hostile.example','x-forwarded-host':'study.example'})).status,403);
  let last=0;for(let i=0;i<240;i++)last=(await request(app,'/api/config')).status;assert.equal(last,429,'all hosted HTTP requests consume a finite budget');
 }finally{await app.close();globalThis.fetch=original;names.forEach((n,i)=>{if(saved[i]===undefined)delete process.env[n];else process.env[n]=saved[i];});}
});
