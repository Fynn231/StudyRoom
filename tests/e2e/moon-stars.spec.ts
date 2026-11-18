import { test, expect } from "@playwright/test";

for (const [width, height] of [
  [1440, 900],
  [1366, 768],
  [1280, 800],
  [820, 1180],
  [390, 667],
  [360, 640],
]) {
  test(`Moon native five-point artwork and retained motion at ${width}`, async ({
    browser,
    baseURL,
  }, info) => {
    const context = await browser.newContext({
      baseURL,
      viewport: { width, height },
      hasTouch: width <= 390,
      isMobile: width <= 390,
    });
    try {
      const page = await context.newPage();
      const writes: string[] = [];
      page.on("request", (request) => {
        if (request.method() === "POST") writes.push(new URL(request.url()).pathname);
      });
      await page.goto("/");
      await page.getByRole("button", { name: /^Continue (?:to Study Room|last session)$/ }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const timer = await page.getByRole("timer").elementHandle();
      const draft = page.getByLabel("Your session intention");
      await draft.fill("SYNTHETIC MOON ART CHECK");
      const draftNode = await draft.elementHandle();
      const music = await page.locator(".music-panel").elementHandle();
      await page.getByRole("button", { name: "Start focus", exact: true }).click();
      await page.locator(".appearance > summary").click();
      await page.getByRole("button", { name: "Moon Garden", exact: true }).click();
      await page.getByLabel("Drifting moonlight", { exact: true }).uncheck();
      await page.locator(".appearance > summary").click();
      const layer = page.locator(".natural-flowers");
      const bodies = layer.locator(":scope > svg.flower");
      await expect(bodies).toHaveCount(48);
      await expect(layer.locator(":scope > .moon-stars > svg.star")).toHaveCount(24);
      // Native fill sampling intersects each arm at radius 12. A crescent or
      // four-point diamond cannot satisfy the five separated silhouette lobes.
      const geometry = await bodies.evaluateAll((es) =>
        es.map((e) => {
          const svg = e as SVGSVGElement;
          const path = svg.querySelector("path")!;
          const samples = Array.from({ length: 720 }, (_, n) => {
            const a = (n * Math.PI) / 360;
            return path.isPointInFill(new DOMPoint(20 + Math.cos(a) * 12, 20 + Math.sin(a) * 12));
          });
          const lobes = samples.filter((v, i) => v && !samples[(i + 719) % 720]).length;
          const box = path.getBBox();
          return {
            lobes,
            box: { x: box.x, y: box.y, width: box.width, height: box.height },
            namespace: svg.namespaceURI,
            size: getComputedStyle(svg).width,
          };
        }),
      );
      expect(geometry.map((g) => g.lobes)).toEqual(Array(48).fill(5));
      for (const g of geometry) {
        expect(g.namespace).toBe("http://www.w3.org/2000/svg");
        expect(g.box.x).toBeGreaterThan(0);
        expect(g.box.y).toBeGreaterThan(0);
        expect(g.box.x + g.box.width).toBeLessThan(40);
        expect(g.box.y + g.box.height).toBeLessThan(40);
      }
      const poses = () =>
        bodies.evaluateAll((es) => es.map((e) => (e as SVGElement).style.transform));
      const still = await poses();
      await page.waitForTimeout(350);
      expect(await poses()).toEqual(still);
      await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
      expect(await page.evaluate(() => scrollY)).toBe(0);
      await page.screenshot({ path: info.outputPath("still-scene.png"), fullPage: true });
      await page.screenshot({ path: info.outputPath("still-viewport.png") });
      await page.locator(".appearance > summary").click();
      await page.getByLabel("Drifting moonlight", { exact: true }).check();
      await page.locator(".appearance > summary").click();
      await expect(layer).toHaveAttribute("data-running", "true");
      const start = await page.evaluate(() => performance.now());
      const before = await poses();
      await page.waitForTimeout(1200);
      const after = await poses();
      expect(after).not.toEqual(before);
      const elapsed = (await page.evaluate(() => performance.now())) - start;
      expect(elapsed).toBeGreaterThan(1200);
      await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({ path: info.outputPath("moving-scene.png") });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(layer).toHaveAttribute("data-running", "false");
      const reduced = await poses();
      await page.waitForTimeout(350);
      expect(await poses()).toEqual(reduced);
      await page.screenshot({ path: info.outputPath("reduced-scene.png") });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await expect(layer).toHaveAttribute("data-running", "true");
      expect(await timer!.evaluate((e) => e === document.querySelector('[role="timer"]'))).toBe(
        true,
      );
      expect(
        await draftNode!.evaluate((e) => e.isConnected && (e as HTMLTextAreaElement).value),
      ).toBe("SYNTHETIC MOON ART CHECK");
      expect(await music!.evaluate((e) => e === document.querySelector(".music-panel"))).toBe(true);
      await expect(page.getByRole("button", { name: "Pause focus", exact: true })).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.clientWidth).toBe(width);
      expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
      await page.locator(".appearance > summary").click();
      await page.getByRole("button", { name: "Reset appearance to white and sage" }).click();
      await expect(layer).toHaveCount(0);
      expect(writes).toEqual([]);
      await info.attach("native-art-motion", {
        body: JSON.stringify({ geometry, start, elapsed, before, after, writes }),
        contentType: "application/json",
      });
    } finally {
      await context.close();
    }
  });
}
