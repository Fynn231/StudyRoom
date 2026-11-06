import { test } from "node:test";
import assert from "node:assert/strict";
import { createWindField, stepWindField, windPose } from "../src/openScenery.js";

test("projected side populations do not collapse into tight clusters through twenty seconds", () => {
  const f = createWindField(64, "leaves");
  let maximum = 0;
  for (let n = 0; n < 1200; n++) {
    stepWindField(f, 1 / 60, 390, 667);
    if (n % 12) continue;
    const p = f.bodies
      .map((_, i) => windPose(f, i, 390, 667))
      .filter((p) => p.x >= 0 && p.x < 390 && p.y >= 0 && p.y < 667);
    maximum = Math.max(
      maximum,
      ...p.map(
        (a) => p.filter((b) => Math.hypot((a.x - b.x) / 390, (a.y - b.y) / 667) < 0.05).length,
      ),
    );
  }
  assert.ok(maximum <= 6, `projected dense cluster ${maximum}`);
});

test("appearances keep equal exposed-side populations without shrinking or mirrored poses", () => {
  for (const kind of ["flowers", "leaves", "moon", "welcome"] as const) {
    const count = kind === "leaves" ? 64 : kind === "welcome" ? 18 : 48;
    for (const [w, h] of [
      [1366, 900],
      [1440, 900],
      [390, 667],
    ]) {
      const field = createWindField(count, kind);
      for (let f = 0; f < 3600; f++) {
        if (f % 120 === 0) {
          const poses = field.bodies.map((_, i) => windPose(field, i, w, h));
          const side =
            kind === "welcome"
              ? Math.min(w * 0.22, 220)
              : Math.max(
                  24,
                  (w - Math.min(w, 1280)) / 2 +
                    (w <= 480 ? 24 : w <= 760 ? 18 : w <= 1050 ? 28 : 48),
                );
          const centers = poses.map((p, i) => ({
            x:
              p.x +
              (p.size *
                (kind === "flowers" || kind === "moon"
                  ? w <= 600
                    ? 0.78
                    : w >= 1400
                      ? 1.5
                      : 1
                  : 1)) /
                2 -
              ((kind === "flowers" || kind === "moon") && w >= 1400 ? p.size * 0.25 : 0),
            y: p.y,
            i,
          }));
          assert.equal(centers.filter((p) => p.x < w / 2).length, count / 2);
          assert.ok(
            centers.every((p) => p.x <= side + 14 || p.x >= w - side - 14),
            `${kind} ${w}: accents must occupy exposed side space`,
          );
          assert.ok(poses.every((p) => p.size >= (kind === "welcome" ? 26 : 28)));
          assert.ok(
            poses.some((p, i) => i % 2 && Math.abs(p.y - poses[i - 1].y) > 1),
            "independent poses, not mirrored partners",
          );
        }
        stepWindField(field, 1 / 60, w, h);
      }
    }
  }
});
