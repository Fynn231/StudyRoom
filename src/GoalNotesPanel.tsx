import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { readGoalFiles, type GoalNote } from './goalNotes.js';
import { RoadmapPanel } from './RoadmapPanel.js';
import { AiStudyPanel } from './AiStudyPanel.js';
import { StudyProgress } from './StudyProgress.js';

import { useCopy } from './lockInCopy.js';

export function GoalNotes({ commitment, onChoose, children }: { commitment: string; onChoose: (text: string) => void; children?: ReactNode }) {
  const c = useCopy();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState<GoalNote[]>([]);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const activeRead = useRef<AbortController | null>(null);
  useEffect(() => () => { activeRead.current?.abort(); activeRead.current = null; }, []);
  async function choose(files: File[]) {
    activeRead.current?.abort();
    const attempt = new AbortController(); activeRead.current = attempt;
    const current = () => activeRead.current === attempt && !attempt.signal.aborted;
    setNotes([]);
    setError('');
    setReading(true);
    try { const result = await readGoalFiles(files, undefined, attempt.signal); if (current()) setNotes(result); }
    catch (e) { if (current()) setError(e instanceof Error ? e.message : 'Could not import notes. Please choose again.'); }
    finally { if (current()) { setReading(false); activeRead.current = null; } }
  }
  function clear() { activeRead.current?.abort(); activeRead.current = null; setNotes([]); setError(''); setReading(false); if (input.current) input.current.value = ''; }
  return <StudyProgress commitment={commitment} onChoose={onChoose}>{children}<details className="optional-panel goal-panel"><summary>{c('goalsSummary', 'Goals / notes')}</summary>
    <p className="quiet-note">Optional, private context from files you choose. No Avion connection or automatic Obsidian sync. Nothing is automatically uploaded or scanned. Offline planning stays local; optional AI sends only excerpts you select when you press Generate / Refine. Imports stay in this tab's memory; refresh or clear removes them.</p>
    <p className="quiet-note">Small deterministic Markdown parser, not AI or a statement of current priorities. Review headings and text, choose deliberately, and edit your intention if needed. Context is not an action list. Only explicit unfinished checkboxes are offered; completed tasks, frontmatter, fenced code and Historical / Earlier / Prior content / Superseded heading sections are omitted. These heuristics can miss stale or unusual Markdown.</p>

    <label htmlFor={`${id}-files`}>Choose Markdown notes</label><input ref={input} id={`${id}-files`} type="file" accept=".md,.markdown" multiple onChange={e => { const files = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ''; if (files.length) void choose(files); }} />
    <p className="quiet-note">UTF-8 .md / .markdown only · up to 5 files · 64 KiB each · 128 KiB total. A new selection replaces imports; a failed batch imports nothing. Text and links are shown literally, never opened automatically.</p>
    <div className="intention-actions"><button onClick={clear}>Clear imported notes</button><span role="status">{reading ? 'Reading selected notes…' : notes.length ? `${notes.length} note(s) in tab memory` : 'No notes imported'}</span></div>
    {error && <p role="alert" className="error">{error}</p>}
    <p className="quiet-note">Choosing a task only fills your private intention. It never starts a timer, edits a source, marks it done, or shares it. A nonempty intention is replaced only by the labelled replacement action below. Clear removes imported context and filenames, not an intention you already chose. If you later save a reflection, its commitment snapshot includes the chosen intention text; opting into device history stores that snapshot, never these source notes or provenance. Only the separate Share with room action publishes intention text.</p>
    {notes.length > 0 && <><AiStudyPanel notes={notes} commitment={commitment} onChoose={onChoose} /><RoadmapPanel notes={notes} commitment={commitment} onChoose={onChoose} /></>}

    {notes.map((note, n) => <article className="goal-source" key={n}><h2>{note.filename}</h2>
      {note.ignoredHistory && <p className="quiet-note">History caveat: marked historical sections were ignored. Review the source yourself if that classification is wrong.</p>}
      <h3>Goal context · not actionable tasks</h3>
      {note.context.length ? note.context.map(item => <div className="goal-line" key={item.line}><small>{note.filename} · {item.heading} · line {item.line}</small><p>{item.text}</p></div>) : <p className="quiet-note">No plain context found outside omitted sections.</p>}
      <h3>Explicit open tasks · review before choosing</h3>
      {note.tasks.length ? note.tasks.map(item => <div className="goal-line" key={item.line}><small>{note.filename} · {item.heading} · line {item.line}</small><p>{item.text}</p><button disabled={item.text.length > 240} onClick={() => onChoose(item.text)}>{commitment.trim() ? 'Replace private intention' : 'Use as private intention'}</button>{item.text.length > 240 && <p className="quiet-note">Over 240 characters: write a shorter intention yourself.</p>}</div>) : <p className="quiet-note">No explicit open tasks found outside omitted sections.</p>}
    </article>)}
  </details></StudyProgress>;
}