import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {JSDOM} from 'jsdom';
import {App} from '../src/App.js';
import {completeAuthRedirect} from '../src/auth.js';

test('literal invite prefill focuses name but never joins, creates or starts; malformed tokens stay rejected', async t=>{
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost/?room=AB12CD'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const {render,within,cleanup}=await import('@testing-library/react'); t.after(()=>{cleanup();dom.window.close();});
 let view=render(<App/>),q=within(view.container);
 assert.equal((q.getByLabelText('Invite code') as HTMLInputElement).value,'AB12CD');
 assert.equal(document.activeElement,q.getByLabelText('Your name'));
 assert.equal(q.queryByLabelText('Room code'),null); assert.equal(q.getByRole('timer').textContent,'25:00');
 assert.match(view.container.textContent!,/same device/i);
 view.unmount();dom.window.history.replaceState(null,'','/?room=ab12cd');view=render(<App/>);q=within(view.container);
 assert.equal(q.queryByLabelText('Invite code'),null);assert.match(view.container.textContent!,/invalid invite/i);
});
test('auth callback strips secret fields but preserves only an exact valid invite',async t=>{
 const dom=new JSDOM('<html/>',{url:'http://localhost/auth/confirm?code=synthetic&room=AB12CD'});Object.assign(globalThis,{window:dom.window});t.after(()=>dom.window.close());
 await completeAuthRedirect({auth:{exchangeCodeForSession:async()=>({error:null})}} as any,new URL(dom.window.location.href));
assert.equal(dom.window.location.pathname,'/');assert.equal(dom.window.location.search,'?room=AB12CD');
});
test('email template callback recovers invite only from the exact same-origin redirect target',async t=>{
 const dom=new JSDOM('<html/>',{url:'http://localhost/'});Object.assign(globalThis,{window:dom.window});t.after(()=>dom.window.close());
 const sup={auth:{verifyOtp:async()=>({error:null})}} as any;
 await completeAuthRedirect(sup,new URL('http://localhost/auth/confirm?token_hash=synthetic&type=email&invite_redirect=http://localhost/auth/confirm?room=AB12CD'));
 assert.equal(dom.window.location.search,'?room=AB12CD');
 await completeAuthRedirect(sup,new URL('http://localhost/auth/confirm?token_hash=synthetic&type=email&invite_redirect=https://evil.invalid/auth/confirm?room=AB12CD'));
 assert.equal(dom.window.location.search,'');
});
