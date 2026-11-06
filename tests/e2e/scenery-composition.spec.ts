import { test, expect } from "@playwright/test";

for (const [name, width, height] of [
  ["desktop", 1440, 900],
  ["laptop", 1280, 800],
  ["tablet", 820, 1180],
  ["short-phone", 390, 667],
] as const) {
  test(`${name} normal scenery paints real interior negative space with bounded geometry`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: /^Continue (?:to Study Room|last session)$/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await expect(page.locator(".flower")).toHaveCount(0);
    await page
      .getByLabel("Your session intention", { exact: true })
      .fill("B1 private continuity draft");
    await page.getByRole("button", { name: "Start focus", exact: true }).click();
    await page.screenshot({ path: info.outputPath(`${name}-default.png`), fullPage: true });
    const metrics = [];
    for (const theme of ["Autumn Letters"]) {
      await page.locator(".appearance > summary").click();
      await page.getByRole("button", { name: theme, exact: true }).click();
      await page.locator(".appearance > summary").click();
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(150);
      const coverage = await page.locator(".natural-flowers > svg.flower").evaluateAll((es) => {
        const islands = [
          ...document.querySelectorAll(
            ".masthead,.quick-guide,.page-heading,.demo-note,.session-tools,.focus-surface,.intention-surface,.optional-panel,.help-panel",
          ),
        ].map((e) => e.getBoundingClientRect());
        const reading = [...document.querySelectorAll(".focus-surface,.intention-surface")].map(
          (e) => e.getBoundingClientRect(),
        );
        const contentLeft = Math.min(...reading.map((r) => r.left));
        const contentRight = Math.max(...reading.map((r) => r.right));
        const bodies = es.map((e) => {
          const svg = e as SVGSVGElement,
            box = svg.getBoundingClientRect(),
            ink = svg.getBBox(),
            vb = svg.viewBox.baseVal;
          let visible = 0,
            filled = 0,
            interior = 0;
          for (let x = vb.x + 1; x < vb.x + vb.width; x += 2)
            for (let y = vb.y + 1; y < vb.y + vb.height; y += 2) {
              const p = new DOMPoint(x, y);
              if (
                ![...svg.querySelectorAll("path")].some(
                  (path) => path.getAttribute("fill") !== "none" && path.isPointInFill(p),
                )
              )
                continue;
              filled++;
              const screen = p.matrixTransform(svg.getScreenCTM()!);
              if (screen.x < 0 || screen.x >= innerWidth || screen.y < 0 || screen.y >= innerHeight)
                continue;
              if (
                islands.some(
                  (r) =>
                    r.width > 0 &&
                    r.height > 0 &&
                    screen.x > r.left &&
                    screen.x < r.right &&
                    screen.y > r.top &&
                    screen.y < r.bottom,
                )
              )
                continue;
              visible++;
              if (screen.x > contentLeft && screen.x < contentRight) interior++;
            }
          return {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            visible,
            filled,
            size: parseFloat(getComputedStyle(svg).width),
            exposedInkArea:
              visible *
              4 *
              Math.abs(
                svg.getScreenCTM()!.a * svg.getScreenCTM()!.d -
                  svg.getScreenCTM()!.b * svg.getScreenCTM()!.c,
              ),
            interior,
            contained:
              ink.x >= vb.x &&
              ink.y >= vb.y &&
              ink.x + ink.width <= vb.x + vb.width &&
              ink.y + ink.height <= vb.y + vb.height,
          };
        });
        return {
          now: performance.now(),
          bodies,
          interiorBodies: bodies.filter((b) => b.interior > 0).length,
          exposedBodies: bodies.filter((b) => b.visible > 0).length,
          overflow: document.documentElement.scrollWidth - innerWidth,
        };
      });
      expect(coverage.bodies).toHaveLength(64);
      // Partial occlusion is intentional: test substantial readable artwork,
      // not B1's accidental every-body-exposed / tiny-gap-fitting policy.
      expect(
        coverage.bodies.filter((b) => b.visible / b.filled >= 0.3 && b.exposedInkArea >= 80).length,
      ).toBeGreaterThanOrEqual(4);
      expect(
        coverage.bodies.reduce((area, b) => area + b.exposedInkArea, 0),
      ).toBeGreaterThanOrEqual(width <= 600 ? 1200 : 4000);
      expect(coverage.bodies.every((b) => b.size >= 32 && b.size <= 52)).toBe(true);
      expect(coverage.bodies.every((b) => b.contained)).toBe(true);
      expect(coverage.bodies.every((b) => b.width > 0 && b.height > 0)).toBe(true);
      expect(coverage.overflow).toBe(0);
      metrics.push({ theme, coverage });
      await page.screenshot({
        path: info.outputPath(`${name}-${theme.replaceAll(" ", "-")}.png`),
        fullPage: true,
      });
    }
    await info.attach("composition-metrics", {
      body: JSON.stringify(metrics, null, 2),
      contentType: "application/json",
    });
    await expect(page.getByLabel("Your session intention", { exact: true })).toHaveValue(
      "B1 private continuity draft",
    );
    await expect(page.locator("[data-action=pause]")).toBeEnabled();
    expect(errors).toEqual([]);
  });
}
