import { test } from 'node:test';
import assert from 'node:assert/strict';

async function parser() {
  const mod = await import('../src/goalNotes.js').catch(() => ({})) as any;
  assert.equal(typeof mod.parseGoalNote, 'function', 'goal-note parser must exist');
  return mod.parseGoalNote;
}
test('goal context has heading provenance and only explicit open tasks outside ignored sections', async () => {
  const parse = await parser();
  const note = parse('fiction.md', '---\n- [ ] frontmatter\n---\n# Direction\nBuild a fictional garden.\n- [ ] Plant moon seeds\n- [x] Finished\n```md\n- [ ] code\n```\n## Historical\n- [ ] old\n### nested\n- [ ] also old\n## Next\n- [ ] Water stars');
  assert.deepEqual(note.tasks.map((x: any) => [x.text, x.heading]), [['Plant moon seeds', 'Direction'], ['Water stars', 'Direction / Next']]);
  assert.deepEqual(note.context.map((x: any) => [x.text, x.heading]), [['Build a fictional garden.', 'Direction']]);
  assert.equal(note.filename, 'fiction.md');
  assert.equal(note.ignoredHistory, true);
});

test('selected file reads reject unexpected, binary, invalid UTF-8 and bounded batches before parsing', async () => {
  const mod = await import('../src/goalNotes.js') as any;
  assert.equal(typeof mod.readGoalFiles, 'function', 'bounded file reader must exist');
  let reads = 0;
  const file = (name: string, size = 10, data = new TextEncoder().encode('# Next\n- [ ] Orbit')) => ({ name, size, data });
  const read = async (f: any) => { reads++; return f.data.buffer; };
  const notes = await mod.readGoalFiles([file('fiction.markdown')], read);
  assert.equal(notes[0].tasks[0].text, 'Orbit');
  for (const batch of [[file('x.txt')], [file('x.md', 65537)], Array.from({length: 6}, () => file('x.md')), Array.from({length: 3}, () => file('x.md', 65536))]) {
    const before = reads;
    await assert.rejects(() => mod.readGoalFiles(batch, read));
    assert.equal(reads, before, 'validate whole batch before any read');
  }
  await assert.rejects(() => mod.readGoalFiles([file('bad.md', 2, new Uint8Array([0xc3, 0x28]))], read), /UTF-8/);
  await assert.rejects(() => mod.readGoalFiles([file('binary.md', 2, new Uint8Array([0, 1]))], read), /binary/);
  await assert.rejects(() => mod.readGoalFiles([file('failed.md')], async () => { throw Error('secret'); }), /Could not read/);
});
