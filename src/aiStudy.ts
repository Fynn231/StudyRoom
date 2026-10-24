// Shared data-only contract. No provider configuration, URLs, storage or executable content.
export type StudySource = { id: string; text: string };
export type StudyAnswer = { question: string; answer: string };
export type IntentionContext = { goal: string; mode: 'Steps' | 'Benchmarks' | 'Time allocation'; currentPlan: {title:string; instructions:string; done:boolean; minutes:number|null}[]; refinement:string };
export type StudyRequest = { intention?: IntentionContext; requestId: string; budgetMinutes: number; sources: StudySource[]; answers: StudyAnswer[] };
export type StudyStep = { title: string; instructions: string; estimatedMinutes: number; sourceIds: string[] };
export type StudyQuestion = { question: string; sourceIds: string[] };
export type StudyPlan = { objectives: string[]; steps: StudyStep[]; questions: StudyQuestion[] };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(): never { throw new Error('Invalid study data.'); }
function object(v: unknown, keys: string[]): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join('|') !== keys.sort().join('|')) fail(); return v as Record<string, unknown>; }
function text(v: unknown, max: number): string { if (typeof v !== 'string' || !v.trim() || v.length > max || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(v)) fail(); return v; }
function multiline(v: unknown, max: number): string { if(typeof v!=='string'||!v.trim()||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(v))fail(); return v; }
function list<T>(v: unknown, min: number, max: number, validate: (item: unknown) => T): T[] { if (!Array.isArray(v) || v.length < min || v.length > max) fail(); return v.map(validate); }
function id(v: unknown): string { const s = text(v, 36); if (!uuid.test(s)) fail(); return s; }
function minutes(v: unknown, max: number): number { if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > max) fail(); return v; }
export function validateRequest(input: unknown): StudyRequest {
  const hasIntention = !!input && typeof input === 'object' && 'intention' in input;
  const r = object(input, ['requestId', 'budgetMinutes', 'sources', 'answers', ...(hasIntention ? ['intention'] : [])]);
  const sources = list(r.sources, 1, 12, value => { const s = object(value, ['id', 'text']); return { id: id(s.id), text: hasIntention ? multiline(s.text,1200) : text(s.text, 1200) }; });
  if (new Set(sources.map(s => s.id)).size !== sources.length || sources.reduce((n, s) => n + s.text.length, 0) > 10000) fail();
  let intention: IntentionContext | undefined;
  if (hasIntention) {
    const c=object(r.intention,['goal','mode','currentPlan','refinement']);
    const goal=multiline(c.goal,240);
    if (!['Steps','Benchmarks','Time allocation'].includes(String(c.mode)) || sources.length!==1 || sources[0].text!==goal || !Array.isArray(r.answers) || r.answers.length!==0) fail();
    const currentPlan=list(c.currentPlan,0,12,value=>{const s=object(value,['title','instructions','done','minutes']); if(typeof s.done!=='boolean'||typeof s.instructions!=='string'||s.instructions.length>2000 || (s.instructions && multiline(s.instructions,2000)!==s.instructions))fail();return {title:multiline(s.title,240),instructions:s.instructions,done:s.done,minutes:s.minutes===null?null:minutes(s.minutes,180)};});
    if(typeof c.refinement!=='string'||c.refinement.length>600 || (c.refinement && multiline(c.refinement,600)!==c.refinement))fail();
    intention={goal,mode:c.mode as IntentionContext['mode'],currentPlan,refinement:c.refinement};
  }
  return { ...(intention ? {intention} : {}), requestId: id(r.requestId), budgetMinutes: minutes(r.budgetMinutes, 180), sources, answers: list(r.answers, 0, 2, value => { const a = object(value, ['question', 'answer']); return { question: text(a.question, 240), answer: text(a.answer, 600) }; }) };
}
export function validatePlan(input: unknown, request: StudyRequest): StudyPlan {
  const p = object(input, ['objectives', 'steps', 'questions']);
  const citations = (v: unknown) => { const ids = list(v, 1, request.sources.length, id); if (new Set(ids).size !== ids.length || ids.some(i => !request.sources.some(s => s.id === i))) fail(); return ids; };
  const steps = list(p.steps, 1, 8, value => { const s = object(value, ['title', 'instructions', 'estimatedMinutes', 'sourceIds']); return { title: text(s.title, 180), instructions: text(s.instructions, 900), estimatedMinutes: minutes(s.estimatedMinutes, request.budgetMinutes), sourceIds: citations(s.sourceIds) }; });
  if (steps.reduce((n, s) => n + s.estimatedMinutes, 0) > request.budgetMinutes) fail();
  return { objectives: list(p.objectives, 1, 4, v => text(v, 240)), steps, questions: list(p.questions, 0, 2, value => { const q = object(value, ['question', 'sourceIds']); return { question: text(q.question, 240), sourceIds: citations(q.sourceIds) }; }) };
}
