import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function ready(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Continue (?:to Study Room|last session)$/, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("timer")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
}
test("laptop primary timer action is available above the fold with the guide open", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page);
  await page.screenshot({ path: info.outputPath("laptop-hierarchy.png"), fullPage: true });
  const box = await page.getByRole("button", { name: "Start focus", exact: true }).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(900);
});
test("reduced-motion welcome keeps scattered art instead of a rigid row", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".welcome-scene")).toBeVisible();
  const positions = await page.locator(".welcome-petals i").evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y) };
    }),
  );
  await page.screenshot({ path: info.outputPath("welcome-static.png") });
  expect(new Set(positions.map((p) => p.x)).size).toBeGreaterThan(10);
  expect(new Set(positions.map((p) => p.y)).size).toBeGreaterThan(10);
});
test("locked palette reaches the whole document canvas, not only the fixed viewport wash", async ({
  page,
}) => {
  await ready(page);
  await page.locator("main").focus();
  await page.keyboard.type("lllll", { delay: 30 });
  await expect(page.locator(".lock-in-mode")).toBeVisible();
  const palette = await page.locator(".room-backdrop").evaluate((e) => {
    const probe = document.createElement("div");
    probe.style.background = getComputedStyle(e).getPropertyValue("--locked-background");
    document.body.append(probe);
    const expected = getComputedStyle(probe).backgroundImage;
    probe.remove();
    return { actual: getComputedStyle(e).backgroundImage, expected };
  });
  expect(palette.actual).toBe(palette.expected);
});
for (const [name, width, height] of [
  ["laptop", 1440, 900],
  ["tablet", 820, 1180],
  ["phone", 390, 844],
] as const) {
  test(`${name} preserves identities, timers and drafts across normal and locked appearances`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await ready(page);
    const overflow = async () =>
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
    await overflow();
    await page.getByLabel("Enable focus chime", { exact: true }).uncheck();
    await page.getByLabel("Your session intention", { exact: true }).fill("One quiet chapter");
    await page.getByRole("button", { name: "Start focus", exact: true }).click();
    const appearance = page.locator(".appearance > summary");
    await appearance.click();
    for (const preset of [
      "Sage",
      "Peach Glow",
      "Lavender Mist",
      "Ocean Haze",
      "Forest Study",
      "Rosewood",
      "Blue Hour",
      "Juliette",
      "Moon Garden",
      "Autumn Letters",
    ]) {
      await page.getByRole("button", { name: preset, exact: true }).click();
      await overflow();
      await expect(page.locator("[data-action=pause]")).toBeEnabled();
    }
    await page.getByRole("button", { name: "Juliette", exact: true }).click();
    await expect(page.locator(".natural-flowers")).toHaveAttribute("data-running", "true");
    const transforms = await page
      .locator(".natural-flowers > svg.flower")
      .evaluateAll((els) => els.map((e) => (e as SVGElement).style.transform));
    await page.waitForTimeout(250);
    const moved = await page
      .locator(".natural-flowers > svg.flower")
      .evaluateAll(
        (els, starts) =>
          els.filter((e, i) => (e as SVGElement).style.transform !== starts[i]).length,
        transforms,
      );
    expect(moved).toBe(48);
    const lanes = await page.locator(".natural-flowers > svg.flower").evaluateAll((els) => {
      const boxes = els.map((e) => e.getBoundingClientRect());
      return {
        left: boxes.filter((r) => r.x < innerWidth / 2 && r.right > 0).length,
        right: boxes.filter((r) => r.x >= innerWidth / 2 && r.x < innerWidth).length,
      };
    });
    expect(lanes.left).toBeGreaterThanOrEqual(12);
    expect(lanes.left).toBeLessThanOrEqual(35);
    expect(lanes.right).toBeGreaterThanOrEqual(12);
    expect(lanes.right).toBeLessThanOrEqual(35);
    await appearance.click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`${name}-juliette.png`), fullPage: true });
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    // Match the existing delivery helper: manual Silent prevents provider-owned
    // iframe markup from being confused with an app accessibility regression.
    await page
      .locator("summary")
      .filter({ hasText: /^Music$/ })
      .click();
    await page.getByLabel("Silent mode", { exact: true }).check();
    await page.locator("main").focus();
    await page.keyboard.type("lllll", { delay: 30 });
    await expect(page.locator(".lock-in-mode")).toBeVisible();
    await page.waitForTimeout(1900);
    const picker = page.locator(".appearance > summary");
    await picker.click();
    for (const title of [
      "Obsidian Static",
      "Ember Column",
      "Contour Drift",
      "Eclipse Bloom",
      "Shard Field",
      "Undertow",
      "Signal Sweep",
      "Wireframe Drift",
      "Frost Lattice",
      "Aurora Fold",
      "Halftone Pulse",
      "Orbital Ash",
    ]) {
      await page.getByRole("button", { name: new RegExp(`^${title}`) }).click();
      await overflow();
      await expect(page.locator("[data-action=pause]")).toBeEnabled();
    }
    await picker.click();
    await page.evaluate(() => window.scrollTo(0, 0));
    const panelOverlap = await page.locator(".lock-in-panel").evaluate((panel) => {
      const p = panel.getBoundingClientRect();
      return [...document.querySelectorAll(".focus-surface,.intention-surface")].some((e) => {
        const r = e.getBoundingClientRect();
        return p.left < r.right && p.right > r.left && p.top < r.bottom && p.bottom > r.top;
      });
    });
    expect(panelOverlap).toBe(false);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`${name}-locked.png`), fullPage: true });
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.getByRole("button", { name: "Exit Lock In Mode", exact: true }).click();
    await expect(page.locator(".lock-in-mode")).toHaveCount(0);
    await expect(page.getByLabel("Your session intention", { exact: true })).toHaveValue(
      "One quiet chapter",
    );
    await expect(page.locator("[data-action=pause]")).toBeEnabled();
    expect(errors).toEqual([]);
  });
}
