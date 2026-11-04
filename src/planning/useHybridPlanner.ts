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
  const active = useRef<AbortController | null>(null),
    generation = useRef(0);
  useEffect(() => () => active.current?.abort(), []);
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
  async function request(path: string, body?: unknown) {
    const controller = new AbortController();
    active.current?.abort();
    active.current = controller;
    const attempt = ++generation.current;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await authFetch(path, {
        method: body ? "POST" : "GET",
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
  async function saveAccount() {
    if (!current || dirty || busy || !title.trim()) return;
    const value = await request("/api/ai/hybrid/account-plans", {
      id: activePlanId ?? crypto.randomUUID(),
      title: title.trim(),
      ...current,
    });
    if (value?.saved === true) setMessage("Reviewed schedule saved to your signed-in account.");
  }
  async function loadAccount() {
    const value = await request("/api/ai/hybrid/account-plans");
    if (value)
      try {
        if (!Array.isArray(value.plans) || value.plans.length > 20) throw Error();
        setSaved(value.plans.map(validateAccountPlan));
        setActivePlanId(
          Array.isArray(value.plans) && value.plans.length ? value.plans[0].id : null,
        );
        setMessage(
          "Saved schedules loaded. Choose one explicitly to review; your current plan is unchanged.",
        );
      } catch {
        setError("Saved schedules could not be validated. Your current plan is unchanged.");
      }
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
    active,
    generation,
    changed,
    updateTask,
    build,
    enhance,
    saveAccount,
    loadAccount,
    storage,
    newTask,
    localTime,
  };
}
export type HybridPlannerModel = ReturnType<typeof useHybridPlanner>;
