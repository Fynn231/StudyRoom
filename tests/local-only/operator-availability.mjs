import { access } from 'node:fs/promises';

// The private operator implementation is intentionally not distributed.
// Absence is an unavailable prerequisite, never a passing test or a fixture.
export async function requireOperator() {
  for (const file of ['server/codex-inference.cjs', 'server/codex-inference.py']) {
    try { await access(new URL(`../../${file}`, import.meta.url)); }
    catch {
      console.error('UNAVAILABLE: private local AI operator files are not distributed. No operator assertions or provider calls were run.');
      process.exit(2);
    }
  }
}
