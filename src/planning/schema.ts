// Provider-independent contracts: no credentials, endpoints or executable content.
export type PlanningTask = {
  id: string;
  title: string;
  deadline: string | null;
  priority: number;
  difficulty: number;
  estimatedMinutes: number;
  completedMinutes: number;
};
export type PlanningInput = {
  tasks: PlanningTask[];
  objectives: string[];
  windows: { start: string; end: string }[];
  preferences: { focusMinutes: number; breakMinutes: number };
};
export type PlanBlock = {
  id: string;
  taskId: string | null;
  kind: "study" | "break";
  start: string;
  end: string;
  title: string;
  instructions: string;
};
export type ScheduledPlan = {
  version: 1;
  blocks: PlanBlock[];
  unfinished: { taskId: string; minutes: number }[];
  warnings: string[];
};
export function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join("|") !== [...keys].sort().join("|")
  )
    throw Error("Invalid planning fields.");
  return value as Record<string, unknown>;
}
export function text(value: unknown, max: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)
  )
    throw Error("Use bounded plain text.");
  return value.trim();
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max)
    throw Error("Invalid planning duration or priority.");
  return value;
}
export function instant(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw Error("Use a valid UTC date and time.");
  return value;
}
function array(value: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    throw Error("Too many or too few planning items.");
  return value;
}
export function validatePlanningInput(value: unknown): PlanningInput {
  const input = record(value, ["tasks", "objectives", "windows", "preferences"]);
  const tasks = array(input.tasks, 1, 20).map((value) => {
    const t = record(value, [
      "id",
      "title",
      "deadline",
      "priority",
      "difficulty",
      "estimatedMinutes",
      "completedMinutes",
    ]);
    const id = text(t.id, 64);
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw Error("Invalid task ID.");
    const estimatedMinutes = integer(t.estimatedMinutes, 1, 1440);
    return {
      id,
      title: text(t.title, 180),
      deadline: t.deadline === null ? null : instant(t.deadline),
      priority: integer(t.priority, 1, 3),
      difficulty: integer(t.difficulty, 1, 5),
      estimatedMinutes,
      completedMinutes: integer(t.completedMinutes, 0, estimatedMinutes),
    };
  });
  if (new Set(tasks.map((t) => t.id)).size !== tasks.length)
    throw Error("Task IDs must be unique.");
  const windows = array(input.windows, 1, 14)
    .map((value) => {
      const w = record(value, ["start", "end"]);
      const start = instant(w.start),
        end = instant(w.end);
      const duration = (Date.parse(end) - Date.parse(start)) / 60000;
      if (!Number.isInteger(duration) || duration < 1 || duration > 480)
        throw Error("Availability must be 1–480 whole minutes.");
      return { start, end };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
  if (windows.some((w, i) => i > 0 && w.start < windows[i - 1].end))
    throw Error("Availability windows overlap.");
  if (
    Date.parse(windows.at(-1)!.end) - Date.parse(windows[0].start) > 31 * 86400000 ||
    windows.reduce((sum, w) => sum + (Date.parse(w.end) - Date.parse(w.start)) / 60000, 0) > 1440
  )
    throw Error("Plan up to 1,440 available minutes within 31 days.");
  const preferences = record(input.preferences, ["focusMinutes", "breakMinutes"]);
  return {
    tasks,
    windows,
    objectives: array(input.objectives, 0, 8).map((v) => text(v, 240)),
    preferences: {
      focusMinutes: integer(preferences.focusMinutes, 5, 90),
      breakMinutes: integer(preferences.breakMinutes, 0, 30),
    },
  };
}
