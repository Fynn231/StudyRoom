import { useEffect, useRef, type RefObject } from 'react';

// Continuous force field from the approved Juliette study. Only transforms are
// written per frame: the shaded cupped meshes are authored once, not repainted.
export function useNaturalMotion(ref: RefObject<HTMLDivElement | null>, moving: boolean, suspended = false) {
  const state = useRef({ time: 0, bodies: Array.from({ length: 24 }, (_, i) => ({
    x: ((i * 37 + 3) % 100) / 100, y: ((i * 29 + 3) % 100) / 100,
    vx: 0, vy: .028 + (i % 5) * .004, a: (i * 1.71) % 6.28, b: i * .47, c: i * .81,
    wa: 0, wb: 0, wc: 0, phase: i * 1.37,
  })) });
  useEffect(() => {
    const layer = ref.current;
    if (!layer) return;
    const elements = [...layer.querySelectorAll<SVGElement>('svg')];
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let raf = 0, previous: number | null = null;
    function draw() {
      const w = window.innerWidth, h = window.innerHeight;
      state.current.bodies.forEach((b, i) => {
        const el = elements[i];
        if (!el) return;
        el.style.transform = `translate3d(${(b.x * w).toFixed(3)}px,${(b.y * h).toFixed(3)}px,0) rotateX(${(Math.sin(b.a) * 36).toFixed(3)}deg) rotateY(${(Math.sin(b.b) * 42).toFixed(3)}deg) rotate(${(b.c * 180 / Math.PI).toFixed(3)}deg)`;
      });
    }
    function step(dt: number) {
      state.current.time += dt;
      const t = state.current.time;
      for (const b of state.current.bodies) {
        const fx = Math.sin(b.y * 4.3 + t * .31) * .05 + Math.cos(b.x * 3.7 - b.y * 2.1 + t * .19) * .037 + Math.sin(t * .47) * .026;
        const fy = Math.cos(b.x * 4.6 + b.y * 2 + t * .26) * .10;
        const drag = 1.25 + .7 * Math.abs(Math.cos(b.a) * Math.cos(b.b));
        b.vx += (fx - b.vx) * dt * .8;
        b.vy += (.081 + fy - b.vy * drag) * dt * .6;
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.wa += (fx * 4 + .13 * Math.sin(t * .67 + b.phase) - b.wa * .5) * dt;
        b.wb += (fy * 4 + .11 * Math.cos(t * .51 + b.phase) - b.wb * .5) * dt;
        b.wc += (fx * 2 + .1 * Math.sin(b.y * 9 + b.phase) - b.wc * .7) * dt;
        b.a += b.wa * dt; b.b += b.wb * dt; b.c += b.wc * dt;
        // Wrap only beyond the viewport; no visible path resets or reversals.
        if (b.y > 1.22) { b.y = -.22; b.x = (Math.sin(b.phase + t) + 1) / 2; b.vy = .035; }
        if (b.x > 1.25) b.x = -.25;
        if (b.x < -.25) b.x = 1.25;
      }
    }
    function active() { return moving && !suspended && !document.hidden && !media?.matches; }
    function loop(now: number) {
      raf = 0;
      if (!active()) return;
      const dt = previous === null ? 0 : Math.min((now - previous) / 1000, .05);
      previous = now;
      // Bounded integration is independent of monitor refresh rate.
      let left = dt;
      while (left > 0) { const delta = Math.min(left, 1 / 60); step(delta); left -= delta; }
      draw();
      raf = window.requestAnimationFrame(loop);
    }
    function sync() {
      window.cancelAnimationFrame?.(raf); raf = 0; previous = null;
      layer!.dataset.paused = String(document.hidden || suspended);
      layer!.dataset.reduced = String(!!media?.matches);
      layer!.dataset.running = String(active());
      if (active() && window.requestAnimationFrame) raf = window.requestAnimationFrame(loop);
    }
    draw(); sync();
    document.addEventListener('visibilitychange', sync);
    media?.addEventListener('change', sync);
    window.addEventListener('resize', draw);
    return () => {
      window.cancelAnimationFrame?.(raf);
      document.removeEventListener('visibilitychange', sync);
      media?.removeEventListener('change', sync);
      window.removeEventListener('resize', draw);
    };
  }, [ref, moving, suspended]);
}

// The reference's curved oval mesh: narrow root, broad shoulders, curled rim.
// Bake depth-sorted Lambert-shaded faces once; compositor motion preserves the
// dimensional shading without thousands of SVG path mutations every frame.
export function cuppedPetalFaces(index: number) {
  const a = .55 + Math.sin(index * 1.7) * .6, b = Math.cos(index * .8) * .7;
  const rotate = ([x, y, z]: number[]) => {
    const yy = y * Math.cos(a) - z * Math.sin(a), zz = y * Math.sin(a) + z * Math.cos(a);
    return [x * Math.cos(b) + zz * Math.sin(b), yy, -x * Math.sin(b) + zz * Math.cos(b)];
  };
  const faces: { d: string; color: string; depth: number }[] = [];
  for (let k = 0; k < 5; k++) for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
    const angle = k * Math.PI * 2 / 5;
    const p = [[i / 8, j / 4], [(i + 1) / 8, j / 4], [(i + 1) / 8, (j + 1) / 4], [i / 8, (j + 1) / 4]].map(([u, v]) => {
      const side = v * 2 - 1, r = .10 + u * .94, w = Math.pow(Math.sin(Math.PI * u), .51) * .39 * side;
      return rotate([Math.cos(angle) * r - Math.sin(angle) * w, Math.sin(angle) * r + Math.cos(angle) * w, .5 * u * u + .17 * side * side * Math.sin(Math.PI * u) - .04]);
    });
    const e = p[1].map((v, n) => v - p[0][n]), f = p[3].map((v, n) => v - p[0][n]);
    const n = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]];
    const lighting = (n[0] * -.34 + n[1] * -.48 + n[2] * .8) / (Math.hypot(...n) || 1);
    const back = n[2] < 0;
    const light = (back ? .82 + Math.abs(lighting) * .11 : .84 + Math.max(0, lighting) * .16) - .07 * (1 - (i + .5) / 8);
    const color = `rgb(${(back ? [242, 230, 193] : [255, 249, 225]).map(v => Math.round(v * light)).join(',')})`;
    faces.push({ d: p.map(([x, y, z], i) => { const q = 3.7 / (3.7 - z); return `${i ? 'L' : 'M'}${(x * q).toFixed(3)},${(y * q).toFixed(3)}`; }).join('') + 'Z', color, depth: p.reduce((s, p) => s + p[2], 0) / 4 });
  }
  return faces.sort((a, b) => a.depth - b.depth);
}
