import { test, expect } from "@playwright/test";

for (const [width, height] of [
  [1366, 900],
  [1440, 900],
  [390, 667],
])
  for (const preset of ["Juliette", "Autumn Letters", "Moon Garden"])
    test(`${width} ${preset} exposes balanced bilateral art over real elapsed time`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await expect(page.locator("dialog[open]")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.locator(".appearance > summary").click();
      await page.getByRole("button", { name: preset, exact: true }).click();
      await page.locator(".appearance > summary").click();
      await page.evaluate(() => scrollTo(0, 0));
      const samples = [];
      for (let n = 0; n < 4; n++) {
        if (n) await page.waitForTimeout(2000);
        samples.push(
          await page.locator(".natural-flowers > svg.flower").evaluateAll((es) => {
            const islands = [
              ...document.querySelectorAll(
                ".masthead,.quick-guide,.page-heading,.demo-note,.session-tools,.focus-surface,.intention-surface,.optional-panel,.help-panel",
              ),
            ].map((e) => e.getBoundingClientRect());
            const sides = [
              { count: 0, area: 0, bands: [0, 0, 0, 0] },
              { count: 0, area: 0, bands: [0, 0, 0, 0] },
            ];
            for (const e of es) {
              const svg = e as SVGSVGElement,
                vb = svg.viewBox.baseVal,
                matrix = svg.getScreenCTM()!;
              const paths = [...svg.querySelectorAll("path")].filter(
                (p) => p.getAttribute("fill") !== "none",
              );
              const local = [0, 0];
              for (let x = vb.x + vb.width / 16; x < vb.x + vb.width; x += vb.width / 8)
                for (let y = vb.y + vb.height / 16; y < vb.y + vb.height; y += vb.height / 8) {
                  const p = new DOMPoint(x, y);
                  if (!paths.some((path) => path.isPointInFill(p))) continue;
                  const q = p.matrixTransform(matrix);
                  if (
                    q.x < 0 ||
                    q.x >= innerWidth ||
                    q.y < 0 ||
                    q.y >= innerHeight ||
                    islands.some(
                      (r) => q.x > r.left && q.x < r.right && q.y > r.top && q.y < r.bottom,
                    )
                  )
                    continue;
                  const side = q.x < innerWidth / 2 ? 0 : 1;
                  local[side]++;
                  sides[side].bands[Math.min(3, Math.floor((q.y / innerHeight) * 4))]++;
                }
              local.forEach((n, side) => {
                if (n >= 2) sides[side].count++;
                sides[side].area +=
                  ((n * vb.width * vb.height) / 64) *
                  Math.abs(matrix.a * matrix.d - matrix.b * matrix.c);
              });
            }
            return { at: performance.now(), sides };
          }),
        );
        await page.screenshot({ path: info.outputPath(`bilateral-${n}.png`) });
      }
      await info.attach("exposed-silhouette-balance", {
        body: JSON.stringify(samples, null, 2),
        contentType: "application/json",
      });
      expect(samples.at(-1)!.at - samples[0].at).toBeGreaterThan(6000);
      for (const sample of samples) {
        const [l, r] = sample.sides;
        expect(Math.min(l.count, r.count)).toBeGreaterThanOrEqual(5);
        expect(Math.min(l.area, r.area) / Math.max(l.area, r.area)).toBeGreaterThan(0.4);
        expect(l.bands.filter((n) => n > 0).length).toBeGreaterThanOrEqual(3);
        expect(r.bands.filter((n) => n > 0).length).toBeGreaterThanOrEqual(3);
      }
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(page.locator(".natural-flowers")).toHaveAttribute("data-running", "false");
      await page.screenshot({ path: info.outputPath("bilateral-reduced.png") });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    });
