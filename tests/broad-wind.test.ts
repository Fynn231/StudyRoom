import { test } from "node:test";
import assert from "node:assert/strict";
import { createWindField, stepWindField, windPose } from "../src/openScenery.js";

test("Juliette and Autumn traverse broad two-dimensional space within twenty seconds, not paired gutter tracks", () => {
  for (const kind of ["flowers", "leaves", "welcome"] as const)
    for (const [w, h] of [
      [1366, 900],
      [390, 667],
    ]) {
      const state = createWindField(kind === "leaves" ? 64 : kind === "welcome" ? 18 : 48, kind);
      const tracks = state.bodies.map((b) => ({
        lastX: b.x,
        lastY: b.y,
        x: 0,
        y: 0,
        min: 0,
        max: 0,
        minY: 0,
        maxY: 0,
      }));
      for (let f = 0; f < 1200; f++) {
        stepWindField(state, 1 / 60, w, h);
        state.bodies.forEach((b, i) => {
          const p = tracks[i],
            dx = b.x - p.lastX,
            dy = b.y - p.lastY;
          // Do not count offscreen wrapping as displacement.
          if (Math.abs(dx) < 0.5) p.x += dx;
          if (Math.abs(dy) < 0.5) p.y += dy;
          p.lastX = b.x;
          p.lastY = b.y;
          p.min = Math.min(p.min, p.x);
          p.max = Math.max(p.max, p.x);
          p.minY = Math.min(p.minY, p.y);
          p.maxY = Math.max(p.maxY, p.y);
        });
      }
      const broad = tracks.filter((p) => p.max - p.min >= 0.1 && p.maxY - p.minY >= 0.1).length;
      assert.ok(
        broad >= tracks.length / 2,
        `${kind} ${w}: broad=${broad}/${tracks.length}, ranges=${tracks.map((p) => (p.max - p.min).toFixed(2))}`,
      );
      assert.ok(windPose(state, 0, w, h).size >= 28);
    }
});
