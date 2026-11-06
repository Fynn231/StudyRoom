import { useLayoutEffect, useRef, type RefObject } from "react";
import {
  createWindField,
  stepWindField,
  windPose,
  type SceneryKind,
  type WindField,
} from "./openScenery.js";

export const DECORATION_COUNT = 48;
export function useNaturalMotion(
  ref: RefObject<HTMLDivElement | null>,
  moving: boolean,
  suspended = false,
  kind: SceneryKind = "moon",
) {
  // Each mounted owner retains positions and momentum across motion, visibility,
  // Focus and preset toggles. Layout changes never assign a new path.
  const fields = useRef(new Map<SceneryKind, WindField>());
  useLayoutEffect(() => {
    const layer = ref.current;
    if (!layer) return;
    const elements = [
      ...layer.querySelectorAll<SVGElement | HTMLElement>(
        kind === "welcome" ? ":scope > i" : ":scope > svg.flower",
      ),
    ];
    let field = fields.current.get(kind);
    if (!field || field.bodies.length !== elements.length) {
      field = createWindField(elements.length, kind);
      fields.current.set(kind, field);
    }
    const state = field;
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let raf = 0,
      previous: number | null = null;
    function draw() {
      elements.forEach((el, i) => {
        const p = windPose(state, i, window.innerWidth, window.innerHeight);
        if (kind === "leaves") {
          el.style.width = `${p.size.toFixed(3)}px`;
          el.style.height = `${p.size.toFixed(3)}px`;
          el.style.translate = "none";
        }
        if (kind === "welcome") {
          el.style.transform = `translate3d(${p.x.toFixed(3)}px,${p.y.toFixed(3)}px,0)`;
          const face = el.firstElementChild as HTMLElement | null;
          if (face)
            face.style.transform = `rotateX(${p.tiltX.toFixed(3)}deg) rotateY(${p.tiltY.toFixed(3)}deg) rotate(${p.rotation.toFixed(3)}deg)`;
        } else
          el.style.transform = `translate3d(${p.x.toFixed(3)}px,${p.y.toFixed(3)}px,0) rotateX(${p.tiltX.toFixed(3)}deg) rotateY(${p.tiltY.toFixed(3)}deg) rotate(${p.rotation.toFixed(3)}deg)`;
      });
    }
    function active() {
      return moving && !suspended && !document.hidden && !media?.matches;
    }
    function loop(now: number) {
      raf = 0;
      if (!active()) return;
      if (previous !== null)
        stepWindField(state, (now - previous) / 1000, window.innerWidth, window.innerHeight);
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
    draw();
    sync();
    document.addEventListener("visibilitychange", sync);
    media?.addEventListener("change", sync);
    window.addEventListener("resize", draw);
    return () => {
      window.cancelAnimationFrame?.(raf);
      document.removeEventListener("visibilitychange", sync);
      media?.removeEventListener("change", sync);
      window.removeEventListener("resize", draw);
      if (kind === "leaves")
        elements.forEach((el) => {
          el.style.removeProperty("width");
          el.style.removeProperty("height");
          el.style.removeProperty("translate");
        });
    };
  }, [ref, moving, suspended, kind]);
}

// The reference's curved oval mesh: narrow root, broad shoulders, curled rim.
// Bake depth-sorted Lambert-shaded faces once; compositor motion preserves the
// dimensional shading without thousands of SVG path mutations every frame.
export function cuppedPetalFaces(index: number) {
  const a = 0.55 + Math.sin(index * 1.7) * 0.6,
    b = Math.cos(index * 0.8) * 0.7;
  const rotate = ([x, y, z]: number[]) => {
    const yy = y * Math.cos(a) - z * Math.sin(a),
      zz = y * Math.sin(a) + z * Math.cos(a);
    return [x * Math.cos(b) + zz * Math.sin(b), yy, -x * Math.sin(b) + zz * Math.cos(b)];
  };
  const faces: { d: string; color: string; depth: number }[] = [];
  for (let k = 0; k < 5; k++)
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 4; j++) {
        const angle = (k * Math.PI * 2) / 5;
        const p = [
          [i / 8, j / 4],
          [(i + 1) / 8, j / 4],
          [(i + 1) / 8, (j + 1) / 4],
          [i / 8, (j + 1) / 4],
        ].map(([u, v]) => {
          const side = v * 2 - 1,
            r = 0.1 + u * 0.94,
            w = Math.pow(Math.sin(Math.PI * u), 0.51) * 0.39 * side;
          return rotate([
            Math.cos(angle) * r - Math.sin(angle) * w,
            Math.sin(angle) * r + Math.cos(angle) * w,
            0.5 * u * u + 0.17 * side * side * Math.sin(Math.PI * u) - 0.04,
          ]);
        });
        const e = p[1].map((v, n) => v - p[0][n]),
          f = p[3].map((v, n) => v - p[0][n]);
        const n = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]];
        const lighting = (n[0] * -0.34 + n[1] * -0.48 + n[2] * 0.8) / (Math.hypot(...n) || 1);
        const back = n[2] < 0;
        const light =
          (back ? 0.82 + Math.abs(lighting) * 0.11 : 0.84 + Math.max(0, lighting) * 0.16) -
          0.07 * (1 - (i + 0.5) / 8);
        const color = `rgb(${(back ? [242, 230, 193] : [255, 249, 225]).map((v) => Math.round(v * light)).join(",")})`;
        faces.push({
          d:
            p
              .map(([x, y, z], i) => {
                const q = 3.7 / (3.7 - z);
                return `${i ? "L" : "M"}${(x * q).toFixed(3)},${(y * q).toFixed(3)}`;
              })
              .join("") + "Z",
          color,
          depth: p.reduce((s, p) => s + p[2], 0) / 4,
        });
      }
  return faces.sort((a, b) => a.depth - b.depth);
}
