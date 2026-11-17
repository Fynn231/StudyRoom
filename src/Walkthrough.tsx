import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { WorkspaceView } from "./WorkspaceNavigation.js";
const steps: { view: WorkspaceView; title: string; text: string }[] = [
  {
    view: "study",
    title: "Make a little time.",
    text: "Use the actual Focus length below. Add your private session intention if you like. Neither starts the timer. You can leave every field unchanged.",
  },
  {
    view: "plan",
    title: "Prepare only what you need.",
    text: "An intention checklist, imported notes and a deadline schedule serve different needs. Review any AI input and result. No request or import happens in this walkthrough.",
  },
  {
    view: "music",
    title: "Choose your sound, or silence.",
    text: "Original ambience, official embeds and optional account playback are separate. Playback and listening-status sharing each need your choice.",
  },
  {
    view: "together",
    title: "Company is optional.",
    text: "Party opens the lobby; your name and an explicit Join create membership. Choose the shared cycle separately. Visiting never joins or shares.",
  },
  {
    view: "progress",
    title: "Keep your own record.",
    text: "Completed cycles are recorded once. Rating is optional. Your device history and reflections are private, not room messages.",
  },
  {
    view: "study",
    title: "Ready when you are.",
    text: "Your real setup is still here. Finish the walkthrough, then choose Start focus yourself. Guide is always available if you want another look.",
  },
];
export function Walkthrough({ navigate }: { navigate: (view: WorkspaceView) => void }) {
  const [step, setStep] = useState<number | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  function close(finish = false) {
    flushSync(() => setStep(null));
    if (finish) navigate("study");
    else {
      const target = returnFocus.current;
      if (target?.isConnected && !target.closest("[hidden],[inert]")) target.focus();
      else {
        const heading = Array.from(
          document.querySelectorAll<HTMLElement>("[data-page-heading]"),
        ).find((node) => !node.closest("[hidden],[inert]"));
        if (heading) {
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
        }
      }
    }
  }
  function start() {
    returnFocus.current = document.activeElement as HTMLElement;
    setStep(0);
    navigate("study");
  }
  return (
    <>
      {step === null ? (
        <button className="walkthrough-start" onClick={start}>
          Start walkthrough
        </button>
      ) : (
        <aside
          className="walkthrough-panel"
          aria-label="Site walkthrough"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
        >
          <div>
            <p className="eyebrow">
              WALKTHROUGH · {step + 1} / {steps.length}
            </p>
            <h2>{steps[step].title}</h2>
            <p>{steps[step].text}</p>
          </div>
          <div className="walkthrough-actions">
            <button onClick={() => close()}>Skip walkthrough</button>
            <button onClick={() => close()}>Close walkthrough</button>
            {step > 0 && (
              <button
                onClick={() => {
                  setStep(step - 1);
                  navigate(steps[step - 1].view);
                }}
              >
                Previous step
              </button>
            )}
            {step < steps.length - 1 ? (
              <button
                className="primary"
                onClick={() => {
                  setStep(step + 1);
                  navigate(steps[step + 1].view);
                }}
              >
                Next step
              </button>
            ) : (
              <button className="primary" onClick={() => close(true)}>
                Finish walkthrough
              </button>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
