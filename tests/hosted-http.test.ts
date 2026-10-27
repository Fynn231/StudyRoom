import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {generateKeyPairSync,sign} from 'node:crypto';
import {siteHandler} from '../server/site.js';
import {createStudyServer} from '../server/app.js';
const origin='https://study.example';const provider='https://synthetic-http.invalid';
const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const enc=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
function token(exp=Math.floor(Date.now()/1000)+60){const raw=`${enc({alg:'ES256',kid:'s'})}.${enc({sub:'one',aud:'authenticated',iss:provider+'/auth/v1',exp,session_id:'session-one'})}`;return `${raw}.${sign('sha256',Buffer.from(raw),{key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')}`;}
// Actual HTTP request listener, in-memory transport: no sandbox listen permission needed.
export async function request(app:ReturnType<typeof createStudyServer>,url:string,tokenValue?:string,headers:Record<string,string>={},method='GET'){
 return new Promise<{status:number;body:string;headers:Record<string,string>}>((resolve,reject)=>{
  const req=Object.assign(new EventEmitter(),{url,method,headers:{host:'study.example',...(tokenValue?{authorization:`Bearer ${tokenValue}`} : {}),...headers},socket:{remoteAddress:'synthetic'}});
  const h:Record<string,string>={};let status=200;
  const res=Object.assign(new EventEmitter(),{setHeader:(k:string,v:string)=>h[k.toLowerCase()]=v,writeHead:(code:number,extra?:Record<string,string>)=>{status=code;for(const [k,v] of Object.entries(extra??{}))h[k.toLowerCase()]=v;},end:(body: string | Buffer='')=>resolve({status,body:String(body),headers:h})});
  try{app.http.emit('request',req,res);}catch(error){reject(error);}
 });
}
test('synthetic hosted HTTP checks each request via RPC; config is public; missing RPC, expiry, revocation and outage deny',async()=>{
 const names=['STUDY_PROXY_POLICY','STUDY_DEPLOYMENT_MODE','STUDY_PUBLIC_ORIGIN','SUPABASE_URL','SUPABASE_ANON_KEY'];const saved=names.map(n=>process.env[n]);
 Object.assign(process.env,{STUDY_PROXY_POLICY:'render',STUDY_DEPLOYMENT_MODE:'hosted',STUDY_PUBLIC_ORIGIN:origin,SUPABASE_URL:provider,SUPABASE_ANON_KEY:'sb_publishable_synthetic'});
 const original=globalThis.fetch;let live=true;let status=200;let rpc=0;
 globalThis.fetch=async input=>String(input).endsWith('jwks.json')?Response.json({keys:[{...keys.publicKey.export({format:'jwk'}),kid:'s',alg:'ES256'}]}):(rpc++,Response.json(live,{status}));
 const app=createStudyServer(siteHandler,Date.now,{executable:'/synthetic-must-never-run',script:'/synthetic-must-never-run'});
 try{
  // Public reads survive an internal Host mismatch, without trusting forwarding.
  for (const path of ['/', '/auth/confirm?code=synthetic', '/healthz', '/api/config']) {
    assert.equal((await request(app,path,undefined,{host:'render-internal:10000','x-forwarded-host':'evil.example'})).status,200,path);
    assert.equal((await request(app,path,undefined,{host:'render-internal',origin:'https://hostile.example','x-forwarded-host':'study.example'})).status,200,path);
    assert.equal((await request(app,path,undefined,{host:'render-internal'},'POST')).status,403,path);
  }
  const navigationOrigin='http://127.0.0.1:4187';
  const browserHeaders={host:'127.0.0.1:4187',origin:navigationOrigin,'sec-fetch-site':'same-origin','sec-fetch-mode':'cors'};
  const shell=await request(app,'/',undefined,{host:'127.0.0.1:4187'});
  const assets=[...shell.body.matchAll(/(?:src|href)="([^" ]+\.(?:js|css))"/g)].map(m=>m[1]);
  assert.ok(assets.some(p=>p.endsWith('.js')));assert.ok(assets.some(p=>p.endsWith('.css')));
  for(const path of [...assets,'/api/config','/healthz']) {
    for(const method of ['GET','HEAD']) {
      const response=await request(app,path,undefined,browserHeaders,method);
      assert.equal(response.status,200,path);
      if(method==='HEAD')assert.equal(response.body,'');
      assert.equal(response.headers['access-control-allow-origin'],undefined);
      assert.equal(response.headers['access-control-allow-credentials'],undefined);
      assert.equal(response.headers['set-cookie'],undefined);
    }
  }
  for(const path of ['/api/session','/api/ai/status','/api/music/status','/api/music/spotify/callback?code=synthetic','/unknown','/assets/nested/private.js']) {
    assert.equal((await request(app,path,undefined,browserHeaders)).status,403,path);
    assert.equal((await request(app,path,undefined,{origin:navigationOrigin})).status,403,path);
  }
  assert.equal(JSON.parse((await request(app,'/api/config',undefined,{host:'render-internal'})).body).auth.publicOrigin,origin);
  for (const path of ['/healthz','/api/config']) {
    const head=await request(app,path,undefined,{host:'render-internal'},'HEAD');
    assert.equal(head.status,200);assert.equal(head.body,'');
    assert.equal((await request(app,path,undefined,{'sec-fetch-site':'cross-site','sec-fetch-mode':'cors'})).status,200);
    assert.equal((await request(app,path,undefined,{host:'render-internal','sec-fetch-site':'cross-site','sec-fetch-mode':'navigate'})).status,200);
  }
  assert.equal((await request(app,'/unknown',undefined,{host:'render-internal'})).status,403);

  for (const path of ['/api/session','/api/ai/status','/api/music/status']) {
    assert.equal((await request(app,path)).status,401,path);
    assert.equal((await request(app,path,'malformed')).status,401,path);
    assert.equal((await request(app,path,undefined,{host:'render-internal','x-forwarded-host':'study.example',forwarded:'host=study.example;proto=https'})).status,403,path);
  }
  assert.equal((await request(app,'/api/session',token())).status,200);assert.equal(rpc,1);
  assert.equal(JSON.parse((await request(app,'/api/ai/status',token())).body).configured,false);
  assert.equal((await request(app,'/api/ai/plan',token(),{origin},'POST')).status,503,'hosted personal subprocess is disabled even with explicit config');
  const config=await request(app,'/api/config');assert.equal(config.status,200);assert.deepEqual(Object.keys(JSON.parse(config.body).auth).sort(),['anonKey','publicOrigin','required','url']);assert.doesNotMatch(config.body,/service_role|sb_secret|access_token/);
  assert.equal((await request(app,'/healthz')).status,200);
  assert.equal((await request(app,'/api/session')).status,401);
  assert.equal((await request(app,'/api/session',token(1))).status,401);
  live=false;assert.equal((await request(app,'/api/session',token())).status,401);
  status=404;assert.match((await request(app,'/api/session',token())).body,/session|setup|RPC/i);
  globalThis.fetch=async()=>{throw Error('synthetic provider outage');};assert.equal((await request(app,'/api/session',token())).status,401);
  assert.equal((await request(app,'/api/config',undefined,{origin:'https://hostile.example','x-forwarded-host':'study.example'})).status,200);
  let last=0;for(let i=0;i<240;i++)last=(await request(app,'/api/config')).status;assert.equal(last,429,'all hosted HTTP requests consume a finite budget');
 }finally{await app.close();globalThis.fetch=original;names.forEach((n,i)=>{if(saved[i]===undefined)delete process.env[n];else process.env[n]=saved[i];});}
});
