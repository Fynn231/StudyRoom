import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStudyServer } from '../server/app.js';
import { fileURLToPath } from 'node:url';
const request = { requestId: '11111111-1111-4111-8111-111111111111', budgetMinutes: 25, sources: [{ id: '22222222-2222-4222-8222-222222222222', text: 'Synthetic moons reflect light.' }], answers: [] };
test('inference API requires explicit same-origin JSON; configured is not live verified', async t => {
  const app = createStudyServer(); t.after(() => app.close()); const url = await app.listen(0);
  const status = await fetch(url + '/api/ai/status');
  assert.match(status.headers.get('content-type') ?? '', /application\/json/, 'missing AI API');
  assert.deepEqual(await status.json(), { configured: false, liveVerified: false });
  for (const origin of [undefined, 'https://evil.invalid', url.replace('127.0.0.1', 'localhost')]) {
    const response = await fetch(url + '/api/ai/plan', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(request) }); assert.equal(response.status, 403);
  }
  assert.equal((await fetch(url + '/api/ai/plan', { method: 'POST', headers: { Origin: url, 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
  assert.equal((await fetch(url + '/api/ai/plan', { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json' }, body: JSON.stringify(request) })).status, 503);
});
test('real bounded subprocess path validates output without sharing provider configuration', async t => {
  const app = createStudyServer(undefined, Date.now, { executable: process.execPath, script: fileURLToPath(new URL('./fixtures/ai-model.mjs', import.meta.url)), timeoutMs: 1500 });
  t.after(() => app.close()); const url = await app.listen(0);
  assert.deepEqual(await (await fetch(url + '/api/ai/status')).json(), { configured: true, liveVerified: false });
  const post = (body: unknown, headers = {}) => fetch(url + '/api/ai/plan', { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await post({ ...request, model: 'browser-selected' })).status, 400);
  assert.equal((await post({ ...request, padding: 'x'.repeat(25000) })).status, 413);
  const response = await post(request); assert.equal(response.status, 200); const result = await response.json();
  assert.equal(result.requestId, request.requestId); assert.equal(result.plan.steps[0].sourceIds[0], request.sources[0].id);
  assert.deepEqual(await (await fetch(url + '/api/ai/status')).json(), { configured: true, liveVerified: true });
  assert.equal((await post({ ...request, answers: [{ question: 'Synthetic mode?', answer: 'invalid' }] })).status, 502);
  for (const answer of ['missing-verification', 'wrong-model']) {
    const rejected = await post({ ...request, answers: [{ question: 'Synthetic mode?', answer }] });
    assert.equal(rejected.status, 502, 'a valid plan without trusted route verification must be rejected');
    assert.ok(!(await rejected.text()).includes('unexpected-fixture-model'), 'provider details stay out of error responses');
  }
  assert.equal((await post(request, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
});
