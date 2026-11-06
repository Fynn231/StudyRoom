import { test, expect } from "@playwright/test";

for (const [width, height] of [
  [1440, 900],
  [1280, 800],
  [820, 1180],
  [390, 667],
])
  for (const theme of ["Juliette", "Autumn Letters"]) {
    test(`${theme} at ${width} has readable form sizing and no scroll or guide remapping`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await page.getByRole("button", { name: /^Continue (?:to Study Room|last session)$/ }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.locator(".appearance > summary").click();
      await page.getByRole("button", { name: theme, exact: true }).click();
      await page
        .getByLabel(theme === "Juliette" ? "Falling flowers" : "Falling leaves", { exact: true })
        .uncheck();
      await page.locator(".appearance > summary").click();
      await page.evaluate(() => scrollTo(0, 0));
      const bodies = page.locator(".natural-flowers > svg.flower");
      const poses = () =>
        bodies.evaluateAll((es) =>
          es.map((e) => ({
            width: parseFloat(getComputedStyle(e).width),
            transform: (e as SVGElement).style.transform,
          })),
        );
      const initial = await poses();
      expect
        .soft(Math.min(...initial.map((b) => b.width)))
        // CSS lengths are quantized to layout subpixels (32.76 -> 32.75 in Chrome).
        .toBeGreaterThanOrEqual(theme === "Juliette" ? (width <= 600 ? 32.74 : 42) : 32);
      expect
        .soft(Math.max(...initial.map((b) => b.width)))
        .toBeLessThanOrEqual(
          theme === "Juliette"
            ? width >= 1400
              ? 94.5
              : width <= 600
                ? 49.14
                : 63
            : width <= 600
              ? 48
              : 52,
        );
      await page.evaluate(() => scrollTo(0, 310));
      await page.waitForTimeout(100);
      expect.soft(await poses()).toEqual(initial);
      await page.evaluate(() => {
        scrollTo(0, 0);
        const guide = document.querySelector<HTMLDetailsElement>(".quick-guide");
        if (!guide) throw Error("guide missing");
        guide.open = !guide.open;
      });
      await page.waitForTimeout(100);
      expect.soft(await poses()).toEqual(initial);
      await info.attach("readable-still-poses", {
        body: JSON.stringify(initial),
        contentType: "application/json",
      });
      await page.locator(".appearance > summary").click();
      await page
        .getByLabel(theme === "Juliette" ? "Falling flowers" : "Falling leaves", { exact: true })
        .check();
      await page.locator(".appearance > summary").click();
      await expect(page.locator(".natural-flowers")).toHaveAttribute("data-running", "true");
      const positions = () =>
        bodies.evaluateAll((es) =>
          es.map((e) => {
            const m = new DOMMatrix((e as SVGElement).style.transform);
            return { x: m.m41, y: m.m42 };
          }),
        );
      const before = await positions();
      const continuity = await page.evaluate(() => {
        const read = () =>
          [...document.querySelectorAll<SVGElement>(".natural-flowers > svg.flower")].map(
            (e) => e.style.transform,
          );
        const before = read();
        scrollTo(0, 310);
        const guide = document.querySelector<HTMLDetailsElement>(".quick-guide")!;
        guide.open = !guide.open;
        return { before, after: read() };
      });
      expect(continuity.after).toEqual(continuity.before);
      const sampledAt = await page.evaluate(() => performance.now());
      await page.waitForTimeout(100);
      const after = await positions();
      const elapsed = ((await page.evaluate(() => performance.now())) - sampledAt) / 1000;
      for (let i = 0; i < before.length; i++) {
        // A real wind field can cross >8px in 100ms. Bound by elapsed speed,
        // while the same-task equality above detects any layout remapping.
        if (Math.abs(after[i].x - before[i].x) < width / 2)
          expect(Math.abs(after[i].x - before[i].x)).toBeLessThan(width * 0.1 * elapsed + 4);
        else expect([before[i].x, after[i].x].every((x) => x < -60 || x > width + 20)).toBe(true);
        if (Math.abs(after[i].y - before[i].y) < height / 2)
          expect(Math.abs(after[i].y - before[i].y)).toBeLessThan(height * 0.1 * elapsed + 4);
        else expect([before[i].y, after[i].y].every((y) => y < -60 || y > height + 20)).toBe(true);
      }
    });
  }
