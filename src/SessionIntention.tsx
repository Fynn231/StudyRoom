import { useEffect, useId, useRef, useState } from 'react';
import { editableRoadmap, applyRoadmapEdits, type Roadmap } from './roadmap.js';
import { PlanStepEditor, validPlanSteps } from './PlanStepEditor.js';
import { SaveStudyPlan } from './StudyProgress.js';
import { useCopy } from './lockInCopy.js';
import { useAuthFetch, useOptionalAuth } from './auth.js';
import { validateRequest, validatePlan, type IntentionContext } from './aiStudy.js';

type Assistance = IntentionContext['mode'];
// An explicitly generic rule-based scaffold, never subject inference or AI.
function intentionRoadmap(choice: Assistance, minutes: number | null): Roadmap {
 const short=choice==='Time allocation' && minutes!==null && minutes<3;
 const titles=short?['Work on one small piece; check the result and write one next action']:['Choose one small outcome for this intention','Work on one example or a small piece of the outcome','Check the result and write one next action'];
 const checkpoints=short?['Produce 1 small result or record 1 unresolved question.']:['Write 1 sentence naming the result you want.','Produce 1 example, answer or small artifact to review.','Record 1 check of the result and 1 next action or unresolved question.'];
 const edge=minutes===null?0:Math.max(1,Math.floor(minutes/5));
 const allocations=short?[minutes]:[edge,minutes===null?null:minutes-2*edge,edge];
 return {draft:true,omitted:0,steps:titles.map((title,i)=>({id:crypto.randomUUID(),title,status:'todo',kind:'draft',source:{file:'',fileIndex:0,heading:'',line:0,excerpt:''},instructions:choice==='Steps'?'':checkpoints[i],minutes:choice==='Time allocation'?allocations[i]:null}))};
}
function pastedRoadmap(brief: string): Roadmap {
 const lines=brief.split('\n').map(s=>s.replace(/^\s*(?:[-*]\s*(?:\[[ xX]\]\s*)?|\d+[.)]\s*)/,'').trim()).flatMap(s=>s.split(/[.!?;]\s+/)).map(s=>s.trim()).filter(Boolean);
 const steps=lines.slice(0,12).map(line=>({id:crypto.randomUUID(),title:line.slice(0,180),instructions:line.length>180?line.slice(180,1080):'',status:'todo' as const,kind:'draft' as const,source:{file:'',fileIndex:0,heading:'',line:0,excerpt:''},minutes:null}));
 return {draft:true,omitted:Math.max(0,lines.length-12),steps};
}
type Candidate={roadmap:Roadmap;basis:string;budget:number|null;kind:'ai'|'deterministic';label:string;revision:number};
export function SessionIntention({ submitted, onDismiss, availableMinutes }: { submitted: string | null; onDismiss: () => void; availableMinutes: number | null }) {
 const c=useCopy(), id=useId(), auth=useOptionalAuth(), requestFetch=useAuthFetch();
 const hosted=auth?.config?.required===true;
 const [roadmap,setRoadmap]=useState<Roadmap|null>(null),[basis,setBasis]=useState(''),[allocation,setAllocation]=useState<number|null>(null);
 const [useAI,setUseAI]=useState(false),[mode,setMode]=useState<Assistance>('Steps'),[kind,setKind]=useState<'ai'|'deterministic'>('deterministic');
 const [brief,setBrief]=useState(''),[refinement,setRefinement]=useState(''),[candidate,setCandidate]=useState<Candidate|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const active=useRef<AbortController|null>(null),revision=useRef(0);
 function cancel(){active.current?.abort();active.current=null;setBusy(false);setCandidate(null);}
 useEffect(()=>{cancel();return ()=>{active.current?.abort();active.current=null;};},[submitted,availableMinutes]);
 function edit(next:Roadmap){revision.current++;cancel();setRoadmap(next);}
 function build(choice:Assistance){
  if(choice==='Time allocation' && availableMinutes===null)return;
  setMode(choice);
  if(useAI && !hosted){void generate(choice,false);return;}
  if(roadmap && !window.confirm('Replace this session draft, including edits and completion? Saved, imported and AI plans remain unchanged.'))return;
  cancel();revision.current++;setRoadmap(intentionRoadmap(choice,availableMinutes));setBasis(submitted??'');setAllocation(choice==='Time allocation'?availableMinutes:null);setKind('deterministic');onDismiss();
 }
 async function generate(choice:Assistance,refine:boolean){
  const goal=refine?basis:submitted;
  if(hosted || !goal || availableMinutes===null || !Number.isInteger(availableMinutes) || (refine && (!roadmap || !validPlanSteps(editableRoadmap(roadmap)) || !refinement.trim())))return;
  cancel();setError('');const controller=new AbortController();active.current=controller;setBusy(true);const version=revision.current;
  const current=()=>active.current===controller && !controller.signal.aborted && revision.current===version;
  const timeout=setTimeout(()=>{if(current()){cancel();setError('AI timed out. Your plan is unchanged. Paste a brief to derive a local checklist.');}},65000);
  try{
   const request=validateRequest({requestId:crypto.randomUUID(),budgetMinutes:availableMinutes,sources:[{id:crypto.randomUUID(),text:goal}],answers:[],intention:{goal,mode:choice,currentPlan:refine?editableRoadmap(roadmap!).map(({title,instructions,done,minutes})=>({title,instructions,done,minutes})):[],refinement:refine?refinement.trim():''}});
   const response=await requestFetch('/api/ai/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw Error('Unavailable');const result=await response.json();if(result.requestId!==request.requestId)throw Error('Stale response');const plan=validatePlan(result.plan,request);
   const next:Roadmap={draft:true,omitted:0,steps:plan.steps.map(s=>({id:crypto.randomUUID(),title:s.title,instructions:s.instructions,minutes:choice==='Time allocation'?s.estimatedMinutes:null,status:'todo',kind:'draft',source:{file:'',fileIndex:0,heading:'',line:0,excerpt:''}}))};
   if(current())setCandidate({roadmap:next,basis:goal,budget:choice==='Time allocation'?availableMinutes:null,kind:'ai',label:`AI ${choice} suggestion · review assumptions; not a source citation or guaranteed duration`,revision:version});
  }catch{if(current())setError('AI unavailable or returned an invalid plan. Your current plan is unchanged. Use the rule-based pasted brief fallback or retry explicitly.');}
  finally{clearTimeout(timeout);if(current()){active.current=null;setBusy(false);}}
 }
 function derive(){
  if(!brief.trim() || brief.length>10000)return;cancel();setError('');
  const next=pastedRoadmap(brief);if(!next.steps.length)return;
  setCandidate({roadmap:next,basis:submitted??basis,budget:null,kind:'deterministic',label:'Rule-based local checklist from pasted text · line/sentence splitting only, no intelligence or factual validation',revision:revision.current});
 }
 function apply(){if(!candidate || candidate.revision!==revision.current)return;revision.current++;setRoadmap(candidate.roadmap);setBasis(candidate.basis);setAllocation(candidate.budget);setKind(candidate.kind);setCandidate(null);onDismiss();}
 const total=roadmap?.steps.reduce((n,s)=>n+(s.minutes??0),0)??0;
 return <>{submitted!==null && <section className="optional-panel session-assistance"><h2>{c('intentionTitle','A little help getting started?')}</h2><p>{submitted}</p>
 <p className="quiet-note">Choose actionable Steps, measurable Benchmarks, or Time allocation within your chosen focus length ({availableMinutes??'invalid'} minutes). Nothing starts a timer. By default these are generic rule-based offline structures, not AI understanding.</p>
 <label className="storage-option"><input type="checkbox" checked={useAI && !hosted} disabled={hosted} onChange={e=>{cancel();setUseAI(e.target.checked);}}/>Use local AI for planning choices</label>
 <p className="quiet-note">{hosted?'Hosted AI is unavailable; personal subprocesses are never exposed. Use the pasted brief fallback.':'With AI selected, clicking a planning choice sends only the displayed intention, choice and focus duration through the operator-configured local bridge to its model provider. Provider data policies apply. No imported notes, music, room messages or pasted brief are sent. Typing, opening and selecting AI send nothing.'}</p>
 <div role="group" aria-label="Optional planning help" className="intention-actions">{(['Steps','Benchmarks','Time allocation'] as const).map(choice=><button key={choice} disabled={busy || ((useAI || choice==='Time allocation') && availableMinutes===null)} onClick={()=>build(choice)}>{choice}</button>)}<button onClick={()=>{cancel();onDismiss();}}>{c('skip','Skip')}</button></div>{availableMinutes===null && <p className="quiet-note">Set a valid 1–180 minute focus length to use Time allocation or AI.</p>}</section>}
 {(submitted!==null || roadmap) && <section className="optional-panel"><h3>Paste instead — no AI needed</h3><p className="quiet-note">Paste your goal, brief or an external AI plan. Explicitly derive up to 12 editable steps by line/sentence splitting (titles capped at 180 characters). This rule-based fallback cannot infer missing steps or verify facts. Raw text stays in tab memory; only an explicit saved plan copy persists.</p><label htmlFor={`${id}-brief`}>Paste a brief or external plan</label><textarea id={`${id}-brief`} value={brief} maxLength={10000} rows={3} onChange={e=>{cancel();setBrief(e.target.value);}}/><button disabled={!brief.trim()} onClick={derive}>Derive local checklist</button><button onClick={()=>{cancel();setBrief('');}}>Clear pasted brief</button></section>}
 {busy && <p role="status">Requesting intention plan… <button onClick={cancel}>Cancel intention AI request</button></p>}{error && <p role="alert" className="error">{error}</p>}
 {candidate && <section className="optional-panel" aria-label="Review replacement plan"><h3>Review replacement plan</h3><p>{candidate.label}</p><p className="quiet-note">Applying replaces the current session checklist, including edits and completion. Saved copies remain unchanged. Editing the current plan discards this suggestion.</p><ol>{candidate.roadmap.steps.map(s=><li key={s.id}><strong>{s.title}</strong><p>{s.instructions}</p>{s.minutes!==null && s.minutes!==undefined && <p>{s.minutes} minutes</p>}</li>)}</ol>{candidate.roadmap.omitted>0 && <p>{candidate.roadmap.omitted} additional items omitted by the 12-step bound.</p>}<button onClick={apply}>Use reviewed plan</button><button onClick={()=>setCandidate(null)}>Discard suggestion</button></section>}
 {roadmap && <section className="optional-panel session-plan" aria-label="Private intention plan"><h2>{c('planTitle','Your session plan')}</h2><p className="plan-basis">For: {basis}</p><p className="quiet-note">{kind==='ai'?'AI suggestion · review assumptions and check facts.':'Editable starting structure · rule-based offline draft, not AI understanding, subject knowledge or a source citation.'} Start focus separately when ready. Imported roadmaps, AI plans and saved copies stay independent.</p>{allocation!==null && <p className="quiet-note">Draft allocation: {total} of {allocation} minutes. Editing steps or changing focus length does not silently rebalance this draft.{total>allocation?' Your edited allocation exceeds the original budget; adjust it before focus.':''}</p>}<p role="status">{roadmap.steps.filter(s=>s.status==='done').length}/{roadmap.steps.length} done</p><PlanStepEditor steps={editableRoadmap(roadmap)} onChange={steps=>edit(applyRoadmapEdits(roadmap,steps))}/>
 <label htmlFor={`${id}-refine`}>Change this plan</label><textarea id={`${id}-refine`} value={refinement} maxLength={600} rows={2} onChange={e=>{cancel();setRefinement(e.target.value);}}/><p className="quiet-note">Only Request AI refinement sends this chosen current plan (including edited titles, checkpoints, minutes and done state), its intention, mode, focus duration and your instructions to the local operator bridge/model provider. No other plans or raw brief field are included; pasted text kept in this chosen plan is sent. A reply requires replacement review; your edits stay safe on errors or cancellation.</p><button disabled={hosted || busy || !refinement.trim() || availableMinutes===null || !validPlanSteps(editableRoadmap(roadmap))} onClick={()=>void generate(mode,true)}>Request AI refinement</button>
 <SaveStudyPlan draft={{title:'Session intention plan',kind,objectives:[],steps:editableRoadmap(roadmap)}}/></section>}
 </>;
}
