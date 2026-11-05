import { useEffect, useRef, useState } from "react";
import { useAuthFetch } from "../auth.js";
import { usePrivateStorage } from "../privateStorage.js";
import { schedule, validateScheduledPlan } from "./scheduler.js";
import {
  validatePlanningInput,
  type PlanningInput,
  type PlanningTask,
  type ScheduledPlan,
} from "./schema.js";
import { validateAccountPlan, type AccountPlan } from "./savedSchedule.js";

type TaskDraft = Omit<PlanningTask, "deadline"> & { deadline: string };
function localTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
const newTask = (): TaskDraft => ({
  id: crypto.randomUUID(),
  title: "",
  deadline: "",
  priority: 2,
  difficulty: 3,
  estimatedMinutes: 25,
  completedMinutes: 0,
});
const preferenceKey = "studyroom.planning.preference.v1";
const pendingKey = "studyroom.planning.pending-save.v1";
type SaveJournal = { version: 1; id: string; fingerprint: string };
function readSaveJournal(storage: Storage): SaveJournal | null {
  const raw = storage.getItem(pendingKey);
  if (raw === null) return null;
  if (raw.length > 300) throw Error("Invalid save recovery metadata.");
  const value = JSON.parse(raw);
  if (
    !value ||
    Object.keys(value).sort().join(",") !== "fingerprint,id,version" ||
    value.version !== 1 ||
    typeof value.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id) ||
    typeof value.fingerprint !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.fingerprint)
  )
    throw Error("Invalid save recovery metadata.");
  return { version: 1, id: value.id, fingerprint: value.fingerprint };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
