import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{StrictMode} from 'react';
import {JSDOM} from 'jsdom';
import {AuthProvider,createSupabaseClient} from '../src/auth.js';
import {AuthGate} from '../src/AuthGate.js';

test('PKCE has exactly one callback owner; malformed callback shows recoverable sign-in form',async t=>{
 const dom=new JSDOM('<!doctype html><body></body>',{url:'https://study.example/auth/confirm?token_hash=synthetic&type=wrong'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true});
 const original=globalThis.fetch;
 globalThis.fetch=async input=>{
  if(String(input)==='/api/config')return Response.json({mode:'hosted',auth:{required:true,url:'https://synthetic.invalid',anonKey:'sb_publishable_synthetic'}});
  throw Error('Malformed callback must not contact the provider');
 };
 const rtl=await import('@testing-library/react');t.after(()=>{rtl.cleanup();globalThis.fetch=original;dom.window.close();});
 const view=rtl.render(<StrictMode><AuthProvider><AuthGate><p>PRIVATE CHILD</p></AuthGate></AuthProvider></StrictMode>);const q=rtl.within(view.container);
 await rtl.waitFor(()=>assert.match(view.container.textContent??'',/invalid|expired|malformed/i));
 assert.ok(q.getByRole('button',{name:'Send magic link'}));assert.equal(q.queryByText('PRIVATE CHILD'),null);
 assert.equal((q.getByRole('button',{name:'Send magic link'}) as HTMLButtonElement).disabled,false);
 const sup=createSupabaseClient('https://another-synthetic.invalid','sb_publishable_synthetic');
 assert.equal((sup.auth as any).detectSessionInUrl,false,'manual code/token_hash handler owns callbacks');
 await sup.auth.dispose();
});

