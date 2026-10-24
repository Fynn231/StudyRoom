import { useAuthFetch } from './auth.js';
import { useEffect, useId, useRef, useState } from 'react';
import type { GoalNote } from './goalNotes.js';
import { validatePlan, validateRequest, type StudyPlan } from './aiStudy.js';
import { SaveStudyPlan } from './StudyProgress.js';

type Excerpt = { id: string; documentId: string; text: string; file: string; fileIndex: number; heading: string; line: number; clipped: boolean };
function excerpts(notes: GoalNote[]): Excerpt[] {
  return notes.flatMap((note, fileIndex) => {
    const documentId = crypto.randomUUID();
    return [...note.context, ...note.tasks].sort((a, b) => a.line - b.line).map(item => ({ id: crypto.randomUUID(), documentId, text: item.text.slice(0, 1200), clipped: item.text.length > 1200, file: note.filename, fileIndex, heading: item.heading, line: item.line }));
  }).slice(0, 40);
}
export function AiStudyPanel({ notes, commitment, onChoose }: { notes: GoalNote[]; commitment: string; onChoose: (text: string) => void }) {
  const authFetch = useAuthFetch();
  const [sources] = useState(() => excerpts(notes));
  const [selected, setSelected] = useState<string[]>([]);
  const [budget, setBudget] = useState('25');
  const [status, setStatus] = useState<{ configured: boolean; liveVerified: boolean } | null>(null);
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [done, setDone] = useState<number[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const active = useRef<AbortController | null>(null); const id = useId();
  const chosen = sources.filter(s => selected.includes(s.id));
  const valid = chosen.length > 0 && chosen.length <= 12 && chosen.reduce((n, s) => n + s.text.length, 0) <= 10000 && /^\d+$/.test(budget) && Number(budget) >= 1 && Number(budget) <= 180;
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  function cancel() { active.current?.abort(); active.current = null; setBusy(false); }
  function reset() { cancel(); setPlan(null); setDone([]); setAnswers([]); setError(''); }
  async function generate(refine: boolean) {
    if (!valid) return;
    cancel(); const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    const current = () => active.current === controller && !controller.signal.aborted;
    const timeout = setTimeout(() => { if (current()) { cancel(); setError('AI timed out. Your current plan is unchanged; the offline roadmap remains available.'); } }, 65000);
    try {
      const request = validateRequest({ requestId: crypto.randomUUID(), budgetMinutes: Number(budget), sources: chosen.map(({ id, text }) => ({ id, text })), answers: refine && plan ? plan.questions.flatMap((q, i) => answers[i]?.trim() ? [{ question: q.question, answer: answers[i].trim() }] : []) : [] });
      const response = await authFetch('/api/ai/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw Error('Unavailable');
      const result = await response.json(); if (result.requestId !== request.requestId) throw Error('Stale response');
      const next = validatePlan(result.plan, request);
      if (current()) { setPlan(next); setDone([]); setAnswers([]); setStatus({ configured: true, liveVerified: true }); }
    } catch { if (current()) setError('AI could not return a valid plan. Your current progress is unchanged. Use the offline roadmap or retry explicitly.'); }
    finally { clearTimeout(timeout); if (current()) { active.current = null; setBusy(false); } }
  }
  return <section className="ai-study" aria-label="Private AI study planning">
    <h2>AI study companion</h2>
    <p className="quiet-note">Optional AI suggestions, not source-issued tasks. Rough estimates are not guaranteed durations. The offline session roadmap below works without AI or uploads.</p>
    <p className="quiet-note">{status ? status.configured ? status.liveVerified ? 'AI route: live-verified in this server session.' : 'AI route configured, not yet live-verified.' : 'AI is not configured on this local server.' : 'AI route status unavailable.'}</p>
    <details><summary>Choose excerpts for AI</summary>
      <p className="quiet-note">Select up to 12 excerpts, 10,000 characters total. Only surviving parsed context / open tasks are offered, up to 40 previews; each is capped at 1,200 characters. Filenames stay here; AI receives excerpt text and random citation IDs, not complete files.</p>
      {sources.map(s => <div className="goal-line" key={s.id}><label className="ai-step-check"><input type="checkbox" checked={selected.includes(s.id)} onChange={() => { reset(); setSelected(ids => ids.includes(s.id) ? ids.filter(i => i !== s.id) : [...ids, s.id]); }} /><span>Excerpt: {s.text}</span></label><small>{s.file} · file {s.fileIndex + 1} · {s.heading} · line {s.line}{s.clipped && ' · clipped preview'}</small></div>)}
      <button onClick={() => { reset(); setSelected([]); }}>Deselect AI excerpts</button>
    </details>
    <p>{chosen.length} selected · {chosen.reduce((n, s) => n + s.text.length, 0)}/10,000 characters</p>
    <label htmlFor={`${id}-budget`}>AI plan time budget (minutes)</label><input id={`${id}-budget`} type="number" min="1" max="180" step="1" value={budget} onChange={e => { reset(); setBudget(e.target.value); }} />
    <p className="quiet-note">By choosing Generate or Refine, your selected excerpts and any answers go to the configured model through this private local server. Model-provider data policies apply. Nothing is sent on import or selection. Back out by deselecting or clearing notes. Source plans and answers stay in tab memory, not room events or device history. Only an explicit Save on this device stores a separate reviewed plan copy, never the answers or original sources.</p>
    <button disabled={!valid || busy} onClick={() => void generate(false)}>Generate AI study plan</button>
    {busy && <><span role="status">Generating AI suggestions…</span><button onClick={cancel}>Cancel AI request</button></>}
    {error && <p role="alert" className="error">{error}</p>}
    {plan && <div className="ai-plan"><h3>Suggested learning objectives</h3><ul>{plan.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul><p role="status">{done.length}/{plan.steps.length} AI steps done</p><p className="quiet-note">Review before applying · {plan.steps.reduce((n, s) => n + s.estimatedMinutes, 0)} rough minutes total. A refined plan replaces this AI checklist only after a valid response; offline progress is independent.</p>
      <ol className="roadmap-steps">{plan.steps.map((s, i) => <li className="roadmap-step" key={i}><span className="step-kind">AI suggestion · not a source task · about {s.estimatedMinutes} min</span><label className="ai-step-check"><input type="checkbox" checked={done.includes(i)} onChange={() => setDone(old => old.includes(i) ? old.filter(n => n !== i) : [...old, i])} /><span>{s.title}</span></label><p>{s.instructions}</p>{s.sourceIds.map(sourceId => { const source = sources.find(x => x.id === sourceId)!; return <p className="quiet-note" key={sourceId}>Source: {source.file} · file {source.fileIndex + 1} · {source.heading} · line {source.line}: {source.text}</p>; })}<button onClick={() => onChoose(s.title)}>{commitment.trim() ? 'Replace private intention with AI step' : 'Use AI step as private intention'}</button></li>)}</ol>
      {plan.questions.length > 0 && <details><summary>Optional AI questions</summary><p className="quiet-note">Answer only what helps, or skip. Refine deliberately sends nonempty answers and the selected excerpts again. No timer change or interruption.</p>{plan.questions.map((q, i) => <div key={i}><label htmlFor={`${id}-answer-${i}`}>{q.question}</label><input id={`${id}-answer-${i}`} value={answers[i] ?? ''} maxLength={600} disabled={busy} onChange={e => setAnswers(old => { const next = [...old]; next[i] = e.target.value; return next; })} /><small>Related excerpt: {q.sourceIds.map(s => { const source = sources.find(x => x.id === s)!; return `${source.file} · line ${source.line}`; }).join('; ')}</small></div>)}<button disabled={busy || !answers.some(a => a?.trim())} onClick={() => void generate(true)}>Refine AI plan with answers</button><button onClick={() => setAnswers([])}>Skip AI questions</button></details>}
      <SaveStudyPlan key={JSON.stringify(plan)} draft={{title:'AI study plan',kind:'ai',objectives:plan.objectives,steps:plan.steps.map((s,i)=>({title:s.title,instructions:s.instructions,minutes:s.estimatedMinutes,done:done.includes(i)}))}} />
      <p className="quiet-note">Choosing a step only fills a private intention. It never resets a timer or shares anything; the separate Share action remains deliberate. Clear removes this source plan, not an intention already chosen or explicitly saved copies.</p>
    </div>}
  </section>;
}
