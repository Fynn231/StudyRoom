import { useEffect, useRef } from "react";

// One cancellable navigation owner: opening a panel never races later input.
export function useToolNavigation() {
  const cleanup = useRef<() => void>(() => {});
  useEffect(() => () => cleanup.current(), []);
  return (selector: string) => {
    cleanup.current();
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) return;
    const ancestors: HTMLDetailsElement[] = [];
    for (let node: HTMLElement | null = target; node; node = node.parentElement)
      if (node.tagName === "DETAILS") ancestors.unshift(node as HTMLDetailsElement);
    ancestors.forEach((node) => {
      node.open = true;
    });
    const focus =
      target.tagName === "DETAILS" ? target.querySelector<HTMLElement>("summary") : target;
    if (!focus) return;
    let frame = 0;
    let cancelled = false;
    let scrolling = false;
    const events = ["pointerdown", "wheel", "touchstart", "keydown", "visibilitychange"] as const;
    const cancel = () => {
      if (cancelled) return;
      cancelled = true;
      window.cancelAnimationFrame?.(frame);
      events.forEach((event) => document.removeEventListener(event, cancel, true));
      if (scrolling) {
        scrolling = false;
        // Cancelling RAF alone leaves the browser's smooth scroll running.
        window.scrollTo({ top: window.scrollY, left: window.scrollX, behavior: "instant" });
      }
    };
    cleanup.current = cancel;
    const finish = () => {
      if (cancelled || !focus.isConnected || document.hidden) return;
      cancel();
      if (!focus.matches("input,textarea,select,button,a[href],summary,[tabindex]"))
        focus.tabIndex = -1;
      focus.classList.add("tool-navigation-focus");
      focus.addEventListener("blur", () => focus.classList.remove("tool-navigation-focus"), {
        once: true,
      });
      focus.focus({ preventScroll: true });
      if (focus.dataset.guideActivate === "true") focus.click();
    };
    if (
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      !window.requestAnimationFrame
    ) {
      target.scrollIntoView?.({ block: "start", behavior: "instant" });
      finish();
      return;
    }
    events.forEach((event) => document.addEventListener(event, cancel, true));
    // A frame lets every newly opened ancestor lay out before scroll measurement.
    frame = window.requestAnimationFrame((start) => {
      if (cancelled) return;
      scrolling = true;
      target.scrollIntoView?.({ block: "start", behavior: "smooth" });
      let last = window.scrollY,
        stable = 0;
      const settle = (now: number) => {
        if (cancelled) return;
        stable = Math.abs(window.scrollY - last) < 0.5 ? stable + 1 : 0;
        last = window.scrollY;
        if ((now - start > 180 && stable >= 4) || now - start > 2200) finish();
        else frame = window.requestAnimationFrame(settle);
      };
      frame = window.requestAnimationFrame(settle);
    });
  };
}
