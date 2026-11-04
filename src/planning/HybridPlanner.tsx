import { useHybridPlanner } from "./useHybridPlanner.js";
import { PlanningForm } from "./PlanningForm.js";
import { ScheduleReview } from "./ScheduleReview.js";
export function HybridPlanner({ availableMinutes = 25 }: { availableMinutes?: number }) {
  const model = useHybridPlanner({ availableMinutes });
  const {
    busy,
    loadAccount,
    saved,
    setCurrent,
    setSuggested,
    setTitle,
    setTasks,
    setObjectives,
    setWindows,
    setFocus,
    setRest,
    setMessage,
    localTime,
    generation,
    active,
    setBusy,
    error,
    message,
    setDirty,
  } = model;
  return (
    <details
      className="optional-panel hybrid-planner"
      onToggle={(e) => {
        if (e.currentTarget.open) model.initialize();
      }}
    >
      <summary>Plan tasks &amp; deadlines</summary>
      <p>
        Get a useful schedule without AI. Enter remaining work, deadlines and available time.
        Priority 3 is highest; difficulty 5 is hardest. Deadlines use your device’s time zone.
      </p>
      <PlanningForm model={model} />
      <ScheduleReview model={model} />
      <button disabled={busy} onClick={() => void loadAccount()}>
        Load account schedules
      </button>
      {saved.map((p) => (
        <button
          disabled={busy}
          key={p.id}
          onClick={() => {
            setCurrent({ input: p.input, plan: p.plan });
            setSuggested(null);
            setDirty(false);
            setTitle(p.title);
            setTasks(
              p.input.tasks.map((t) => ({
                ...t,
                deadline: t.deadline ? localTime(new Date(t.deadline)) : "",
              })),
            );
            setObjectives(p.input.objectives.join("\n"));
            setWindows(
              p.input.windows.map((w) => ({
                start: localTime(new Date(w.start)),
                end: localTime(new Date(w.end)),
              })),
            );
            setFocus(p.input.preferences.focusMinutes);
            setRest(p.input.preferences.breakMinutes);
            setMessage("Saved schedule opened for review. No timer or progress was changed.");
          }}
        >
          Review saved schedule: {p.title}
        </button>
      ))}
      {busy && (
        <>
          <p role="status">Working… Your current schedule is preserved.</p>
          <button
            onClick={() => {
              generation.current++;
              active.current?.abort();
              active.current = null;
              setBusy(false);
              setMessage("Cancelled. Your schedule is unchanged.");
            }}
          >
            Cancel planning request
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
