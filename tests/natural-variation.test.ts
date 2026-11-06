import { test } from "node:test";
import assert from "node:assert/strict";
import { createWindField, stepWindField, windPose } from "../src/openScenery.js";

test("wind has independent velocities, changing curl and no visible recycle jumps", () => {
  for (const [w, h] of [
    [1600, 1000],
    [1366, 900],
    [390, 667],
  ]) {
    const field = createWindField(48);
    let rising = 0,
      turns = 0;
    for (let f = 0; f < 3600; f++) {
      const before = field.bodies.map((b) => ({ ...b }));
      const poses = field.bodies.map((_, i) => windPose(field, i, w, h));
      stepWindField(field, 1 / 60, w, h);
      field.bodies.forEach((b, i) => {
        const a = before[i],
          dx = Math.abs(b.x - a.x),
          dy = Math.abs(b.y - a.y);
        // Test the complete rotated responsive SVG envelope, not an arbitrary
        // 80px reservoir. The 1-frame step must hide both sides of a recycle.
        const size = (42 + (Math.floor(i / 2) % 4) * 7) * (w <= 600 ? 0.78 : w >= 1400 ? 1.5 : 1);
        const radius = size * Math.SQRT1_2;
        const shift = w >= 1400 ? (42 + (Math.floor(i / 2) % 4) * 7) * 0.25 : 0;
        const outside = (v: number, limit: number) => v + radius < 0 || v - radius > limit;
        // x is now a periodic wind coordinate projected into exposed sides.
        // Its seam must be smooth ONSCREEN, not outside the virtual field.
        const pose = windPose(field, i, w, h);
        assert.ok(Math.abs(pose.x - poses[i].x) < 3, "no onscreen horizontal seam teleport");
        if (dx <= 0.5) assert.ok(dx * w < 3, "smooth physical frame displacement");
        if (dy > 0.5)
          assert.ok(
            outside(a.y * h - shift, h) && outside(b.y * h - shift, h),
            "vertical recycling fully offscreen",
          );
        else assert.ok(dy * h < 3);
        if (b.vy < 0) rising++;
        if (a.vx * b.vx < 0) turns++;
      });
    }
    assert.ok(rising > 100, "curl sometimes lifts, not constant fall");
    assert.ok(turns > 10, "wind changes course, not a straight conveyor");
    assert.ok(new Set(field.bodies.map((b) => b.vx.toFixed(5))).size >= 40);
  }
});

test("stalls clamp integration and substeps keep refresh-rate results close", () => {
  const a = createWindField(48),
    b = createWindField(48),
    c = createWindField(48);
  stepWindField(a, 100, 1366, 900);
  stepWindField(b, 0.05, 1366, 900);
  assert.deepEqual(a, b);
  for (let f = 0; f < 1200; f++) stepWindField(b, 1 / 60, 1366, 900);
  stepWindField(c, 0.05, 1366, 900);
  for (let f = 0; f < 2400; f++) stepWindField(c, 1 / 120, 1366, 900);
  assert.ok(
    b.bodies.every((p, i) => Math.hypot(p.x - c.bodies[i].x, p.y - c.bodies[i].y) < 0.0001),
  );
});
