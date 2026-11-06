import { test, expect } from "@playwright/test";

for (const [name, width, height] of [
  ["desktop", 1440, 900],
  ["mobile", 390, 667],
] as const) {
  test(`${name} actual confirmed CSS Home flakes and original Juliette replay`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    const welcome = page.locator("dialog.welcome-scene");
    await expect(welcome).toBeVisible();
    await expect(welcome.locator(".welcome-petals .welcome-flake")).toHaveCount(18);
    await expect(welcome.getByRole("button", { name: /skip|enter quietly/i })).toHaveCount(0);
    await expect(welcome.getByText("Headphones recommended for the best experience")).toBeVisible();
    const poses = () =>
      welcome.locator(".welcome-petals i").evaluateAll((es) =>
        es.map((e) => ({
          fall: getComputedStyle(e).transform,
          orbit: getComputedStyle(e.firstElementChild!).transform,
          size: parseFloat(getComputedStyle(e).width),
          phase: (e as HTMLElement).style.getPropertyValue("--leaf-size"),
        })),
      );
    await page.waitForTimeout(1300);
    const before = await poses();
    expect(before.every((p) => p.size >= 26 && p.size <= 38)).toBe(true);
    expect(new Set(before.map((p) => p.phase)).size).toBe(18);
    const white = await welcome.evaluate((e) =>
      getComputedStyle(e).getPropertyValue("--welcome-flake-light").trim(),
    );
    expect(white).toBe("#ffffffb0");
    const normalFlake = await welcome
      .locator(".welcome-flake")
      .first()
      .evaluate((e) => {
        const s = getComputedStyle(e);
        return {
          radius: s.borderRadius,
          background: s.backgroundImage,
          ratio: parseFloat(s.height) / parseFloat(s.width),
          shadow: s.boxShadow,
        };
      });
    expect(normalFlake.radius).toBe("80% 20% 65% 35%");
    expect(normalFlake.ratio).toBeCloseTo(1.6, 2);
    expect(normalFlake.shadow).toBe("none");
    expect(normalFlake.background).toContain("145deg");
    await page.screenshot({ path: info.outputPath(`${name}-welcome-0.png`) });
    await page.waitForTimeout(6000);
    const after = await poses();
    expect(after.every((p, i) => p.fall !== before[i].fall && p.orbit !== before[i].orbit)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`${name}-welcome-6s.png`) });
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(welcome.locator(".welcome-petals")).toHaveAttribute("data-running", "false");
    const frozen = await poses();
    await page.waitForTimeout(100);
    expect(await poses()).toEqual(frozen);
    // Synthetic visibility event exercises lifecycle handling, not OS suspension.
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await welcome
        .locator(".welcome-petals i")
        .first()
        .evaluate((e) => getComputedStyle(e).animationName),
    ).toBe("none");
    await page.screenshot({ path: info.outputPath(`${name}-welcome-reduced.png`) });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await welcome.getByRole("button", { name: "Continue to Study Room" }).click();
    await expect(welcome).toHaveCount(0);
    await page.locator(".appearance > summary").click();
    await page.getByRole("button", { name: "Juliette", exact: true }).click();
    await page.locator(".appearance > summary").click();
    await page.evaluate(() => scrollTo(0, 0));
    const flowers = page.locator(".natural-flowers > svg.flower");
    await expect(flowers).toHaveCount(48);
    const geometry = await flowers.evaluateAll((es) =>
      es.map((e) => ({
        viewBox: e.getAttribute("viewBox"),
        petals: e.querySelectorAll("path").length,
        centres: e.querySelectorAll("ellipse").length,
        inlineWidth: (e as SVGElement).style.width,
        pose: (e as SVGElement).style.transform,
      })),
    );
    expect(
      geometry.every(
        (e) =>
          e.viewBox === "-1.7 -1.7 3.4 3.4" &&
          e.petals === 160 &&
          e.centres === 1 &&
          e.inlineWidth === "",
      ),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath(`${name}-juliette-0.png`), fullPage: true });
    await page.waitForTimeout(6000);
    const later = await flowers.evaluateAll((es) =>
      es.map((e) => (e as SVGElement).style.transform),
    );
    expect(later.every((p, i) => p !== geometry[i].pose)).toBe(true);
    await page.screenshot({ path: info.outputPath(`${name}-juliette-6s.png`), fullPage: true });
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await expect(welcome).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(welcome).toHaveCount(0);
    await page.locator("button.wordmark").click({ clickCount: 5, delay: 30 });
    await expect(page.locator(".lock-in-mode")).toBeVisible();
    await page.waitForTimeout(2100);
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await expect(welcome).toBeVisible();
    const dark = await welcome.evaluate((e) => ({
      background: getComputedStyle(e).backgroundImage,
      face: getComputedStyle(e).getPropertyValue("--welcome-flake-light").trim(),
    }));
    expect(dark.background).not.toContain("196, 220, 197");
    expect(dark.face).toBe("#4f676fcc");
    const darkFlake = await welcome
      .locator(".welcome-flake")
      .first()
      .evaluate((e) => getComputedStyle(e).backgroundImage);
    expect(darkFlake).toContain("155deg");
    expect(darkFlake).not.toBe(normalFlake.background);
    await page.waitForTimeout(1300);
    await page.screenshot({ path: info.outputPath(`${name}-welcome-dark.png`) });
    await info.attach("real-elapsed-motion", {
      body: JSON.stringify({ before, after, geometry, later, dark }, null, 2),
      contentType: "application/json",
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    expect(errors).toEqual([]);
  });
}
