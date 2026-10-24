import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoadmap, type ImportedNote } from '../src/roadmap.js';

const note = (tasks: string[], context: string[]): ImportedNote => ({
  filename: 'focus.md',
  tasks: tasks.map((t, i) => ({ heading: 'Goals', line: i + 1, text: t })),
  context: context.map((c, i) => ({ heading: 'Notes', line: i + 10, text: c })),
});

test('roadmap uses explicit open tasks in file order', () => {
  const r = buildRoadmap([note(['Read the brief', 'Pick the first commit'], [])]);
  assert.equal(r.steps.length, 2);
  assert.equal(r.steps[0].title, 'Read the brief');
  assert.equal(r.steps[0].status, 'todo');
  assert.equal(r.steps[0].source?.file, 'focus.md');
  assert.equal(r.draft, false);
});

test('roadmap falls back to draft steps from context when no explicit tasks', () => {
  const r = buildRoadmap([note([], ['Set a 25-minute focus block', 'Remove phone from the desk'])], { maxDraftSteps: 2 });
  assert.equal(r.steps.length, 2);
  assert.equal(r.draft, true);
  assert.equal(r.steps[0].source.excerpt, 'Set a 25-minute focus block');
  assert.notEqual(r.steps[0].title, 'Set a 25-minute focus block', 'context is not promoted wholesale to a task');
  assert.ok(r.steps.every(s => s.kind === 'draft' && s.source.file === 'focus.md'));
});

test('empty/context-less input is not a fake roadmap', () => {
  const r = buildRoadmap([note([], [])]);
  assert.equal(r.steps.length, 0);
  assert.equal(r.draft, false);
});
