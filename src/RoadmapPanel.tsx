import { useId, useState } from 'react';
import type { GoalNote } from './goalNotes.js';
import { buildRoadmap, editableRoadmap, applyRoadmapEdits, type Roadmap } from './roadmap.js';
import { PlanStepEditor } from './PlanStepEditor.js';
import { SaveStudyPlan } from './StudyProgress.js';

export function RoadmapPanel({ notes, commitment, onChoose }: { notes: GoalNote[]; commitment: string; onChoose: (text: string) => void }) {
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const id = useId();
  const [questionsDismissed, setQuestionsDismissed] = useState(false);
  const [timeAnswer, setTimeAnswer] = useState('25');
  const [nextAnswer, setNextAnswer] = useState('');
  const [scope, setScope] = useState<{ minutes: string; count: number; next: string } | null>(null);
  const allSteps = roadmap?.steps ?? [];
  const ordered = scope?.next ? [...allSteps.filter(s => s.id === scope.next), ...allSteps.filter(s => s.id !== scope.next)] : allSteps;
  const visibleSteps = ordered.slice(0, scope?.count ?? allSteps.length);
  return <section className="roadmap-panel" aria-label="Private session roadmap">
    <h2>Session roadmap</h2>
    <p className="quiet-note">Local deterministic MVP · not AI document comprehension or inferred priorities. Build deliberately from these Markdown imports. Source progress stays in tab memory only, not history, source files or the room. Explicitly saved copies are separate and survive clearing imports.</p>
    {!roadmap ? <button onClick={() => setRoadmap(buildRoadmap(notes))}>Build session roadmap</button> : <>
      <p role="status">{roadmap.steps.filter(s => s.status === 'done').length}/{roadmap.steps.length} done</p>
      <p className="quiet-note">Explicit open tasks appear first in file order. A context-only file gets a small, labelled review / explain scaffold anchored to its first plain passage, not a task extracted from each paragraph. Review the full source below.</p>
      {roadmap.steps.length > 0 && !questionsDismissed && <>
        <details className="roadmap-questions"><summary>Optional: refine this session</summary>
          <p className="quiet-note">No AI answers here: these choices only narrow the visible checklist and put your chosen step first. No time estimates or timer changes. Skip freely; questions never open themselves during focus.</p>
          <label htmlFor={`${id}-time`}>How much time do you want to allow?</label>
          <select id={`${id}-time`} value={timeAnswer} onChange={e => setTimeAnswer(e.target.value)}><option value="10">10 minutes · up to 3 steps</option><option value="25">25 minutes · up to 6 steps</option><option value="50">50 minutes · up to 12 steps</option></select>
          <label htmlFor={`${id}-next`}>Which step should come next?</label>
          <select id={`${id}-next`} value={nextAnswer} onChange={e => setNextAnswer(e.target.value)}><option value="">Keep source order</option>{allSteps.map(s => <option key={s.id} value={s.id}>{s.title} · {s.source.file} · file {s.source.fileIndex + 1} · line {s.source.line}</option>)}</select>
          <button onClick={() => setScope({ minutes: timeAnswer, count: timeAnswer === '10' ? 3 : timeAnswer === '25' ? 6 : 12, next: nextAnswer })}>Apply session choices</button>
        </details>
        <button onClick={() => setQuestionsDismissed(true)}>Skip refinement questions</button>
      </>}
      {scope && <div className="roadmap-scope"><p>{scope.minutes}-minute scope · showing {visibleSteps.length} of {allSteps.length} steps. This is a checklist limit you chose, not an estimate of task duration.{scope.next && ' Your selected step is shown first; all other steps retain source order.'}</p><button onClick={() => setScope(null)}>Show full roadmap</button></div>}
      {roadmap.omitted > 0 && <p className="quiet-note">Plan capped at 12 steps: explicit tasks first, then context-only scaffolds; {roadmap.omitted} more omitted. The complete explicit task chooser remains below.</p>}
      {!roadmap.steps.length && <p className="quiet-note">No explicit open tasks or context found in this selection. Identify an outcome yourself.</p>}
      <PlanStepEditor steps={editableRoadmap({...roadmap,steps:visibleSteps})} addDisabled={allSteps.length>=12} onChange={steps => { const current=editableRoadmap(roadmap);const sameOrder=steps.length===visibleSteps.length && steps.every((s,i)=>s.id===visibleSteps[i].id);if(sameOrder) { setRoadmap(applyRoadmapEdits(roadmap,current.map(s=>steps.find(v=>v.id===s.id)??s))); } else { const hidden=current.filter(s=>!visibleSteps.some(v=>v.id===s.id));setRoadmap(applyRoadmapEdits(roadmap,[...steps,...hidden]));setScope(null); } }} afterStep={view => { const step=roadmap.steps.find(s=>s.id===view.id)!;return <>
        {scope?.next === step.id && <strong className="next-step">Your selected next step</strong>}
        <span className="step-kind">{step.kind === 'source' ? 'Source task · explicit unfinished checkbox · edited text may differ' : 'Draft study scaffold · not a source task'}</span>
        {step.source.file && <><small>{step.source.file} · file {step.source.fileIndex + 1} · {step.source.heading} · line {step.source.line}</small><p className="quiet-note">Source excerpt: {step.source.excerpt}</p></>}
        <button data-choose-intention="true" disabled={!step.title.trim() || step.title.length > 240} onClick={() => onChoose(step.title)}>{commitment.trim() ? 'Replace private intention with this step' : 'Use this step as private intention'}</button>
        {step.title.length > 240 && <p className="quiet-note">Over 240 characters: write a shorter intention yourself.</p>}
      </>; }} />
      <SaveStudyPlan draft={{title:'Session roadmap',kind:'deterministic',objectives:[],steps:editableRoadmap(roadmap)}} />
      <p className="quiet-note">Done / undo changes only this source plan. Choosing a step never starts or resets a timer, edits an imported source or shares it. Clear or reselect notes removes this source plan; an already chosen intention and explicitly saved copies remain independent.</p>
    </>}
  </section>;
}
