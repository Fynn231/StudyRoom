import { test } from "node:test";
import assert from "node:assert/strict";
import { decorationPose, DECORATION_COUNT } from "../src/naturalMotion.js";

test("normal decorations retain equal side populations and bounded cyclic spacing for thirty minutes", () => {
  for (const [width, height, gutter] of [
    [1600, 1000, 208],
    [1280, 800, 48],
    [390, 844, 12],
    [320, 640, 8],
  ]) {
    for (let time = 0; time <= 1800; time += 0.37) {
      const rows: number[][] = [[], []];
      const weights = [0, 0];
      for (let index = 0; index < DECORATION_COUNT; index++) {
        const pose = decorationPose(index, time, width, height, gutter);
        const side = index % 2;
        const size = pose.size * (width <= 600 ? 0.78 : 1);
        assert.ok(Number.isFinite(pose.x) && Number.isFinite(pose.y));
        assert.ok(pose.x >= 0 && pose.x + size <= width);
        assert.ok(side ? pose.x > width / 2 - size : pose.x < width / 2);
        assert.ok(pose.y >= -64 && pose.y < height + 64);
        rows[side].push(pose.y);
        weights[side] += pose.size * pose.size;
      }
      assert.equal(
        weights[0],
        weights[1],
        "equal total artwork weight without exact mirror positions",
      );
      for (const side of rows) {
        assert.equal(side.length, 24);
        side.sort((a, b) => a - b);
        const cycle = height + 128;
        for (let index = 0; index < side.length; index++) {
          const gap: number =
            index === side.length - 1
              ? side[0] + cycle - side[index]
              : side[index + 1] - side[index];
          assert.ok(
            gap > (cycle / 24) * 0.79,
            "rows cannot bunch together, including the recycle seam",
          );
        }
      }
    }
  }
});
