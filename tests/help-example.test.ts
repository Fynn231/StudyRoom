import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseGoalNote } from '../src/goalNotes.js';

test('the documented project-focus-session file is importable and contains seven open project tasks, not fabricated completion', async () => {
  const text = await readFile(new URL('../docs/sim/project-focus-session.md', import.meta.url), 'utf8');
  const note = parseGoalNote('project-focus-session.md', text);
  assert.equal(note.tasks.length, 7);
  assert.equal(note.tasks[0].text, 'Choose one screen or workflow to improve.');
  assert.equal(note.tasks[6].text, 'Write what you finished and the very next action.');
  assert.equal(text.includes('- [x]'), false);
});
