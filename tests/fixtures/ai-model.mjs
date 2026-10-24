// Synthetic subprocess contract fixture, NOT live model or identity acceptance.
let raw = ''; for await (const chunk of process.stdin) raw += chunk;
const r = JSON.parse(raw);
const plan = { objectives: ['Explain synthetic moonlight'], steps: [{ title: 'Compare reflected light', instructions: 'Read the selected passage and explain moonlight in your own words.', estimatedMinutes: 1, sourceIds: [r.sources[0].id] }], questions: [{ question: 'Would a diagram help?', sourceIds: [r.sources[0].id] }] };
const verification = { provider: 'openai-codex', serverReportedModel: 'gpt-6.1-sol', endpointHost: 'chatgpt.com', toolsEnabled: false, maxRetries: 0 };
if (r.answers[0]?.answer === 'invalid') process.stdout.write('{"providerSecret":"not-a-real-secret"}');
else if (r.answers[0]?.answer === 'missing-verification') process.stdout.write(JSON.stringify({ plan }));
else if (r.answers[0]?.answer === 'wrong-model') process.stdout.write(JSON.stringify({ plan, verification: { ...verification, serverReportedModel: 'unexpected-fixture-model' } }));
else process.stdout.write(JSON.stringify({ plan, verification }));
