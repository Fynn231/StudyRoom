import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createSocketSession } from '../server/socketAuth.js';
const config={supabaseUrl:'https://synthetic-socket.invalid',anonKey:'sb_publishable_synthetic',publicOrigin:'https://study.example'};
const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const enc=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
function token(exp:number) {const raw=`${enc({alg:'ES256',kid:'s'})}.${enc({sub:'one',aud:'authenticated',iss:config.supabaseUrl+'/auth/v1',exp,session_id:'session-one'})}`;return `${raw}.${sign('sha256',Buffer.from(raw),{key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')}`;}

test('synthetic socket lifetime checks block delivery while checking, disconnect on revocation/outage, expire idle', async()=>{
 const original=globalThis.fetch;
 let live=true; let outage=false; let release:(()=>void)|undefined;
 globalThis.fetch=async input=>{
  if(String(input).endsWith('jwks.json')) return Response.json({keys:[{...keys.publicKey.export({format:'jwk'}),kid:'s',alg:'ES256'}]});
  if(release===undefined) await new Promise<void>(resolve=>{release=resolve;});
  if(outage) throw Error('synthetic outage'); return Response.json(live);
 };
 try{
  let closed=0; let idle=()=>{}; let expire=()=>{}; let delay=0;
  const exp=Math.floor(Date.now()/1000)+60;
  const session=createSocketSession(token(exp),config,{id:'one',email:'',name:'',sessionId:'session-one',expiresAt:exp*1000},()=>closed++,{
   interval:fn=>{idle=fn;return()=>{};},timeout:(fn,ms)=>{expire=fn;delay=ms;return()=>{};},
  });
  assert.ok(delay>0 && delay<=60000);
  const pending=session.check(); assert.equal(session.canDeliver(),false);
  for(let i=0;i<20 && !release;i++) await new Promise(resolve=>setImmediate(resolve));
  assert.ok(release);release!(); await pending; assert.equal(session.canDeliver(),true);
  live=false; await assert.rejects(session.check()); assert.equal(closed,1); assert.equal(session.canDeliver(),false);
  const second=createSocketSession(token(exp),config,{id:'one',email:'',name:'',sessionId:'session-one',expiresAt:exp*1000},()=>closed++,{interval:fn=>{idle=fn;return()=>{};},timeout:fn=>{expire=fn;return()=>{};}});
  outage=true; idle(); await new Promise(resolve=>setTimeout(resolve,20));assert.equal(closed,2);
  outage=false;live=true;
  const third=createSocketSession(token(exp),config,{id:'one',email:'',name:'',sessionId:'session-one',expiresAt:Date.now()-1},()=>closed++,{interval:()=>()=>{},timeout:()=>()=>{}});
  assert.equal(third.canDeliver(),false);
  const fourth=createSocketSession(token(exp),config,{id:'one',email:'',name:'',sessionId:'session-one',expiresAt:Date.now()+10},()=>closed++,{interval:()=>()=>{}});
  await new Promise(resolve=>setTimeout(resolve,25));assert.equal(fourth.canDeliver(),false);assert.equal(closed,3);
  session.dispose();second.dispose();third.dispose();fourth.dispose();
 }finally{globalThis.fetch=original;}
});
