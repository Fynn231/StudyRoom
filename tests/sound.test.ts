import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as sound from '../src/sound.js';
export function fakeAudio() {
  const events: any[][] = []; const nodes: any[] = [];
  const param = () => ({ value: 1, setValueAtTime: (...a: any[]) => events.push(['set', ...a]), linearRampToValueAtTime: (...a: any[]) => events.push(['ramp', ...a]) });
  const ctx: any = { currentTime: 10, state: 'running', destination: {}, resume: async () => { events.push(['resume']); }, close: async () => { ctx.state = 'closed'; events.push(['close']); },
    createGain: () => { const n = { gain: param(), connect() {}, disconnect() { events.push(['disconnect']); } }; nodes.push(n); return n; },
    createOscillator: () => { const n: any = { frequency: param(), type: '', connect() {}, disconnect() {}, start: (...a: any[]) => events.push(['start', ...a]), stop: (...a: any[]) => events.push(['stop', ...a]), onended: null }; nodes.push(n); return n; } };
  return { ctx, events, nodes };
}
test('original chime schedules explicit zero onset, bounded low peaks and fade to zero with cleanup', () => {
  assert.equal(typeof sound.scheduleFocusChime, 'function');
  const f = fakeAudio(); let ended = 0;
  const cancel = sound.scheduleFocusChime(f.ctx, () => ended++);
  assert.equal(f.events.filter(e => e[0] === 'start').length, 3);
  const gains = f.nodes.filter(n => n.gain);
  assert.equal(gains.length, 3);
  assert.equal(gains.every(n => n.gain.value === 0), true);
  const ramps = f.events.filter(e => e[0] === 'ramp');
  assert.equal(ramps.some(e => e[1] > 0 && e[1] <= .025), true);
  assert.equal(ramps.every(e => e[1] <= .025), true);
  assert.equal(ramps.filter(e => e[1] === 0).length, 3);
  cancel(); cancel(); assert.equal(ended, 1);
});
test('controller is silent until play, closes on completion/cancel and cannot revive cancelled resume', async () => {
  assert.equal(typeof sound.createFocusChime, 'function');
  const f = fakeAudio(); const chime = sound.createFocusChime(() => f.ctx);
  await chime.prepare(); assert.equal(f.events.some(e => e[0] === 'start'), false);
  assert.equal(await chime.play(), true);
  f.nodes.filter(n => n.frequency).forEach(n => n.onended?.());
  assert.equal(f.events.filter(e => e[0] === 'close').length, 1);
  const slow = fakeAudio(); let resume!: () => void;
  slow.ctx.resume = () => new Promise<void>(r => { resume = r; });
  const pending = sound.createFocusChime(() => slow.ctx); const ready = pending.prepare(); pending.cancel(); resume();
  assert.equal(await ready, false); assert.equal(await pending.play(), false);
  assert.equal(slow.events.some(e => e[0] === 'start'), false);
  assert.equal(slow.events.filter(e => e[0] === 'close').length, 1);
});
test('locked start is a distinct two-tone with zero envelopes, normal cue stays three voices', async()=>{
 const f=fakeAudio(),chime=sound.createFocusChime(()=>f.ctx);await chime.prepare();await chime.play('locked');
 assert.equal(f.events.filter(e=>e[0]==='start').length,2);
 assert.equal(f.events.filter(e=>e[0]==='ramp' && e[1]===0).length,2);
 assert.ok(f.events.some(e=>e[0]==='set' && e[1]===164.81));chime.cancel();
});
test('unsupported, denied resume and scheduling errors are reported without throws or leaked contexts', async () => {
  assert.equal(typeof sound.createFocusChime, 'function');
  const errors: string[] = [];
  const missing = sound.createFocusChime(() => { throw Error('unsupported'); }, s => errors.push(s));
  assert.equal(await missing.prepare(), false); assert.equal(await missing.play(), false);
  const f = fakeAudio(); f.ctx.resume = async () => { throw Error('denied'); };
  const denied = sound.createFocusChime(() => f.ctx, s => errors.push(s));
  assert.equal(await denied.prepare(), false); assert.equal(f.ctx.state, 'closed');
  const broken = fakeAudio(); broken.ctx.createOscillator = () => { throw Error('broken'); };
  const fail = sound.createFocusChime(() => broken.ctx, s => errors.push(s));
  await fail.prepare(); assert.equal(await fail.play(), false); assert.equal(broken.ctx.state, 'closed');
  assert.equal(errors.length, 3);
});
