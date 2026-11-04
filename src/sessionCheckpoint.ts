export const CHECKPOINT_KEY = "studyroom.timerCheckpoint.v1";
export type TimerCheckpoint = {
  durationMs: number;
  remainingMs: number;
  savedAt: number;
};
export function readCheckpoint(storage: Pick<Storage, "getItem">): TimerCheckpoint | null {
  try {
    const v = JSON.parse(storage.getItem(CHECKPOINT_KEY) ?? "null");
    return v &&
      Object.keys(v).sort().join("|") === "durationMs|remainingMs|savedAt" &&
      Number.isInteger(v.durationMs) &&
      v.durationMs >= 60000 &&
      v.durationMs <= 10800000 &&
      Number.isFinite(v.remainingMs) &&
      v.remainingMs >= 0 &&
      v.remainingMs <= v.durationMs &&
      Number.isSafeInteger(v.savedAt) &&
      v.savedAt > 0
      ? v
      : null;
  } catch {
    return null;
  }
}
export function saveCheckpoint(
  storage: Pick<Storage, "setItem" | "getItem">,
  value: TimerCheckpoint,
): boolean {
  try {
    storage.setItem(CHECKPOINT_KEY, JSON.stringify(value));
    const raw = storage.getItem(CHECKPOINT_KEY);
    if (raw === null) return false;
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed) === JSON.stringify(value);
  } catch {
    return false;
  }
}
