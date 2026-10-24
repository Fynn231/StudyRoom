// This key owns only explicit, reviewed study-plan snapshots; never reflection history.
export const STUDY_PLANS_KEY = 'study-room.saved-study-plans.v1';
export const SAVED_LIMITS = { plans: 20, steps: 12, objectives: 8, title: 240, instructions: 2000, objective: 600, payload: 180000 } as const;
export type PlanDraft = { title: string; kind: 'deterministic' | 'ai'; objectives: string[]; steps: { title: string; instructions: string; minutes: number | null; done: boolean }[] };
export type SavedPlan = Omit<PlanDraft, 'steps'> & { id: string; createdAt: number; updatedAt: number; keepUpdated: boolean; steps: (PlanDraft['steps'][number] & { id: string })[] };
export type SavedStore = { version: 1; plans: SavedPlan[] };
function fail(): never { throw Error('Saved plans could not be read safely. Nothing was overwritten. Export the browser value if needed, or deliberately clear saved plans.'); }
function keys(value: unknown, allowed: string[]): asserts value is Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== allowed.length || Object.keys(value).some(k => !allowed.includes(k))) fail(); }
function text(v: unknown, max: number, empty = false): asserts v is string { if (typeof v !== 'string' || v.length > max || (!empty && !v.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) fail(); }
function id(v: unknown): asserts v is string { if (typeof v !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)) fail(); }
export function parseSavedPlans(raw: string | null): SavedStore {
 if (raw === null) return { version: 1, plans: [] };
 if (raw.length > SAVED_LIMITS.payload) fail();
 let data: unknown; try { data = JSON.parse(raw); } catch { return fail(); }
 keys(data, ['version','plans']); if(data.version !== 1 || !Array.isArray(data.plans) || data.plans.length > SAVED_LIMITS.plans) fail();
 const ids = new Set<string>();
 for (const p of data.plans) {
  keys(p,['id','title','kind','objectives','steps','createdAt','updatedAt','keepUpdated']); id(p.id); if(ids.has(p.id)) fail(); ids.add(p.id);
  text(p.title,SAVED_LIMITS.title); if(p.kind !== 'ai' && p.kind !== 'deterministic') fail();
  if(typeof p.keepUpdated !== 'boolean' || !Number.isSafeInteger(p.createdAt) || !Number.isSafeInteger(p.updatedAt) || (p.createdAt as number) < 0 || (p.updatedAt as number) > 8640000000000000 || (p.updatedAt as number) < (p.createdAt as number)) fail();
  if(!Array.isArray(p.objectives) || p.objectives.length > SAVED_LIMITS.objectives) fail(); for(const o of p.objectives) text(o,SAVED_LIMITS.objective);
  if(!Array.isArray(p.steps) || !p.steps.length || p.steps.length > SAVED_LIMITS.steps) fail(); const stepIds = new Set<string>();
  for(const s of p.steps) { keys(s,['id','title','instructions','minutes','done']); id(s.id); if(stepIds.has(s.id)) fail(); stepIds.add(s.id); text(s.title,SAVED_LIMITS.title); text(s.instructions,SAVED_LIMITS.instructions,true); if(typeof s.done !== 'boolean' || (s.minutes !== null && (!Number.isInteger(s.minutes) || (s.minutes as number)<1 || (s.minutes as number)>180))) fail(); }
 }
 return data as unknown as SavedStore;
}
// Explicit field-by-field allowlist: caller provenance/questions/answers cannot enter storage.
export function snapshotPlan(draft: PlanDraft): SavedPlan {
 const now = Date.now();
 const plan: SavedPlan = { id: crypto.randomUUID(), title: draft.title, kind: draft.kind, objectives: draft.objectives.map(o=>o), steps: draft.steps.map(s=>({ id:crypto.randomUUID(),title:s.title,instructions:s.instructions,minutes:s.minutes,done:s.done })), createdAt:now,updatedAt:now,keepUpdated:true };
 parseSavedPlans(JSON.stringify({version:1,plans:[plan]})); return plan;
}
export function writeSavedPlans(storage: Storage, expected: string | null, plans: SavedPlan[]): string | null {
 const actual = storage.getItem(STUDY_PLANS_KEY);
 if(actual !== expected) throw Error('Saved plans changed in another tab. Reopen the library before making changes. Nothing was overwritten.');
 parseSavedPlans(actual); // never silently replace unreadable content
 if(!plans.length) { storage.removeItem(STUDY_PLANS_KEY); if(storage.getItem(STUDY_PLANS_KEY)!==null) throw Error('Deletion was not confirmed.'); return null; }
 const raw = JSON.stringify({version:1,plans}); parseSavedPlans(raw);
 storage.setItem(STUDY_PLANS_KEY,raw); if(storage.getItem(STUDY_PLANS_KEY)!==raw) throw Error('Saving was not confirmed.'); return raw;
}
