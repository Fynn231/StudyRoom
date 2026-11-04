import type { PlanningInput, ScheduledPlan } from "./schema.js";
import { validatePlanningInput, record, text } from "./schema.js";
import { validateScheduledPlan } from "./scheduler.js";
export type AccountPlan = { id: string; title: string; input: PlanningInput; plan: ScheduledPlan };
export function validateAccountPlan(value: unknown): AccountPlan {
  const v = record(value, ["id", "title", "input", "plan"]);
  if (
    typeof v.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.id)
  )
    throw Error("Invalid plan ID.");
  const input = validatePlanningInput(v.input);
  return { id: v.id, title: text(v.title, 180), input, plan: validateScheduledPlan(input, v.plan) };
}
