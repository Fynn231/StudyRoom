import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { useNaturalMotion } from "./naturalMotion.js";
import { windSeed } from "./openScenery.js";
import { usePrivateStorage } from "./privateStorage.js";
export function useWelcome(enabled: boolean) {
  const storage = usePrivateStorage();
  const [returning, setReturning] = useState(() => {
    try {
      return storage.getItem("studyroom.welcome.seen") === "1";
    } catch {
      return false;
    }
  });
  const [open, setOpen] = useState(
    () => enabled && !new URL(window.location.href).searchParams.has("room"),
  );
  const [leaving, setLeaving] = useState(false);
  const dismissed = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open && dismissed.current) document.getElementById("main")?.focus();
  }, [open]);
  function close(animate: boolean) {
    clearTimeout(timer.current);
    try {
      storage.setItem("studyroom.welcome.seen", "1");
    } catch {
      /* Entry never depends on storage permission. */
    }
    const finish = () => {
      setReturning(true);
      dismissed.current = true;
      setOpen(false);
      setLeaving(false);
    };
    if (animate && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setLeaving(true);
      timer.current = setTimeout(finish, 1100);
    } else finish();
  }
  return {
    open,
    returning,
    leaving,
    close,
    show() {
      clearTimeout(timer.current);
      setReturning(true);
      setLeaving(false);
      setOpen(true);
    },
  };
}
export function WelcomeScene({
  leaving,
  onEnter,
  onEscape,
  sound,
  returning = false,
  canContinue = false,
  onContinue,
}: {
  returning?: boolean;
  canContinue?: boolean;
  onContinue?: () => void;
  leaving: boolean;
  onEnter: () => void;
  onEscape?: () => void;
  sound?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const petals = useRef<HTMLDivElement>(null);
  useNaturalMotion(petals, true, false, "welcome");
  useEffect(() => {
    const sync = () => {
      if (dialog.current) dialog.current.dataset.hidden = String(document.hidden);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  useEffect(() => {
    const el = dialog.current!;
    if (typeof el.showModal === "function") el.showModal();
    else el.setAttribute("open", "");
    return () => {
      if (typeof el.close === "function") el.close();
      else el.removeAttribute("open");
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="welcome-scene"
      data-leaving={leaving}
      aria-labelledby="welcome-heading"
      aria-describedby="welcome-note"
      onCancel={(e) => {
        e.preventDefault();
        (onEscape ?? onEnter)();
      }}
    >
      {/* Translucent flakes share a wind field, never a looping CSS track. */}
      <div ref={petals} className="welcome-petals" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <i
            key={i}
            style={
              {
                "--leaf-size": `${26 + windSeed(i) * 12}px`,
              } as CSSProperties
            }
          >
            {/* Confirmed original welcome family (5b5a747/f6fb7c5): one thin
                translucent CSS flake, not the rejected split/folded SVG. */}
            <span className="welcome-flake" />
          </i>
        ))}
      </div>
      <div className="welcome-copy">
        <p className="eyebrow">STUDY ROOM</p>
        <h1 id="welcome-heading">
          {returning ? "Welcome back to your study room." : "Welcome to your virtual study room."}
        </h1>
        <p>A little space to slow down, focus, and grow.</p>
        {returning && canContinue && (
          <p className="quiet-note">
            Return to your timer checkpoint and latest saved plan. Timers resume paused; notes and
            unsaved drafts are not recovered after closing a tab.
          </p>
        )}
        <p id="welcome-note" className="quiet-note">
          Headphones recommended for the best experience
        </p>
        <div className="welcome-actions">
          <button
            className="primary"
            disabled={leaving}
            onClick={returning && canContinue && onContinue ? onContinue : onEnter}
            autoFocus
          >
            {returning
              ? canContinue
                ? "Continue last session"
                : "Continue to Study Room"
              : "Continue to Study Room"}
          </button>
        </div>
        {sound}
      </div>
    </dialog>
  );
}
