import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Render artifact explicitly uses free compute and disables automatic deploys instead of paid provider defaults', async () => {
  const blueprint = await readFile(new URL('../render.yaml', import.meta.url), 'utf8');
  assert.match(blueprint, /^    plan: free$/m);
  assert.match(blueprint, /^    autoDeployTrigger: off$/m);
  assert.match(blueprint, /^    healthCheckPath: \/healthz$/m);
  assert.doesNotMatch(blueprint, /(?:starter|standard|pro|generateValue: true)/);
});
