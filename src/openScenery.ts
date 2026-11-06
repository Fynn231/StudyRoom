// Stateful curl wind, projected into equally populated exposed side spaces.
// Side balance is deliberate; flutter, velocity and depth remain independent.
export type SceneryKind = "flowers" | "leaves" | "moon" | "welcome";
export type WindBody = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  b: number;
  rotation: number;
  spin: number;
  phase: number;
};
export type WindField = { time: number; bodies: WindBody[]; kind: SceneryKind };
export function windSeed(i: number, salt = 0) {
  const n = Math.sin((i + 1) * 127.1 + salt * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
export function createWindField(count: number, kind: SceneryKind = "flowers"): WindField {
  const bodies: WindBody[] = [];
  // Deterministic best-candidate sampling gives perceptually even coverage
  // without a grid or mirrored partners. Toroidal distance includes the seam.
  for (let i = 0; i < count; i++) {
    let x = 0,
      y = 0,
      best = -1;
    for (let c = 0; c < 64; c++) {
      const px = 0.025 + windSeed(i * 64 + c, 1) * 0.95,
        py = 0.025 + windSeed(i * 64 + c, 2) * 0.95;
      const score = bodies.reduce((d, b) => {
        const dx = Math.min(Math.abs(px - b.x), 1 - Math.abs(px - b.x));
        const dy = Math.min(Math.abs(py - b.y), 1 - Math.abs(py - b.y));
        return Math.min(d, dx * dx + dy * dy);
      }, 1);
      if (score > best) {
        best = score;
        x = px;
        y = py;
      }
    }
    const phase = windSeed(i, 3) * Math.PI * 2;
    bodies.push({
      x,
      y,
      vx: 0.022 * Math.sin(y * Math.PI * 2),
      vy: 0.018 + 0.012 * Math.cos(x * Math.PI * 2),
      a: phase,
      b: phase * 0.7,
      rotation: windSeed(i, 4) * 360,
      spin: 0,
      phase,
    });
  }
  // Interleave the two populations vertically, without matching positions or poses.
  bodies.sort((a, b) => a.y - b.y);
  return { time: 0, bodies, kind };
}
// The offscreen buffer is an artwork envelope, not an invisible holding lane.
// A fixed 80px buffer occupies nearly half a phone's extended field and can
// strand most of the population outside during a long session.
export function windMargin(kind: SceneryKind, width: number) {
  if (kind === "welcome") return (38 * Math.hypot(1, 1.6)) / 2 + 6;
  if (kind === "leaves") return (width <= 600 ? 44 : 52) * Math.SQRT1_2 + 6;
  const base = kind === "flowers" ? 63 : 40;
  const scale = width <= 600 ? 0.78 : width >= 1400 ? 1.5 : 1;
  // Include the existing wide-screen CSS translate, which remains CSS-owned.
  return base * scale * Math.SQRT1_2 + (width >= 1400 ? base * 0.25 : 0) + 6;
}
export function stepWindField(field: WindField, elapsed: number, width: number, height: number) {
  // Clamp stalls and substep independently of display refresh. Lifecycle owner
  // discards hidden time entirely; this also bounds callers outside the browser.
  let left = Math.max(0, Math.min(elapsed, 0.05));
  const margin = windMargin(field.kind, width),
    my = margin / Math.max(1, height);
  while (left > 1e-9) {
    const dt = Math.min(left, 1 / 120);
    left -= dt;
    field.time += dt;
    const t = field.time,
      bodies = field.bodies;
    const spacing = 0.72 / Math.sqrt(bodies.length);
    const forces = bodies.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < bodies.length; i++)
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i],
          b = bodies[j];
        // Normalized neighbour pressure is gentle and symmetric. It has no
        // preferred position; bodies can cross every part of the viewport.
        let dx = a.x - b.x,
          dy = a.y - b.y;
        dx -= Math.round(dx);
        dy -= Math.round(dy);
        const verticalGap = 1.3 / Math.ceil(bodies.length / 2);
        if (i % 2 === j % 2 && Math.abs(dy) < verticalGap) {
          // Screen projection compresses x, so also space neighbours by their
          // exposed vertical distance. Equal-and-opposite pressure, no rows.
          const pressure = Math.sign(dy) * 0.12 * (1 - Math.abs(dy) / verticalGap);
          forces[i].y += pressure;
          forces[j].y -= pressure;
        }
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < spacing) {
          const f = 0.025 * (1 - d / spacing);
          forces[i].x += (dx / d) * f;
          forces[i].y += (dy / d) * f;
          forces[j].x -= (dx / d) * f;
          forces[j].y -= (dy / d) * f;
        }
      }
    bodies.forEach((b, i) => {
      const X = b.x * Math.PI * 2,
        Y = b.y * Math.PI * 2;
      // Two spatial curl scales and a slowly veering gust. Spatial derivatives
      // cancel (divergence-free base), avoiding a compressive sink/clump field.
      const curl = Math.cos(X - Y + t * 0.19);
      const speed = field.kind === "moon" ? 0.62 : field.kind === "welcome" ? 1.1 : 1;
      const wx =
        (0.034 * Math.sin(Y + t * 0.23) + 0.025 * curl + 0.014 * Math.sin(t * 0.31)) * speed;
      const wy = (0.018 + 0.006 * Math.cos(X - t * 0.17) + 0.006 * curl) * speed;
      const drag = 0.9 + 0.24 * Math.cos(b.a) * Math.cos(b.b);
      b.vx += (wx + forces[i].x - b.vx) * drag * dt;
      b.vy += (wy + forces[i].y - b.vy) * drag * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.a += (0.42 + wx * 5 + 0.16 * Math.sin(t * 0.71 + b.phase)) * dt;
      b.b += (0.31 + wy * 4 + 0.18 * Math.cos(t * 0.57 + b.phase)) * dt;
      b.spin += (wx * 180 + Math.sin(t * 0.63 + b.phase) * 11 - b.spin) * dt * 0.7;
      b.rotation += b.spin * dt;
      // Recycle only beyond the complete rotated artwork envelope, preserving
      // momentum and the other coordinate. This is not a per-body motion box.
      // x is a periodic wind coordinate. Projection is periodic too, so this
      // seam is continuous onscreen rather than a teleport across a gutter.
      if (b.x > 1) b.x -= 1;
      if (b.x < 0) b.x += 1;
      if (b.y > 1 + my) b.y = -my;
      if (b.y < -my) b.y = 1 + my;
    });
  }
}
export function windPose(field: WindField, index: number, width: number, height: number) {
  const b = field.bodies[index];
  const size =
    field.kind === "leaves"
      ? (width <= 600 ? 32 : 38) + windSeed(index) * (width <= 600 ? 12 : 14)
      : field.kind === "welcome"
        ? 26 + windSeed(index) * 12
        : field.kind === "flowers"
          ? 42 + (Math.floor(index / 2) % 4) * 7
          : 28 + (Math.floor(index / 2) % 4) * 4;
  const scaled =
    field.kind === "flowers" || field.kind === "moon"
      ? size * (width <= 600 ? 0.78 : width >= 1400 ? 1.5 : 1)
      : size;
  const padding = width <= 480 ? 24 : width <= 760 ? 18 : width <= 1050 ? 28 : 48;
  const exposed = Math.max(24, (width - Math.min(width, 1280)) / 2 + padding);
  // Keep native-sized artwork, including partial natural occlusion by cards.
  // A periodic projection retains momentum at the virtual x seam, and gives
  // wide drifting arcs across each side instead of rigid paired tracks.
  const span = field.kind === "welcome" ? Math.min(width * 0.22, 220) : exposed + 8;
  const inset = 4 + (span - 4) * (0.5 + 0.5 * Math.sin(b.x * Math.PI * 2));
  const cssOffset =
    (field.kind === "flowers" || field.kind === "moon") && width >= 1400 ? size * 0.25 : 0;
  return {
    x: (index % 2 ? width - inset : inset) - scaled / 2 + cssOffset,
    y: b.y * height - (scaled * (field.kind === "welcome" ? 1.6 : 1)) / 2 + cssOffset,
    size,
    tiltX: Math.sin(b.a) * 24,
    tiltY: Math.sin(b.b) * 30,
    rotation: b.rotation,
  };
}
