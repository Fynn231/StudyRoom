import { useEffect, useRef } from "react";

// Uneven shores and perspective depths, not a mirrored particle field.
const SOURCES = [
  [9, 23, 190, 31, 0.06],
  [88, 35, 250, 48, 0.42],
  [18, 65, 330, 81, 0.71],
  [91, 83, 420, 125, 0.23],
  [49, 95, 510, 145, 0.57],
] as const;
const WAVES = SOURCES.flatMap(([x, y, width, height, phase]) =>
  [0, 1, 2].map((ring) => ({ x, y, width, height, phase: (phase + ring / 3) % 1 })),
);

export function WaterRipples({
  moving = true,
  suspended = false,
}: {
  moving?: boolean;
  suspended?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const elapsed = useRef(0);
  useEffect(() => {
    const layer = root.current;
    if (!layer) return;
    const waves = [...layer.querySelectorAll<SVGSVGElement>("svg")];
    const paint = () => {
      waves.forEach((wave, i) => {
        const phase = (elapsed.current / 19000 + WAVES[i].phase) % 1;
        const scale = 0.3 + phase * 1.25;
        wave.style.transform = `translate(-50%, -50%) scale(${scale})`;
        wave.style.opacity = String(Math.sin(Math.PI * phase) * 0.58);
      });
    };
    paint();
    let frame = 0;
    let last: number | null = null;
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const tick = (time: number) => {
      if (last !== null) elapsed.current += Math.min(64, Math.max(0, time - last));
      last = time;
      paint();
      frame = window.requestAnimationFrame(tick);
    };
    const sync = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      last = null;
      const running =
        moving &&
        !suspended &&
        !document.hidden &&
        !media?.matches &&
        !!window.requestAnimationFrame;
      layer.dataset.running = String(running);
      if (running) frame = window.requestAnimationFrame(tick);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    media?.addEventListener("change", sync);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", sync);
      media?.removeEventListener("change", sync);
      layer.dataset.running = "false";
    };
  }, [moving, suspended]);

  return (
    <div ref={root} className="water-ripples" aria-hidden="true">
      {WAVES.map((wave, i) => (
        <svg
          key={i}
          className="water-wave"
          viewBox="-260 -90 520 180"
          style={{
            left: `${wave.x}%`,
            top: `${wave.y}%`,
            width: `max(${wave.width}px, ${wave.width / 11}vw)`,
            height: `${wave.height}px`,
          }}
        >
          <ellipse className="water-trough" cx="0" cy="2.5" rx="248" ry="74" />
          <ellipse className="water-crest" cx="0" cy="0" rx="248" ry="74" />
          <path
            className="water-glint"
            d="M -225,-31 C -182,-76 -39,-88 78,-70 M 148,59 C 194,48 226,33 242,15"
          />
          <ellipse className="water-inner" cx="0" cy="-1" rx="229" ry="67" />
        </svg>
      ))}
    </div>
  );
}
