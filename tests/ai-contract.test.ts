import { test } from 'node:test';
import assert from 'node:assert/strict';

test('AI boundary validates selected citations, bounded estimates and optional questions', async () => {
  const mod = await import('../src/aiStudy.js').catch(() => null);
  assert.ok(mod?.validatePlan, 'missing validated AI planning contract');
  const request = { requestId: '11111111-1111-4111-8111-111111111111', budgetMinutes: 25, sources: [{ id: '22222222-2222-4222-8222-222222222222', text: 'Synthetic moons reflect light.' }], answers: [] };
  const plan = { objectives: ['Explain reflected moonlight'], steps: [{ title: 'Explain reflection', instructions: 'Read the passage, then explain why this fictional moon shines.', estimatedMinutes: 10, sourceIds: [request.sources[0].id] }], questions: [{ question: 'Would a diagram or written explanation help?', sourceIds: [request.sources[0].id] }] };
  assert.deepEqual(mod.validatePlan(plan, mod.validateRequest(request)), plan);
  for (const bad of [ { ...plan, steps: [{ ...plan.steps[0], sourceIds: ['unknown'] }] }, { ...plan, steps: [{ ...plan.steps[0], estimatedMinutes: 26 }] }, { ...plan, objectives: ['bad\u0000'] }, { ...plan, questions: Array(3).fill(plan.questions[0]) }, { ...plan, steps: [] } ]) assert.throws(() => mod.validatePlan(bad, request));
  for (const bad of [{ ...request, budgetMinutes: 181 }, { ...request, sources: [] }, { ...request, sources: [request.sources[0], request.sources[0]] }, { ...request, endpoint: 'https://untrusted.invalid' }]) assert.throws(() => mod.validateRequest(bad));
});