async function fingerprint(plan: AccountPlan) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(plan)));
  return Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, "0")).join("");
}
export function useHybridPlanner({ availableMinutes = 25 }: { availableMinutes?: number }) {
  const initialized = useRef(false);
  const authFetch = useAuthFetch(),
    storage = usePrivateStorage();
  const [tasks, setTasks] = useState<TaskDraft[]>(() => [newTask()]);
  const [objectives, setObjectives] = useState("");
  const [windows, setWindows] = useState(() => {
    const start = new Date();
    start.setSeconds(0, 0);
    return [
      {
        start: localTime(start),
        end: localTime(new Date(start.getTime() + availableMinutes * 60000)),
      },
    ];
  });
  const [focus, setFocus] = useState(Math.max(5, Math.min(90, availableMinutes))),
    [rest, setRest] = useState(5);
  const [current, setCurrent] = useState<{ input: PlanningInput; plan: ScheduledPlan } | null>(
    null,
  );
  const [suggested, setSuggested] = useState<ScheduledPlan | null>(null),
    [dirty, setDirty] = useState(false);
  const [title, setTitle] = useState("My study schedule");
  const [preference, setPreference] = useState(() => {
    try {
      return storage.getItem(preferenceKey) === "cloud-qwen" ? "cloud-qwen" : "deterministic";
    } catch {
      return "deterministic";
    }
  });
  const [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [retryAt, setRetryAt] = useState(0),
    [now, setNow] = useState(Date.now());
  const [saved, setSaved] = useState<AccountPlan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<AccountPlan | null>(null);
  const [recovery, setRecovery] = useState(() => {
    try {
      return { journal: readSaveJournal(storage), error: "" };
    } catch {
      return {
        journal: null as SaveJournal | null,
        error:
          "Save recovery metadata cannot be read. Cloud saving is blocked; keep your draft and repair storage or explicitly stop tracking the previous attempt.",
      };
    }
  });
  const journalRef = useRef(recovery.journal),
    saveGuard = useRef(false),
    saveOperation = useRef(0);
  const active = useRef<AbortController | null>(null),
    generation = useRef(0);
  useEffect(
    () => () => {
      saveOperation.current++;
      active.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  function changed(action: () => void) {
    action();
    setDirty(true);
    setSuggested(null);
    setMessage("");
  }
  function updateTask(index: number, patch: Partial<TaskDraft>) {
    changed(() => setTasks(tasks.map((t, i) => (i === index ? { ...t, ...patch } : t))));
  }
  function build() {
    try {
      const input = validatePlanningInput({
        tasks: tasks.map((t) => ({
          ...t,
          deadline: t.deadline ? new Date(t.deadline).toISOString() : null,
        })),
        objectives: objectives
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        windows: windows.map((w) => ({
          start: new Date(w.start).toISOString(),
          end: new Date(w.end).toISOString(),
        })),
        preferences: { focusMinutes: focus, breakMinutes: rest },
      });
      setCurrent({ input, plan: schedule(input) });
      setActivePlanId(null);
      setDirty(false);
      setSuggested(null);
      setError("");
      setMessage(
        "Baseline ready. Review the schedule; no AI was contacted and no timer was started.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review your planning fields.");
    }
  }
  async function request(path: string, body?: unknown, method = body ? "POST" : "GET") {
    const controller = new AbortController();
    active.current?.abort();
    active.current = controller;
    const attempt = ++generation.current;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await authFetch(path, {
        method,
        cache: "no-store",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(40000)]),
        ...(body
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
          : {}),
      });
      const value = await response.json();
      if (!response.ok) {
        const seconds = Number(response.headers.get("retry-after"));
        if (Number.isFinite(seconds) && seconds > 0)
          setRetryAt(Date.now() + Math.min(86400, seconds) * 1000);
        throw Error(
          typeof value.error === "string"
            ? value.error
            : "Planning is unavailable. Your current plan is unchanged.",
        );
      }
      return attempt === generation.current && !controller.signal.aborted ? value : null;
    } catch (e) {
      if (attempt === generation.current && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Request failed. Your plan is unchanged.");
      return null;
    } finally {
      if (attempt === generation.current) {
        setBusy(false);
        active.current = null;
      }
    }
  }
  async function enhance() {
    if (
      !current ||
      dirty ||
      !consent ||
      preference !== "cloud-qwen" ||
      busy ||
      retryAt > Date.now()
    )
      return;
    const value = await request("/api/ai/hybrid/enhance", { input: current.input, consent: true });
    if (value)
      try {
        setSuggested(validateScheduledPlan(current.input, value.plan));
        setMessage("Enhancement ready for review. Your baseline and edits have not been replaced.");
      } catch {
        setError("Invalid enhancement. Your current plan is unchanged.");
      }
  }
  function persistAttempt(entry: SaveJournal) {
    const existing = readSaveJournal(storage);
    if (existing && canonical(existing) !== canonical(entry))
      throw Error("Another save recovery record exists. Check it before saving.");
    journalRef.current = entry;
    setRecovery({ journal: entry, error: "" });
    const raw = JSON.stringify(entry);
    storage.setItem(pendingKey, raw);
    if (storage.getItem(pendingKey) !== raw)
      throw Error("Save recovery metadata could not be verified. No new save was sent.");
  }
  function clearAttempt(entry: SaveJournal) {
    const existing = readSaveJournal(storage);
    if (existing && canonical(existing) !== canonical(entry))
      throw Error("Save recovery record changed; no metadata was cleared.");
    storage.removeItem(pendingKey);
    if (storage.getItem(pendingKey) !== null)
      throw Error(
        "Saved, but recovery metadata could not be cleared. Check previous save again before another copy.",
      );
    journalRef.current = null;
    setRecovery({ journal: null, error: "" });
    setPendingSave(null);
  }
  async function checkPreviousSave() {
    const entry = journalRef.current;
    if (!entry || saveGuard.current || busy) return;
    saveGuard.current = true;
    const operation = ++saveOperation.current;
    try {
      const value = await request(`/api/ai/hybrid/account-plans?id=${entry.id}`);
      if (!value || operation !== saveOperation.current) return;
      if (!Array.isArray(value.plans) || value.plans.length > 1)
        throw Error("The attempted owner/ID could not be reconciled.");
      if (!value.plans.length) {
        setMessage(
          "Previous save not found yet. The original request may still commit; no new copy was sent. Current edits are unchanged.",
        );
        return "empty";
      }
      const row = validateAccountPlan(value.plans[0]);
      if (row.id !== entry.id || (await fingerprint(row)) !== entry.fingerprint)
        throw Error(
          "A different cloud copy exists under this attempted ID. No insert or overwrite was attempted; current edits are unchanged.",
        );
      if (operation !== saveOperation.current) return;
      clearAttempt(entry);
      setMessage(
        "Previous attempted copy confirmed saved to your signed-in account. Current edits are unchanged; save again only to create another new copy.",
      );
    } catch (error) {
      if (operation === saveOperation.current)
        setError(
          error instanceof Error ? error.message : "Save reconciliation failed; keep your draft.",
        );
    } finally {
      if (operation === saveOperation.current) saveGuard.current = false;
    }
  }
  async function retryOriginalSave() {
    if (!pendingSave || busy || saveGuard.current) return;
    const entry = journalRef.current,
      attempt = pendingSave;
    if (!entry || (await checkPreviousSave()) !== "empty" || journalRef.current !== entry) return;
    saveGuard.current = true;
    const operation = ++saveOperation.current;
    setBusy(true);
    try {
      if ((await fingerprint(attempt)) !== entry.fingerprint)
        throw Error("The original attempted payload is unavailable; check previous save instead.");
      if (operation !== saveOperation.current) return;
      persistAttempt(entry);
      const value = await request("/api/ai/hybrid/account-plans", attempt);
      if (operation !== saveOperation.current) return;
      if (value?.saved === true && value.id === entry.id) {
        clearAttempt(entry);
        setMessage(
          "Original attempted copy confirmed saved to your signed-in account. Newer edits are unchanged.",
        );
      } else if (value)
        setError(
          "Original save is still unconfirmed. Check previous save; no different payload or new ID was sent.",
        );
    } catch (error) {
      if (operation === saveOperation.current)
        setError(error instanceof Error ? error.message : "Original save retry failed.");
    } finally {
      if (operation === saveOperation.current) {
        saveGuard.current = false;
        setBusy(false);
      }
    }
  }
  async function saveAccount() {
    if (journalRef.current) {
      await checkPreviousSave();
      return;
    }
    if (recovery.error || !current || dirty || busy || saveGuard.current || !title.trim()) return;
    saveGuard.current = true;
    const operation = ++saveOperation.current;
    setBusy(true);
    try {
      const attempt = structuredClone(
        validateAccountPlan({ id: crypto.randomUUID(), title: title.trim(), ...current }),
      );
      const entry: SaveJournal = {
        version: 1,
        id: attempt.id,
        fingerprint: await fingerprint(attempt),
      };
      if (operation !== saveOperation.current) return;
      setPendingSave(attempt);
      persistAttempt(entry);
      const value = await request("/api/ai/hybrid/account-plans", attempt);
      if (operation !== saveOperation.current) return;
      if (value?.saved === true && value.id === attempt.id) {
        clearAttempt(entry);
        setMessage("Reviewed schedule saved to your signed-in account as a new copy.");
      } else if (value)
        setError(
          "Save acknowledgement was not confirmed for this ID. Check previous save before retrying; your edits are unchanged.",
        );
    } catch (error) {
      if (operation === saveOperation.current)
        setError(
          `Review the schedule or recovery storage before saving. ${error instanceof Error ? error.message : "Save unavailable."} Your edits are unchanged.`,
        );
    } finally {
      if (operation === saveOperation.current) {
        saveGuard.current = false;
        setBusy(false);
      }
    }
  }
  function stopTrackingSave() {
    if (busy || saveGuard.current) return;
    try {
      const raw = storage.getItem(pendingKey);
      if (
        !window.confirm(
          "Stop tracking this save attempt? The original request may still appear later. Your current edits are not saved. A later new-copy save may create a duplicate. No cloud copy will be deleted.",
        )
      )
        return;
      if (storage.getItem(pendingKey) !== raw)
        throw Error("Recovery metadata changed. Check it before clearing.");
      storage.removeItem(pendingKey);
      if (storage.getItem(pendingKey) !== null)
        throw Error("Recovery metadata could not be cleared; cloud saving remains blocked.");
      journalRef.current = null;
      setRecovery({ journal: null, error: "" });
      setPendingSave(null);
      setError("");
      setMessage(
        "Stopped tracking only. Nothing was saved or deleted; your draft is unchanged. A later new-copy save may duplicate a delayed original.",
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not clear recovery metadata.");
    }
  }
  async function loadAccount() {
    const value = await request("/api/ai/hybrid/account-plans");
    if (value)
      try {
        if (!Array.isArray(value.plans) || value.plans.length > 20) throw Error();
        setSaved(value.plans.map(validateAccountPlan));
        setActivePlanId(null);

        setMessage(
          "Saved schedules loaded. Choose one explicitly to review; your current plan is unchanged.",
        );
      } catch {
        setError("Saved schedules could not be validated. Your current plan is unchanged.");
      }
  }
  async function deleteAccount(plan: AccountPlan) {
    if (
      busy ||
      !window.confirm(
        `Delete cloud schedule “${plan.title}”? This removes only this saved account copy, not your current draft or your user account.`,
      )
    )
      return;
    const value = await request(`/api/ai/hybrid/account-plans?id=${plan.id}`, undefined, "DELETE");
    if (value?.deleted === true && value.id === plan.id) {
      setSaved((previous) => previous.filter((p) => p.id !== plan.id));
      if (activePlanId === plan.id) setActivePlanId(null);
      if (pendingSave?.id === plan.id) setPendingSave(null);
      setMessage(
        "Cloud schedule deletion confirmed. Your current draft and device copies are unchanged.",
      );
    } else if (value)
      setError(
        "Cloud deletion was not confirmed. Reload saved schedules before retrying. Your draft is unchanged.",
      );
  }
  function initialize() {
    if (initialized.current) return;
    initialized.current = true;
    const start = new Date();
    start.setSeconds(0, 0);
    setWindows([
      {
        start: localTime(start),
        end: localTime(new Date(start.getTime() + availableMinutes * 60000)),
      },
    ]);
    setFocus(Math.max(5, Math.min(90, availableMinutes)));
  }
  return {
    initialize,
    tasks,
    setTasks,
    objectives,
    setObjectives,
    windows,
    setWindows,
    focus,
    setFocus,
    rest,
    setRest,
    current,
    setCurrent,
    suggested,
    setSuggested,
    dirty,
    setDirty,
    title,
    setTitle,
    preference,
    setPreference,
    consent,
    setConsent,
    busy,
    setBusy,
    message,
    setMessage,
    error,
    setError,
    retryAt,
    now,
    saved,
    activePlanId,
    setActivePlanId,
    pendingSave,
    recovery,
    checkPreviousSave,
    retryOriginalSave,
    stopTrackingSave,
    active,
    generation,
    changed,
    updateTask,
    build,
    enhance,
    saveAccount,
    loadAccount,
    deleteAccount,
    storage,
    newTask,
    localTime,
  };
}
export type HybridPlannerModel = ReturnType<typeof useHybridPlanner>;
