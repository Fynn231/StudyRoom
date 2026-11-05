import { createContext, createElement, useContext, useRef, type ReactNode } from "react";
import type { SavedPlan } from "./savedStudyStore.js";

type Selection = { current: SavedPlan | null };
const PlanSelection = createContext<Selection | null>(null);
/** A selected copy belongs to this mounted app/session, never the module. */
export function PlanSelectionProvider({ children }: { children: ReactNode }) {
  const selection = useRef<SavedPlan | null>(null);
  return createElement(PlanSelection.Provider, { value: selection }, children);
}
export function usePlanSelection() {
  const selection = useContext(PlanSelection);
  const local = useRef<SavedPlan | null>(null);
  return selection ?? local;
}
