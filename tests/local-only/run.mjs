import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { requireOperator } from './operator-availability.mjs';
await requireOperator();
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', 'tests/local-only/ai-startup.test.ts', 'tests/local-only/intention-bridge.test.ts'], { cwd: fileURLToPath(new URL('../..', import.meta.url)), stdio: 'inherit' });
if (result.error) { console.error('Operator test process could not start.'); process.exit(1); }
process.exit(result.status ?? 1);
