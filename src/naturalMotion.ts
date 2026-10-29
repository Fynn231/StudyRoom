import { useLayoutEffect, useRef, type RefObject } from 'react';

// Paired, stratified lanes keep equal visual weight on both sides at every
// frame. Wind is bounded inside each lane; it cannot collect an entire field
// against one edge. Every row keeps its own continuous, gentle sway.
export const DECORATION_COUNT = 48;
export function decorationPose(index: number, time: number, width: number, height: number, gutter: number) {
  const pair = Math.floor(index / 2), side = index % 2;
  const size = 28 + (pair % 4) * 4;
  const scaledSize = width <= 600 ? size * .78 : size;
  const field = Math.max(scaledSize + 12, Math.min(gutter, 240));
  const room = Math.max(0, field - scaledSize - 16);
  const lane = pair % 2 ? .72 : .28;
  const phase = pair * 2.399963;
  const sway = Math.sin(time * .19 + phase) * .12 + Math.sin(time * .071 + phase * 1.3) * .07;
  const x = 8 + room * Math.max(.04, Math.min(.96, lane + sway));
  const cycle = height + 128, row = (pair * 11) % 24;
  const progress = ((row + .5) / 24 + time * 22 / cycle) % 1;
  const y = progress * cycle - 64 + Math.sin(time * .23 + phase) * (cycle / 24) * .1;
  return { x: side ? width - scaledSize - x : x, y, size,
    tiltX: Math.sin(time * .31 + phase) * 14,
    tiltY: Math.sin(time * .21 + phase) * 18 * (side ? -1 : 1),
    rotation: (Math.sin(time * .17 + phase) * 24 + Math.sin(phase) * 50) * (side ? -1 : 1) };
}
export function useNaturalMotion(ref: RefObject<HTMLDivElement | null>, moving: boolean, suspended = false) {
  const time = useRef(0);
  useLayoutEffect(() => {
    const layer = ref.current;
    if (!layer) return;
    const elements = [...layer.querySelectorAll<SVGElement>(':scope > svg.flower')];
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let raf = 0, previous: number | null = null, gutter = window.innerWidth * .14;
    function measure() {
      const shell = document.querySelector<HTMLElement>('.app-shell');
      if (shell) gutter = shell.getBoundingClientRect().left + parseFloat(window.getComputedStyle(shell).paddingLeft || '0');
      draw();
    }
    function draw() {
      elements.forEach((el, i) => {
        const p = decorationPose(i, time.current, window.innerWidth, window.innerHeight, gutter);
        el.style.transform = `translate3d(${p.x.toFixed(3)}px,${p.y.toFixed(3)}px,0) rotateX(${p.tiltX.toFixed(3)}deg) rotateY(${p.tiltY.toFixed(3)}deg) rotate(${p.rotation.toFixed(3)}deg)`;
      });
    }
    function active() { return moving && !suspended && !document.hidden && !media?.matches; }
    function loop(now: number) {
      raf = 0; if (!active()) return;
      if (previous !== null) time.current += Math.min((now - previous) / 1000, .05);
      previous = now; draw(); raf = window.requestAnimationFrame(loop);
    }
    function sync() {
      window.cancelAnimationFrame?.(raf); raf = 0; previous = null;
      layer!.dataset.paused = String(document.hidden || suspended);
      layer!.dataset.reduced = String(!!media?.matches);
      layer!.dataset.running = String(active());
      if (active() && window.requestAnimationFrame) raf = window.requestAnimationFrame(loop);
    }
    measure(); sync();
    document.addEventListener('visibilitychange', sync); media?.addEventListener('change', sync); window.addEventListener('resize', measure);
    return () => { window.cancelAnimationFrame?.(raf); document.removeEventListener('visibilitychange', sync); media?.removeEventListener('change', sync); window.removeEventListener('resize', measure); };
  }, [ref, moving, suspended]);
}
