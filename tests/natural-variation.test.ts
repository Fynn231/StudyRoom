import { test } from "node:test";
import assert from "node:assert/strict";
import { decorationPose, DECORATION_COUNT } from "../src/naturalMotion.js";

test("normal field keeps balanced coverage without mirrored left/right choreography", () => {
  const width = 1440,
    height = 900,
    time = 37.25;
  let independent = 0;
  for (let index = 0; index < DECORATION_COUNT; index += 2) {
    const a = decorationPose(index, time, width, height, 130);
    const b = decorationPose(index + 1, time, width, height, 130);
    if (Math.abs(a.x + b.x + a.size - width) > 0.01 && Math.abs(a.y - b.y) > 0.01) independent++;
  }
  assert.ok(
    independent >= 20,
    "at least twenty left/right pairs must have independent wind and fall phases",
  );
});

test("normal falling bodies have distinct descent rates and narrow-screen wind", () => {
  for (const [width, height, gutter] of [
    [1440, 900, 130],
    [390, 844, 12],
  ]) {
    const cycle = height + 128;
    const velocities = new Set<string>();
    const horizontal = new Set<string>();
    for (let index = 0; index < DECORATION_COUNT; index++) {
      const a = decorationPose(index, 37.25, width, height, gutter);
      const b = decorationPose(index, 37.5, width, height, gutter);
      const descent = ((b.y - a.y + cycle) % cycle) / 0.25;
      assert.ok(descent > 10 && descent < 35, "fall stays gentle and downward");
      velocities.add(descent.toFixed(4));
      horizontal.add((b.x - a.x).toFixed(4));
    }
    assert.ok(velocities.size >= 40, "bodies must not share one descent rate");
    assert.ok(
      horizontal.size >= 30,
      "narrow screens must not collapse into straight vertical columns",
    );
  }
});
