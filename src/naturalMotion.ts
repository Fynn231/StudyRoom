import { useLayoutEffect, useRef, type RefObject } from "react";

// Stratified rows keep equal coverage on both sides, without synchronizing
// partners. Each body has its own bounded wind, fall acceleration and flutter;
// row-sized bounds prevent the field from collecting at one edge or bunching.
export const DECORATION_COUNT = 48;
function motionSeed(index: number) {
  const value = Math.sin((index + 1) * 127.1) * 43758.5453;
  return value - Math.floor(value);
}
export function decorationPose(
  index: number,
  time: number,
  width: number,
  height: number,
  gutter: number,
) {
  const pair = Math.floor(index / 2),
    side = index % 2;
  const size = 28 + (pair % 4) * 4;
  const scaledSize = width <= 600 ? size * 0.78 : size;
  // Even a narrow gutter retains a little horizontal wind. Opaque reading
  // surfaces stay above this decorative layer; nothing enters the centre lane.
  const field = Math.max(scaledSize + 32, Math.min(gutter, 240));
  const room = Math.max(0, field - scaledSize - 16);
  const seed = motionSeed(index),
    secondary = motionSeed(index + 71),
    phase = index * 2.399963;
  const lane = 0.18 + seed * 0.64;
  const sway =
    Math.sin(time * (0.13 + seed * 0.12) + phase) * 0.12 +
    Math.sin(time * (0.05 + secondary * 0.08) + phase * 1.3) * 0.07;
  const x = 8 + room * Math.max(0.04, Math.min(0.96, lane + sway));
  const cycle = height + 128,
    row = (pair * 11) % 24,
    spacing = cycle / 24;
  // Different, smooth instantaneous descent rates, bounded within each row.
  // The shared mean carries the whole field through the offscreen recycle zone
  // while independent phases avoid mirrored, conveyor-belt choreography.
  const fallOffset =
    Math.sin(time * (0.25 + seed * 0.3) + phase) * spacing * 0.065 +
    Math.sin(time * (0.06 + secondary * 0.07) + phase * 1.3) * spacing * 0.025;
  const progress = ((row + 0.5) / 24 + (time * 22 + fallOffset) / cycle) % 1;
  return {
    x: side ? width - scaledSize - x : x,
    y: progress * cycle - 64,
    size,
    tiltX: Math.sin(time * (0.24 + seed * 0.14) + phase) * 14,
    tiltY: Math.sin(time * (0.16 + secondary * 0.12) + phase) * 18,
    rotation: Math.sin(time * (0.12 + seed * 0.1) + phase) * 24 + Math.sin(phase) * 50,
  };
}
export function useNaturalMotion(
  ref: RefObject<HTMLDivElement | null>,
  moving: boolean,
  suspended = false,
) {
  const time = useRef(0);
  useLayoutEffect(() => {
    const layer = ref.current;
    if (!layer) return;
    const elements = [...layer.querySelectorAll<SVGElement>(":scope > svg.flower")];
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let raf = 0,
      previous: number | null = null,
      gutter = window.innerWidth * 0.14;
    function measure() {
      const shell = document.querySelector<HTMLElement>(".app-shell");
      if (shell)
        gutter =
          shell.getBoundingClientRect().left +
          parseFloat(window.getComputedStyle(shell).paddingLeft || "0");
      draw();
    }
    function draw() {
      elements.forEach((el, i) => {
        const p = decorationPose(i, time.current, window.innerWidth, window.innerHeight, gutter);
        el.style.transform = `translate3d(${p.x.toFixed(3)}px,${p.y.toFixed(3)}px,0) rotateX(${p.tiltX.toFixed(3)}deg) rotateY(${p.tiltY.toFixed(3)}deg) rotate(${p.rotation.toFixed(3)}deg)`;
      });
    }
    function active() {
      return moving && !suspended && !document.hidden && !media?.matches;
    }
    function loop(now: number) {
      raf = 0;
      if (!active()) return;
      if (previous !== null) time.current += Math.min((now - previous) / 1000, 0.05);
      previous = now;
      draw();
      raf = window.requestAnimationFrame(loop);
    }
    function sync() {
      window.cancelAnimationFrame?.(raf);
      raf = 0;
      previous = null;
      layer!.dataset.paused = String(document.hidden || suspended);
      layer!.dataset.reduced = String(!!media?.matches);
      layer!.dataset.running = String(active());
      if (active() && window.requestAnimationFrame) raf = window.requestAnimationFrame(loop);
    }
    measure();
    sync();
    document.addEventListener("visibilitychange", sync);
    media?.addEventListener("change", sync);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame?.(raf);
      document.removeEventListener("visibilitychange", sync);
      media?.removeEventListener("change", sync);
      window.removeEventListener("resize", measure);
    };
  }, [ref, moving, suspended]);
}
