// Explicit private-local operator launch; configuration never comes from a browser.
import { fileURLToPath } from 'node:url';
process.env.STUDY_AI_EXECUTABLE = process.execPath;
process.env.STUDY_AI_SCRIPT = fileURLToPath(new URL('./codex-inference.cjs', import.meta.url));
await import('./start.js');
