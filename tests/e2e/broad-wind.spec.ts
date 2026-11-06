import { test, expect } from "@playwright/test";

for (const [device, width, height] of [
  ["laptop", 1366, 900],
  ["phone", 390, 667],
] as const)
  for (const surface of ["Home", "Juliette", "Autumn Letters"] as const) {
    test(`${device} ${surface} records twenty real seconds of broad balanced wind`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      if (surface !== "Home") {
        await expect(page.locator("dialog.welcome-scene[open]")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await page.locator(".appearance > summary").click();
        await page.getByRole("button", { name: surface, exact: true }).click();
        await page.locator(".appearance > summary").click();
        await page.evaluate(() => scrollTo(0, 0));
      }
      const selector = surface === "Home" ? ".welcome-petals > i" : ".natural-flowers > svg.flower";
      await expect(page.locator(selector)).toHaveCount(
        surface === "Home" ? 18 : surface === "Juliette" ? 48 : 64,
      );
      await page.evaluate((selector) => {
        const els = [...document.querySelectorAll<SVGElement | HTMLElement>(selector)];
        const data = {
          start: performance.now(),
          end: 0,
          intervals: [] as number[],
          samples: [] as { at: number; poses: { x: number; y: number }[] }[],
          done: false,
        };
        (window as unknown as { windRecording: typeof data }).windRecording = data;
        let last = data.start,
          lastSample = -1000;
        function capture(now: number) {
          data.intervals.push(now - last);
          last = now;
          if (now - lastSample >= 200) {
            lastSample = now;
            data.samples.push({
              at: now,
              poses: els.map((e) => {
                // Centres include native CSS sizing/translation; top-left-only
                // tests incorrectly discard half-visible edge silhouettes.
                const box = e.getBoundingClientRect();
                return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
              }),
            });
          }
          if (now - data.start < 20500) requestAnimationFrame(capture);
          else {
            data.end = now;
            data.done = true;
          }
        }
        requestAnimationFrame(capture);
      }, selector);
      for (let t = 0; t <= 20; t += 5) {
        if (t) await page.waitForTimeout(5000);
        await page.screenshot({
          path: info.outputPath(`${device}-${surface.replaceAll(" ", "-")}-${t}s.png`),
        });
      }
      await page.waitForFunction(
        () => (window as unknown as { windRecording: { done: boolean } }).windRecording.done,
      );
      const data = await page.evaluate(
        () =>
          (
            window as unknown as {
              windRecording: {
                start: number;
                end: number;
                intervals: number[];
                samples: { at: number; poses: { x: number; y: number }[] }[];
              };
            }
          ).windRecording,
      );
      expect(data.end - data.start).toBeGreaterThanOrEqual(20000);
      const tracks = data.samples[0].poses.map(() => ({
        x: 0,
        y: 0,
        min: 0,
        max: 0,
        minY: 0,
        maxY: 0,
      }));
      for (let f = 1; f < data.samples.length; f++)
        data.samples[f].poses.forEach((p, i) => {
          const a = data.samples[f - 1].poses[i],
            b = tracks[i],
            dx = p.x - a.x,
            dy = p.y - a.y;
          if (Math.abs(dx) < width / 2) b.x += dx;
          if (Math.abs(dy) < height / 2) b.y += dy;
          b.min = Math.min(b.min, b.x);
          b.max = Math.max(b.max, b.x);
          b.minY = Math.min(b.minY, b.y);
          b.maxY = Math.max(b.maxY, b.y);
        });
      // The owner superseded viewport-wide asymmetry with even exposed sides.
      // Require visible 2D travel relative to that side space, not crossing cards.
      const sideSpace =
        surface === "Home"
          ? Math.min(width * 0.22, 220)
          : Math.max(24, (width - Math.min(width, 1280)) / 2 + (width <= 480 ? 24 : 48)) + 8;
      const broad = tracks.filter(
        (p) => p.max - p.min >= sideSpace * 0.2 && p.maxY - p.minY >= height * 0.1,
      ).length;
      const coverage = data.samples.map((sample) => {
        const visible = sample.poses.filter(
          (p) => p.x >= 0 && p.x < width && p.y >= 0 && p.y < height,
        );
        const quadrants = [0, 0, 0, 0];
        visible.forEach(
          (p) => quadrants[(p.x >= width / 2 ? 1 : 0) + (p.y >= height / 2 ? 2 : 0)]++,
        );
        const cluster = Math.max(
          ...visible.map(
            (p) =>
              visible.filter((q) => Math.hypot((p.x - q.x) / width, (p.y - q.y) / height) < 0.05)
                .length,
          ),
        );
        return { at: sample.at, quadrants, cluster };
      });
      await info.attach("real-elapsed-wind", {
        body: JSON.stringify(
          {
            surface,
            device,
            width,
            height,
            camera:
              "Playwright real-time video; screenshots at nominal 0/5/10/15/20s; actual sample timestamps below",
            broad,
            coverage,
            tracks,
            data,
          },
          null,
          2,
        ),
        contentType: "application/json",
      });
      expect(broad).toBeGreaterThanOrEqual(tracks.length / 2);
      expect(
        coverage.every((c) =>
          c.quadrants.every((n) => n >= (surface === "Home" ? 1 : 3) && n <= tracks.length * 0.55),
        ),
      ).toBe(true);
      expect(coverage.every((c) => c.cluster <= 6)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
      expect(errors).toEqual([]);
    });
  }

test("Home suspends the covered normal producers without resetting their poses", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue to Study Room", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator(".appearance > summary").click();
  await page.getByRole("button", { name: "Juliette", exact: true }).click();
  await page.getByLabel("Gentle warm/sage gradient motion", { exact: true }).check();
  await page.locator(".appearance > summary").click();
  await expect(page.locator(".normal-gradient")).toHaveAttribute("data-running", "true");
  await expect(page.locator(".natural-flowers")).toHaveAttribute("data-running", "true");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.locator("dialog[open]")).toBeVisible();
  await expect(page.locator(".natural-flowers")).toHaveAttribute("data-running", "false");
  await expect(page.locator(".normal-gradient")).toHaveAttribute("data-running", "false");
  const poses = () =>
    page
      .locator(".natural-flowers > svg.flower")
      .evaluateAll((es) => es.map((e) => (e as SVGElement).style.transform));
  const still = await poses();
  await page.waitForTimeout(150);
  expect(await poses()).toEqual(still);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".natural-flowers")).toHaveAttribute("data-running", "true");
});
