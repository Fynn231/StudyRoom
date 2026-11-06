import { test } from "node:test";
import assert from "node:assert/strict";
import { createWindField, stepWindField, windPose } from "../src/openScenery.js";

test("best-candidate composition is balanced, nonmirrored and unbanded, with no coincident seeds", () => {
  for (const n of [18, 48, 64]) {
    const field = createWindField(n);
    assert.deepEqual(field, createWindField(n), "deterministic initialization");
    const bins = [0, 0, 0, 0];
    for (const b of field.bodies) bins[(b.x >= 0.5 ? 1 : 0) + (b.y >= 0.5 ? 2 : 0)]++;
    assert.ok(
      bins.every((nq) => nq >= Math.floor(n / 8) && nq <= Math.ceil(n * 0.4)),
      `quadrants ${bins}`,
    );
    assert.ok(new Set(field.bodies.map((b) => b.y.toFixed(4))).size >= n * 0.9, "no paired rows");
    assert.ok(new Set(field.bodies.map((b) => b.x.toFixed(4))).size >= n * 0.9, "no fixed columns");
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const a = field.bodies[i],
          b = field.bodies[j];
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 0.055, "no initial clumps");
        assert.ok(
          Math.abs(a.x + b.x - 1) > 0.00001 || Math.abs(a.y - b.y) > 0.00001,
          "no exact mirror pairing",
        );
      }
  }
});

test("wind maintains broad coverage without dense sinks over two modeled minutes", () => {
  const field = createWindField(64, "leaves");
  for (let f = 0; f < 7200; f++) {
    stepWindField(field, 1 / 60, 1366, 900);
    if (f % 300 !== 0) continue;
    const bins = [0, 0, 0, 0],
      // Coverage must use projected screen positions, not virtual curl coordinates.
      visible = field.bodies
        .map((_, i) => {
          const p = windPose(field, i, 1366, 900);
          return { x: (p.x + p.size / 2) / 1366, y: (p.y + p.size / 2) / 900 };
        })
        .filter((b) => b.x >= 0 && b.x <= 1 && b.y >= 0 && b.y <= 1);
    visible.forEach((b) => bins[(b.x >= 0.5 ? 1 : 0) + (b.y >= 0.5 ? 2 : 0)]++);
    assert.ok(
      bins.every((n) => n >= 5 && n <= 27),
      `no quadrant emptied or dominant clump at ${f / 60}s: ${bins}`,
    );
    assert.ok(visible.length >= 40, "field does not drain away");
    for (const b of visible)
      assert.ok(
        visible.filter((a) => Math.hypot(a.x - b.x, a.y - b.y) < 0.05).length <= 5,
        "no tight clusters",
      );
  }
});