test('synthetic provider lifecycle submits signed-out actions, isolates account state and storage, refresh preserves draft, logout disposes sockets/private UI',async t=>{
 const {AccountApp}=await import('../src/AccountApp.js');
 const dom=new JSDOM('<!doctype html><body></body>',{url:'https://study.example/'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,localStorage:dom.window.localStorage,sessionStorage:dom.window.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true});
 const original=globalThis.fetch;let session:any=null;let notify:(event:any,session:any)=>void=()=>{};let created=0,disposed=0,unsubscribed=0,emails=0,google=0,signouts=0;
 globalThis.fetch=async input=>{
  if(String(input)==='/api/config')return Response.json({mode:'hosted',auth:{required:true,url:'https://synthetic.invalid',anonKey:'sb_publishable_synthetic'}});
  if(String(input)==='/api/session')return Response.json({ok:true}); // synthetic server session check, not provider integration
  return Response.json({configured:false,liveVerified:false});
 };
 const factory=()=>{
  created++;
  return {auth:{
   onAuthStateChange:(fn:any)=>{notify=fn;return{data:{subscription:{unsubscribe:()=>unsubscribed++}}};},
   getSession:async()=>({data:{session},error:null}),dispose:async()=>{disposed++;},
   signInWithOtp:async(args:any)=>{emails++;assert.equal(args.email,'synthetic@example.invalid');assert.equal(args.options.emailRedirectTo,'https://study.example/auth/confirm');return{error:null};},
   signInWithOAuth:async(args:any)=>{google++;assert.equal(args.provider,'google');return{error:null};},
   signOut:async(args:any)=>{signouts++;assert.equal(args.scope,'global');session=null;notify('SIGNED_OUT',null);return{error:null};},
  }} as any;
 };
 const rtl=await import('@testing-library/react');t.after(()=>{rtl.cleanup();globalThis.fetch=original;dom.window.close();});
 dom.window.localStorage.setItem('studyroom.focusSetup.v1','confirmed');
 const view=rtl.render(<StrictMode><AuthProvider clientFactory={factory}><AuthGate><AccountApp/></AuthGate></AuthProvider></StrictMode>);const q=rtl.within(view.container);
 await rtl.waitFor(()=>assert.ok(q.getByRole('button',{name:'Send magic link'})));
 const email=q.getByLabelText('Email') as HTMLInputElement;
 // Native setter is needed because RTL was first imported against another JSDOM.
 const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!;setter.call(email,'synthetic@example.invalid');
 rtl.fireEvent.submit(email.closest('form')!);await rtl.waitFor(()=>assert.equal(emails,1));
 rtl.fireEvent.click(q.getByRole('button',{name:'Continue with Google'}));await rtl.waitFor(()=>assert.equal(google,1));
 const makeSession=(id:string,refresh=0)=>({user:{id,email:'synthetic@example.invalid',user_metadata:{}},access_token:`e30.${Buffer.from(JSON.stringify({session_id:'session-'+id,refresh})).toString('base64url')}.synthetic`,expires_at:Math.floor(Date.now()/1000)+60});
 const change=async(id:string,refresh=0)=>{session=makeSession(id,refresh);await rtl.act(async()=>notify('SIGNED_IN',session));await rtl.waitFor(()=>assert.ok(q.getByLabelText('Your session intention')));};
 await change('A');
 let draft=q.getByLabelText('Your session intention') as HTMLTextAreaElement;
 const textSetter=Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!;textSetter.call(draft,'PRIVATE A');rtl.fireEvent.input(draft);
 // React change handling across test realms is not needed to prove DOM reset;
 // use focus-setup's normal click to prove persisted state isolation.
 const checkbox=view.container.querySelector('.focus-setup input') as HTMLInputElement;
 assert.equal(checkbox.checked,false,'legacy local preference is not imported into hosted account A');rtl.fireEvent.click(checkbox);
 assert.equal(dom.window.localStorage.getItem('studyroom.account.A.studyroom.focusSetup.v1'),'confirmed');
 await change('A',1);assert.equal(q.getByLabelText('Your session intention'),draft,'refresh retains the mounted private workspace');assert.equal((draft as HTMLTextAreaElement).value,'PRIVATE A','refresh preserves unsaved input');
 await change('B');assert.equal((q.getByLabelText('Your session intention') as HTMLTextAreaElement).value,'');assert.equal((view.container.querySelector('.focus-setup input') as HTMLInputElement).checked,false);
 await change('A');assert.equal((q.getByLabelText('Your session intention') as HTMLTextAreaElement).value,'');assert.equal((view.container.querySelector('.focus-setup input') as HTMLInputElement).checked,true);
 rtl.fireEvent.click(q.getByRole('button',{name:'Sign out'}));await rtl.waitFor(()=>assert.ok(q.getByRole('button',{name:'Send magic link'})));assert.equal(signouts,1);assert.equal(q.queryByLabelText('Your session intention'),null);
 assert.equal(dom.window.localStorage.getItem('studyroom.focusSetup.v1'),'confirmed','unrelated legacy work is preserved');
 view.unmount();assert.equal(created,1,'StrictMode cancellation creates only one active client');assert.equal(disposed,1);assert.equal(unsubscribed,1);
});

test('synthetic explicit callbacks exchange OAuth once, verify email token_hash, reject duplicates and provider errors',async()=>{
 const {completeAuthRedirect}=await import('../src/auth.js');
 const dom=new JSDOM('',{url:'https://study.example/auth/confirm'});globalThis.window=dom.window as any;
 let exchanged=0,verified=0;
 const sup={auth:{exchangeCodeForSession:async(code:string)=>{exchanged++;assert.equal(code,'synthetic');return{error:null};},verifyOtp:async(args:any)=>{verified++;assert.deepEqual(args,{token_hash:'synthetic',type:'email'});return{error:null};}}} as any;
 try{
  await completeAuthRedirect(sup,new URL('https://study.example/auth/confirm?code=synthetic'));assert.equal(exchanged,1);
  await completeAuthRedirect(sup,new URL('https://study.example/auth/confirm?token_hash=synthetic&type=email'));assert.equal(verified,1);
  for(const query of ['code=a&code=b','token_hash=a&type=sms','error=access_denied','code=a&token_hash=b&type=email'])await assert.rejects(completeAuthRedirect(sup,new URL('https://study.example/auth/confirm?'+query)));
  assert.equal(exchanged,1);assert.equal(verified,1);
 }finally{dom.window.close();}
});
