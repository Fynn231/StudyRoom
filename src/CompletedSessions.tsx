import { useEffect, useState } from "react";
import { usePrivateKey, usePrivateStorage } from "./privateStorage.js";
import { loadSessions, SESSIONS_KEY, type SessionRecord } from "./sessionRecords.js";

export function CompletedSessions({ changeToken }: { changeToken: string }) {
  const storage = usePrivateStorage(),
    key = usePrivateKey(SESSIONS_KEY);
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<SessionRecord[]>([]),
    [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!open) return;
    const read = () => {
      const value = loadSessions(storage);
      setRecords(value.sessions);
      setBlocked(value.blocked);
    };
    const changed = (event: StorageEvent) => {
      if (event.key === key || event.key === null) read();
    };
    read();
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [open, changeToken, storage, key]);
  return (
    <details
      className="optional-panel completed-sessions"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Completed sessions</summary>
      <p className="quiet-note">
        Completed timer cycles and optional ratings on this device, separated by account. No
        intentions, notes, room identities or files. Nothing is uploaded. Private reflections below
        are separate.
      </p>
      {blocked ? (
        <p role="alert" className="error">
          Completed-session history is unavailable or invalid. Stored data has been preserved.
        </p>
      ) : records.length === 0 ? (
        <p>No completed timer cycles yet. Your first finished focus session will appear here.</p>
      ) : (
        <>
          <p className="quiet-note">
            {records.length} completed {records.length === 1 ? "session" : "sessions"} ·{" "}
            {Math.round(records.reduce((sum, record) => sum + record.focusedMs, 0) / 60000)} minutes
            focused
          </p>
          <ul className="history" aria-label="Completed timer sessions">
            {records.map((record) => (
              <li key={record.id}>
                <time dateTime={record.completedAt}>
                  {new Date(record.completedAt).toLocaleString()}
                </time>
                <strong>{Math.round(record.focusedMs / 60000)} min focused</strong>
                <p>
                  {record.stepsDone} of {record.stepsTotal} plan steps checked
                </p>
                <p>
                  {record.rating === null
                    ? "No experience rating"
                    : `Experience: ${record.rating}/5`}
                  {record.focusRating === null ? "" : ` · Focus: ${record.focusRating}/5`}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
