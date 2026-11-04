import {
  validatePlanningInput,
  record,
  text,
  type PlanningInput,
  type ScheduledPlan,
} from "./schema.js";
const minute = 60000;

/** Stable deadline-first allocation. Estimates are user input, never a claim of completion. */
export function schedule(value: PlanningInput): ScheduledPlan {
  const input = validatePlanningInput(value);
  const remaining = new Map(
    input.tasks.map((t) => [t.id, t.estimatedMinutes - t.completedMinutes]),
  );
  const ordered = [...input.tasks].sort(
    (a, b) =>
      (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
      b.priority - a.priority ||
      b.difficulty - a.difficulty ||
      a.id.localeCompare(b.id),
  );
  const blocks: ScheduledPlan["blocks"] = [];
  const warnings: string[] = [];
  const add = (
    kind: "study" | "break",
    taskId: string | null,
    title: string,
    instructions: string,
    start: number,
    end: number,
  ) => {
    blocks.push({
      id: `block-${blocks.length + 1}`,
      kind,
      taskId,
      title,
      instructions,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
    });
  };
  for (const window of input.windows) {
    let cursor = Date.parse(window.start);
    const end = Date.parse(window.end);
    while (cursor < end) {
      const task = ordered.find((t) => remaining.get(t.id)! > 0);
      if (!task) break;
      // Harder work gets shorter chunks, without inflating the user's estimate.
      const chunk = Math.max(
        1,
        Math.floor(input.preferences.focusMinutes / (1 + (task.difficulty - 1) * 0.1)),
      );
      const duration = Math.min(remaining.get(task.id)!, chunk, (end - cursor) / minute);
      add(
        "study",
        task.id,
        task.title,
        "Work on this task, then check what remains. Planned time is not recorded progress.",
        cursor,
        cursor + duration * minute,
      );
      cursor += duration * minute;
      remaining.set(task.id, remaining.get(task.id)! - duration);
      if (
        task.deadline &&
        cursor > Date.parse(task.deadline) &&
        !warnings.includes(`Deadline may be missed: ${task.id}`)
      )
        warnings.push(`Deadline may be missed: ${task.id}`);
      if (!ordered.some((t) => remaining.get(t.id)! > 0)) break;
      if (blocks.length >= 200) {
        warnings.push("Plan block limit reached; remaining work is listed below.");
        break;
      }
      const rest = Math.min(input.preferences.breakMinutes, (end - cursor) / minute);
      if (rest > 0) {
        add(
          "break",
          null,
          "Take a break",
          "Step away, rest your eyes and return when ready.",
          cursor,
          cursor + rest * minute,
        );
        cursor += rest * minute;
      }
      // Bound rendering and model output even for minute-sized tasks/windows.
      if (blocks.length >= 200) {
        warnings.push("Plan block limit reached; remaining work is listed below.");
        break;
      }
    }
    if (blocks.length >= 200) break;
  }
  const unfinished = input.tasks
    .filter((t) => remaining.get(t.id)! > 0)
    .map((t) => ({ taskId: t.id, minutes: remaining.get(t.id)! }));
  if (unfinished.length)
    warnings.push(
      "Not all work fits. Add availability or revise estimates; nothing was marked complete.",
    );
  return { version: 1, blocks, unfinished, warnings };
}

// Models may clarify wording only. IDs, durations, deadlines and task allocation
// remain under the deterministic engine, even when an enhancement looks plausible.
export function applyEnhancement(input: PlanningInput, value: unknown): ScheduledPlan {
  const baseline = schedule(input);
  const body = record(value, ["suggestions"]);
  if (
    !Array.isArray(body.suggestions) ||
    body.suggestions.length !== baseline.blocks.filter((b) => b.kind === "study").length
  )
    throw Error("Invalid enhancement count.");
  const seen = new Set<string>();
  const suggestions = new Map(
    body.suggestions.map((value) => {
      const item = record(value, ["blockId", "title", "instructions"]);
      const id = text(item.blockId, 64);
      if (seen.has(id) || !baseline.blocks.some((b) => b.id === id && b.kind === "study"))
        throw Error("Unknown or duplicate block.");
      seen.add(id);
      return [id, { title: text(item.title, 180), instructions: text(item.instructions, 900) }];
    }),
  );
  return { ...baseline, blocks: baseline.blocks.map((b) => ({ ...b, ...suggestions.get(b.id) })) };
}

/** Saved schedules must still match their input; edited text is allowed, schedule tampering is not. */
export function validateScheduledPlan(input: PlanningInput, value: unknown): ScheduledPlan {
  const baseline = schedule(input);
  const plan = record(value, ["version", "blocks", "unfinished", "warnings"]);
  if (
    plan.version !== 1 ||
    !Array.isArray(plan.blocks) ||
    plan.blocks.length !== baseline.blocks.length ||
    JSON.stringify(plan.unfinished) !== JSON.stringify(baseline.unfinished) ||
    JSON.stringify(plan.warnings) !== JSON.stringify(baseline.warnings)
  )
    throw Error("Plan does not match its inputs.");
  const blocks = plan.blocks.map((value, index) => {
    const block = record(value, ["id", "taskId", "kind", "start", "end", "title", "instructions"]);
    const expected = baseline.blocks[index];
    for (const key of ["id", "taskId", "kind", "start", "end"] as const)
      if (block[key] !== expected[key]) throw Error("Scheduling conflict or unknown task.");
    return {
      ...expected,
      title: text(block.title, 180),
      instructions: text(block.instructions, 900),
    };
  });
  return { ...baseline, blocks };
}
