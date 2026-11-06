import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useOptionalAuth } from "./auth.js";
import { useToolNavigation } from "./useToolNavigation.js";

// The existing editor stays mounted here: opening/closing never creates a draft owner.
export function ProfileAccess({ children }: { children: ReactNode }) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const auth = useOptionalAuth();
  const navigate = useToolNavigation();
  useLayoutEffect(() => {
    const isolateEscape = (event: KeyboardEvent) => {
      // A nonmodal popover can stay open while focus moves back to its trigger.
      // Keep native dismissal, but do not pass that same Escape to mode handlers.
      if (event.key === "Escape" && panel.current?.matches(":popover-open"))
        event.stopPropagation();
    };
    document.addEventListener("keydown", isolateEscape, true);
    return () => document.removeEventListener("keydown", isolateEscape, true);
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    const editor = panel.current?.querySelector<HTMLDetailsElement>(".study-profile");
    if (editor) editor.open = true;
    panel.current
      ?.querySelector<HTMLInputElement>(".study-profile input")
      ?.focus({ preventScroll: true });
  }, [open]);
  return (
    <>
      <button
        className="profile-account-button"
        type="button"
        aria-label="Profile and account"
        aria-expanded={open}
        aria-controls={id}
        popoverTarget={id}
        data-guide-activate="true"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M4 21v-2a8 8 0 0 1 16 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span>Profile</span>
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        className="profile-account-panel"
        role={open ? "dialog" : undefined}
        aria-hidden={!open}
        aria-label="Profile and account"
        onToggle={(event) => {
          if (event.target !== event.currentTarget) return;
          setOpen(event.newState === "open");
          if (event.newState === "closed") {
            // Preserve the editor/draft, but let the next open refresh its progress.
            const editor = panel.current?.querySelector<HTMLDetailsElement>(".study-profile");
            if (editor) editor.open = false;
          }
        }}
      >
        <div className="profile-panel-heading">
          <h2>Profile &amp; account</h2>
          <button
            type="button"
            popoverTarget={id}
            popoverTargetAction="hide"
            aria-label="Close profile and account"
          >
            Close
          </button>
        </div>
        <p className="quiet-note">
          {auth?.config?.required
            ? "Signed in · Your account and device profile stay private until you explicitly share."
            : "Local demo · No account is signed in. This profile is private on this device."}
        </p>
        {auth?.config?.required && (
          <button
            type="button"
            onClick={() => {
              panel.current?.hidePopover();
              navigate(".auth-status button");
            }}
          >
            Account sign-out options
          </button>
        )}
        {children}
      </div>
    </>
  );
}
