import { useEffect, useState } from "react";

/** Local presentation only: no timer mutations or operating-system permissions. */
export function useFocusView() {
  const [focusView, setFocusView] = useState(false);
  const [fullscreenMessage, setFullscreenMessage] = useState("");

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setFullscreenMessage("");
    } catch {
      // iPhone/browser restrictions must never prevent the ordinary focus view.
      setFullscreenMessage("Fullscreen is unavailable. Focus view still works.");
    }
  }

  useEffect(() => {
    const leave = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocusView(false);
    };
    window.addEventListener("keydown", leave);
    return () => window.removeEventListener("keydown", leave);
  }, []);

  return { focusView, setFocusView, fullscreenMessage, toggleFullscreen };
}
