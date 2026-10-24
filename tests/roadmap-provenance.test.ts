import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoadmap } from '../src/roadmap.js';
import { parseGoalNote } from '../src/goalNotes.js';

test('mixed plan preserves distinct source/draft provenance and stable ids for duplicate filenames', () => {
  const notes = [parseGoalNote('same.md', '# Next\nContext\n- [ ] One real task'), parseGoalNote('same.md', '# Reading\nContext only passage')];
  const before = JSON.stringify(notes), r = buildRoadmap(notes);
  assert.deepEqual(r.steps.map(s => s.kind), ['source', 'draft', 'draft']);
  assert.deepEqual(r.steps.map(s => s.source.fileIndex), [0, 1, 1]);
  assert.equal(new Set(r.steps.map(s => s.id)).size, 3);
  assert.deepEqual(buildRoadmap(notes).steps.map(s => s.id), r.steps.map(s => s.id));
  assert.equal(JSON.stringify(notes), before);
  assert.ok(r.steps.slice(1).every(s => s.source.excerpt === 'Context only passage'));
});

test('hard bounded plan reports omissions; draft options cannot bypass bounds', () => {
  const r = buildRoadmap([parseGoalNote('many.md', Array.from({ length: 40 }, (_, i) => `- [ ] Task ${i}`).join('\n'))]);
  assert.equal(r.steps.length, 12); assert.equal(r.omitted, 28);
  for (const [limit, expected] of [[-1, 0], [0, 0], [1, 1], [2, 2], [1000, 3], [NaN, 2], [Infinity, 2]]) {
    assert.equal(buildRoadmap([parseGoalNote('context.md', 'Passage')], { maxDraftSteps: limit }).steps.length, expected);
  }
  assert.equal(buildRoadmap(Array.from({ length: 5 }, () => parseGoalNote('context.md', 'Passage')), { maxDraftSteps: 3 }).steps.length, 12);
});

test('parser protections survive roadmap generation; context never becomes a source task', () => {
  const source = parseGoalNote('<literal>.md', '---\n- [ ] FRONT\n---\n# Current\n<img src="x">\n- [ ] ONLY OPEN\n- [x] DONE\n- [X] ALSO DONE\n```md\n- [ ] CODE\n```\n## Historical\n- [ ] OLD\n## Earlier\n- [ ] EARLIER\n## Prior content\n- [ ] PRIOR\n## Superseded\n- [ ] SUPERSEDED');
  const r = buildRoadmap([source]);
  assert.deepEqual(r.steps.map(s => s.title), ['ONLY OPEN']);
  assert.equal(r.steps[0].source.line, 6);
  assert.equal(r.steps[0].source.file, '<literal>.md');
  const prose = buildRoadmap([parseGoalNote('context.md', '# Reading\n<img onerror="unsafe">\nA second paragraph')]);
  assert.equal(prose.steps.length, 2);
  assert.ok(prose.steps.every(s => s.kind === 'draft' && !s.title.includes('<img')));
  assert.equal(prose.steps[0].source.excerpt, '<img onerror="unsafe">');
});
