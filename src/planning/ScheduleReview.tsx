import type { HybridPlannerModel } from "./useHybridPlanner.js";
import { SaveStudyPlan } from "../StudyProgress.js";
const preferenceKey = "studyroom.planning.preference.v1";
export function ScheduleReview({ model }: { model: HybridPlannerModel }) {
  const {
    current,
    setCurrent,
    suggested,
    setSuggested,
    dirty,
    title,
    setTitle,
    busy,
    preference,
    setPreference,
    setConsent,
    consent,
    retryAt,
    now,
    storage,
    setMessage,
    setError,
    enhance,
    saveAccount,
  } = model;
  return (
    <>
      {current && (
        <section aria-label="Reviewed schedule">
          <h3>Review your schedule</h3>
          {dirty && (
            <p role="status">
              Inputs changed. Rebuild before enhancing or saving; your previous schedule is still
              shown.
            </p>
          )}
          <label>
            Schedule title
            <input
              disabled={busy}
              maxLength={180}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          {current.input.objectives.length > 0 && (
            <ul>
              {current.input.objectives.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          )}
          <ol>
            {current.plan.blocks.map((b, i) => (
              <li key={b.id}>
                <p>
                  {new Date(b.start).toLocaleString()} – {new Date(b.end).toLocaleTimeString()} ·{" "}
                  {b.kind}
                </p>
                <label>
                  Block {i + 1} title
                  <input
                    disabled={busy || dirty}
                    maxLength={180}
                    value={b.title}
                    onChange={(e) => {
                      setSuggested(null);
                      setCurrent({
                        ...current,
                        plan: {
                          ...current.plan,
                          blocks: current.plan.blocks.map((v, j) =>
                            i === j ? { ...v, title: e.target.value } : v,
                          ),
                        },
                      });
                    }}
                  />
                </label>
                <label>
                  Block {i + 1} instructions
                  <textarea
                    disabled={busy || dirty}
                    maxLength={900}
                    value={b.instructions}
                    onChange={(e) => {
                      setSuggested(null);
                      setCurrent({
                        ...current,
                        plan: {
                          ...current.plan,
                          blocks: current.plan.blocks.map((v, j) =>
                            i === j ? { ...v, instructions: e.target.value } : v,
                          ),
                        },
                      });
                    }}
                  />
                </label>
              </li>
            ))}
          </ol>
          {current.plan.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
          {current.plan.unfinished.length > 0 && (
            <ul aria-label="Unfinished work">
              {current.plan.unfinished.map((t) => (
                <li key={t.taskId}>
                  {current.input.tasks.find((v) => v.id === t.taskId)!.title}: {t.minutes} minutes
                  unscheduled
                </li>
              ))}
            </ul>
          )}
          <label>
            Planning provider
            <select
              aria-label="Planning provider"
              disabled={busy}
              value={preference}
              onChange={(e) => {
                setPreference(e.target.value);
                setConsent(false);
              }}
            >
              <option value="deterministic">Deterministic only</option>
              <option value="cloud-qwen">Cloud Qwen (verified free route only)</option>
            </select>
          </label>
          <button
            disabled={busy}
            onClick={() => {
              setMessage("");
              setError("");
              try {
                storage.setItem(preferenceKey, preference);
                if (storage.getItem(preferenceKey) !== preference)
                  throw Error("Unconfirmed preference");
                setMessage(
                  "Planning preference saved for this account on this device. Cloud consent is not saved.",
                );
              } catch {
                setError("Preference could not be saved; this visit still works.");
              }
            }}
          >
            Save planning preference on this device
          </button>
          <p>
            Ollama, LM Studio and browser Qwen are planned, not available here. They will not use
            the server’s OpenRouter quota.
          </p>
          <label>
            <input
              type="checkbox"
              disabled={busy || preference !== "cloud-qwen"}
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I agree to send this schedule’s task titles, objectives, difficulty and allotted minutes
            to OpenRouter and its free Qwen provider. Provider data policies apply. Study Room’s
            server receives this planning input to validate the schedule. No deadlines, progress
            history, room data or imported notes are sent.
          </label>
          <button
            disabled={busy || dirty || !consent || preference !== "cloud-qwen" || retryAt > now}
            onClick={() => void enhance()}
          >
            Enhance with free Qwen
          </button>
          {retryAt > now && (
            <p role="status">
              Cloud cooldown: {Math.ceil((retryAt - now) / 1000)} seconds. Baseline planning remains
              available.
            </p>
          )}
          {suggested && (
            <section aria-label="Suggested enhancement">
              <h4>Review Qwen suggestions</h4>
              <ol>
                {suggested.blocks
                  .filter((b) => b.kind === "study")
                  .map((b) => (
                    <li key={b.id}>
                      <strong>{b.title}</strong>
                      <p>{b.instructions}</p>
                    </li>
                  ))}
              </ol>
              <button
                onClick={() => {
                  setCurrent({ ...current, plan: suggested });
                  setSuggested(null);
                }}
              >
                Use reviewed enhancement
              </button>
              <button onClick={() => setSuggested(null)}>Keep current schedule</button>
            </section>
          )}
          <button
            disabled={
              busy || dirty || !title.trim() || !!model.recovery.journal || !!model.recovery.error
            }
            onClick={() => void saveAccount()}
          >
            Save as new copy to account
          </button>
          <p className="quiet-note">
            Account saving creates a separate copy; existing cloud schedules are never overwritten.
            In-place cloud updates are not enabled by the reviewed database grants. Delete unneeded
            cloud copies to free library space.
          </p>
          {model.activePlanId && (
            <p>Reviewing cloud copy: {model.activePlanId}. Edits will be saved as a new copy.</p>
          )}
          {model.pendingSave && (
            <p role="status">
              Unconfirmed save attempt: {model.pendingSave.id}. Use Check previous save or Retry
              original save above. A retry sends the previous version, not these newer edits.
            </p>
          )}
          {!dirty && (
            <SaveStudyPlan
              draft={{
                title,
                kind: "deterministic",
                objectives: current.input.objectives,
                steps: current.plan.blocks
                  .filter((b) => b.kind === "study")
                  .slice(0, 12)
                  .map((b) => ({
                    title: b.title,
                    instructions: b.instructions,
                    minutes: (Date.parse(b.end) - Date.parse(b.start)) / 60000,
                    done: false,
                  })),
              }}
            />
          )}
          <p className="quiet-note">
            Device save stores a checklist copy (up to 12 study blocks), not a cloud-synced
            schedule. Account save stores the reviewed tasks/deadlines and full schedule in Supabase
            only after approval. Neither action starts a timer or changes recorded progress.
          </p>
        </section>
      )}
    </>
  );
}
