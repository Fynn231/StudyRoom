import { test } from "node:test";
import assert from "node:assert/strict";
import { createWindField, stepWindField, windPose } from "../src/openScenery.js";

test("phone Autumn retains visible coverage and finite state through thirty modeled minutes, not an oversized offscreen reservoir", () => {
  const field = createWindField(64, "leaves");
  let minVisible = 64,
    maxCluster = 0;
  for (let f = 0; f < 36000; f++) {
    stepWindField(field, 0.05, 390, 667);
    if (f % 100 !== 0) continue;
    field.bodies.forEach((b) => assert.ok(Object.values(b).every(Number.isFinite)));
    const visible = field.bodies
      .map((_, i) => {
        const p = windPose(field, i, 390, 667);
        return { x: (p.x + p.size / 2) / 390, y: (p.y + p.size / 2) / 667 };
      })
      .filter((b) => b.x >= 0 && b.x <= 1 && b.y >= 0 && b.y <= 1);
    minVisible = Math.min(minVisible, visible.length);
    maxCluster = Math.max(
      maxCluster,
      ...visible.map((p) => visible.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.05).length),
    );
  }
  assert.ok(
    minVisible >= 32,
    `at least half the field remains on screen throughout a long session; minimum ${minVisible}/64`,
  );
  assert.ok(maxCluster <= 6, `no dense sinks; largest cluster ${maxCluster}`);
});
