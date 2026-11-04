// Shared, module-level handle for the currently selected (resumed) saved plan.
// Kept in sync by StudyProgress; read by App.tsx completion accounting so the
// steps counted against a finished cycle come from the explicitly selected plan
// instead of a DOM selector priority scan over three independent copies.

import type { SavedPlan } from "./savedStudyStore.js";

let current: SavedPlan | null = null;

export function selectPlan(plan: SavedPlan): void {
  current = plan;
}

export function clearPlanSelection(): void {
  current = null;
}

export function readPlanSelection(): SavedPlan | null {
  return current;
}
