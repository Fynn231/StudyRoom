import { tmpdir as publicationTmpdir } from 'node:os';
// Opt-in real Codex acceptance: never included in npm test, never a fixture.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { createStudyServer } from '../server/app.ts';
const script = fileURLToPath(new URL('../server/codex-inference.cjs', import.meta.url));
await access(script);
const app = createStudyServer(undefined, Date.now, { executable: process.execPath, script, timeoutMs: 60000 });
const out = new URL('../.test-output/ai-live/', import.meta.url); await mkdir(out, { recursive: true });
try {
 const url = await app.listen(0);
 const request = { requestId: crypto.randomUUID(), budgetMinutes: 20, sources: [{ id: crypto.randomUUID(), text: 'SYNTHETIC STUDY: A moon reflects light from its star; it does not emit its own visible light. A crescent phase occurs when only part of its illuminated hemisphere faces an observer.' }], answers: [] };
 assert.equal((await (await fetch(url+'/api/ai/status')).json()).liveVerified, false);
 const response = await fetch(url+'/api/ai/plan', { method: 'POST', headers: { Origin: url, 'Content-Type':'application/json' }, body: JSON.stringify(request) });
 const body = await response.json();
 await writeFile(new URL('real-endpoint-result.json',out),JSON.stringify({ status: response.status, request, body },null,2));
 assert.equal(response.status,200); assert.equal(body.requestId,request.requestId); assert.ok(body.plan.objectives.length); assert.equal(body.verification.serverReportedModel,'gpt-6.1-sol'); assert.equal(body.verification.provider,'openai-codex'); assert.equal(body.verification.endpointHost,'chatgpt.com'); assert.equal(body.verification.maxRetries,0); assert.equal(body.verification.toolsEnabled,false);
 console.log(JSON.stringify({ passed:true, verification:body.verification, steps:body.plan.steps.length }));
} finally { await app.close(); }
