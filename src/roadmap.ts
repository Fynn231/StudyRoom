import type { GoalNote } from './goalNotes.js';
import type { EditableStep } from './PlanStepEditor.js';

export function editableRoadmap(roadmap: Roadmap): EditableStep[] {
 return roadmap.steps.map(s=>({id:s.id,title:s.title,done:s.status==='done',instructions:s.instructions??'',minutes:s.minutes??null}));
}
export function applyRoadmapEdits(roadmap: Roadmap, steps: EditableStep[]): Roadmap {
 return {...roadmap,steps:steps.map(s=>({...roadmap.steps.find(old=>old.id===s.id) ?? {kind:'draft' as const,source:{file:'',fileIndex:0,heading:'',line:0,excerpt:''}},id:s.id,title:s.title,status:s.done?'done':'todo',instructions:s.instructions,minutes:s.minutes}))};
}

export type ImportedNote = Pick<GoalNote, 'filename' | 'tasks' | 'context'>;
export type StepStatus = 'todo' | 'done';
export type StepSource = { file: string; fileIndex: number; heading: string; line: number; excerpt: string };
export type Step = { id: string; title: string; status: StepStatus; kind: 'source' | 'draft'; source: StepSource; instructions?: string; minutes?: number | null };
export type Roadmap = { steps: Step[]; draft: boolean; omitted: number };
export interface RoadmapOptions { maxDraftSteps?: number }
export const MAX_ROADMAP_STEPS = 12;

/** Local source order only: no AI, priority inference, mutation or network. */
export function buildRoadmap(notes: ImportedNote[], opts: RoadmapOptions = {}): Roadmap {
  const steps: Step[] = [];
  notes.forEach((note, fileIndex) => {
    note.tasks.forEach(t => steps.push({
      id: `file-${fileIndex}:line-${t.line}:source`, title: t.text, status: 'todo', kind: 'source',
      source: { file: note.filename, fileIndex, heading: t.heading, line: t.line, excerpt: t.text },
    }));
  });
  const requested = opts.maxDraftSteps ?? 2;
  const draftLimit = Number.isFinite(requested) ? Math.max(0, Math.min(3, Math.floor(requested))) : 2;
  notes.forEach((note, fileIndex) => {
    if (note.tasks.length) return;
    const context = note.context.find(c => c.text.trim());
    if (!context) return;
    // A small study scaffold, NOT semantic extraction of actions from prose.
    const titles = [
      `Review the passage in “${context.heading}” and choose one learning outcome`,
      `Explain one idea from “${context.heading}” in your own words; check against the passage`,
      `Write one unresolved question about “${context.heading}” for a later session`,
    ];
    titles.slice(0, draftLimit).forEach((title, i) => steps.push({
      id: `file-${fileIndex}:line-${context.line}:draft-${i}`, title, status: 'todo', kind: 'draft',
      source: { file: note.filename, fileIndex, heading: context.heading, line: context.line, excerpt: context.text },
    }));
  });
  const bounded = steps.slice(0, MAX_ROADMAP_STEPS);
  return { steps: bounded, draft: bounded.some(s => s.kind === 'draft'), omitted: Math.max(0, steps.length - MAX_ROADMAP_STEPS) };
}
