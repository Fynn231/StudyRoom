import { useEffect, useRef, useState } from "react";
import { usePrivateStorage } from "./privateStorage.js";
export function useWelcome(enabled: boolean) {
  const storage = usePrivateStorage();
  const [open, setOpen] = useState(() => {
    try {
      return (
        enabled &&
        !new URL(window.location.href).searchParams.has("room") &&
        storage.getItem("studyroom.welcome.seen") !== "1"
      );
    } catch {
      return enabled;
    }
  });
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
      dismissed.current = true;
      setOpen(false);
      setLeaving(false);
    };
    if (
      animate &&
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setLeaving(true);
      timer.current = setTimeout(finish, 1100);
    } else finish();
  }
  return {
    open,
    leaving,
    close,
    show() {
      clearTimeout(timer.current);
      setLeaving(false);
      setOpen(true);
    },
  };
}
export function WelcomeScene({
  leaving,
  onEnter,
  onSkip,
}: {
  leaving: boolean;
  onEnter: () => void;
  onSkip: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const sync = () => {
      if (dialog.current)
        dialog.current.dataset.hidden = String(document.hidden);
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
        onSkip();
      }}
    >
      <div className="welcome-petals" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <i
            key={i}
            style={{ left: `${8 + i * 12}%`, animationDelay: `${-i * 1.7}s` }}
          />
        ))}
      </div>
      <div className="welcome-copy">
        <p className="eyebrow">STUDY ROOM</p>
        <h1 id="welcome-heading">Welcome to your virtual study room.</h1>
        <p>A little space to slow down, focus, and grow.</p>
        <p id="welcome-note" className="quiet-note">
          Headphones recommended for the best experience
        </p>
        <div className="welcome-actions">
          <button
            className="primary"
            disabled={leaving}
            onClick={onEnter}
            autoFocus
          >
            Enter Study Room
          </button>
          <button onClick={onSkip}>Skip welcome</button>
        </div>
        <p className="quiet-note">
          Enter quietly. Sound is always your choice.
        </p>
      </div>
    </dialog>
  );
}
