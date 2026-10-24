import { useId, type ReactNode } from 'react';
import type { PlanDraft } from './savedStudyStore.js';
import { SAVED_LIMITS } from './savedStudyStore.js';

export type EditableStep = PlanDraft['steps'][number] & { id: string };
export function validPlanSteps(steps: PlanDraft['steps']): boolean {
 return steps.length > 0 && steps.length <= SAVED_LIMITS.steps && steps.every(s => s.title.trim() && s.title.length <= SAVED_LIMITS.title && s.instructions.length <= SAVED_LIMITS.instructions && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s.title+s.instructions) && (s.minutes===null || (Number.isInteger(s.minutes) && s.minutes>=1 && s.minutes<=180)));
}
/** A controlled view over existing plan state; IDs, not text or position, own focus. */
export function PlanStepEditor({ steps, onChange, afterStep, addDisabled = false }: { steps: EditableStep[]; onChange: (steps: EditableStep[]) => void; afterStep?: (step: EditableStep) => ReactNode; addDisabled?: boolean }) {
 const id=useId();
 function edit(step: EditableStep, patch: Partial<EditableStep>) { onChange(steps.map(s=>s.id===step.id?{...s,...patch}:s)); }
 function move(index: number, delta: number) { const next=[...steps]; [next[index],next[index+delta]]=[next[index+delta],next[index]];onChange(next); }
 return <><ol className="roadmap-steps">{steps.map((step,i)=><li key={step.id} className="roadmap-step" data-step-id={step.id}>
  <label className="step-check"><input type="checkbox" checked={step.done} onChange={()=>edit(step,{done:!step.done})}/><span>{step.title || 'Untitled step'}</span></label>
  {step.instructions && <p className="step-checkpoint">{step.instructions}</p>}{step.minutes!==null && <p className="quiet-note">Allocated {step.minutes} minutes · editable, not a duration estimate</p>}
  <details className="step-edit"><summary>Edit step {i+1}</summary>
   <label htmlFor={`${id}-${step.id}-title`}>Step {i+1} title</label><input id={`${id}-${step.id}-title`} value={step.title} maxLength={SAVED_LIMITS.title} aria-invalid={!step.title.trim()} onChange={e=>edit(step,{title:e.target.value})}/>
   {!step.title.trim() && <p role="alert" className="duration-error">Give this step a title before saving.</p>}
   <label htmlFor={`${id}-${step.id}-checkpoint`}>Step {i+1} checkpoint / benchmark</label><textarea id={`${id}-${step.id}-checkpoint`} rows={2} value={step.instructions} maxLength={SAVED_LIMITS.instructions} onChange={e=>edit(step,{instructions:e.target.value})}/>
   <label htmlFor={`${id}-${step.id}-minutes`}>Step {i+1} allocated minutes (optional)</label><input id={`${id}-${step.id}-minutes`} type="number" min="1" max="180" step="1" value={step.minutes??''} aria-invalid={step.minutes!==null && (!Number.isInteger(step.minutes)||step.minutes<1||step.minutes>180)} onChange={e=>edit(step,{minutes:e.target.value===''?null:Number(e.target.value)})}/>
   {step.minutes!==null && (!Number.isInteger(step.minutes)||step.minutes<1||step.minutes>180) && <p role="alert" className="duration-error">Use 1–180 whole minutes or leave blank.</p>}
  </details>
  <div className="step-actions"><button aria-label={`Move step ${i+1} up`} disabled={i===0} onClick={()=>move(i,-1)}>↑ Up</button><button aria-label={`Move step ${i+1} down`} disabled={i===steps.length-1} onClick={()=>move(i,1)}>↓ Down</button><button aria-label={`Remove step ${i+1}`} onClick={()=>onChange(steps.filter(s=>s.id!==step.id))}>Remove</button></div>
  {afterStep?.(step)}
 </li>)}</ol><button disabled={addDisabled || steps.length>=SAVED_LIMITS.steps} onClick={()=>onChange([...steps,{id:crypto.randomUUID(),title:'New step',instructions:'',minutes:null,done:false}])}>Add step</button><p className="quiet-note">Up to 12 steps. Check / uncheck is done / undo. Edits and allocations never change a timer. Checkpoints are your measurable targets, not proof of mastery.</p></>;
}
