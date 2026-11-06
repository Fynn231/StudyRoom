import { test, expect } from "@playwright/test";

test("guide opens collapsed destinations before smooth scrolling and never steals later focus", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate(() => {
    const original = HTMLElement.prototype.scrollIntoView;
    (window as any).guideScrolls = [];
    HTMLElement.prototype.scrollIntoView = function (options) {
      (window as any).guideScrolls.push({
        options,
        open: !this.closest("details") || this.closest("details")!.open,
      });
      original.call(this, options);
    };
  });
  await page.getByRole("tab", { name: "Planning", exact: true }).click();
  await page.getByRole("button", { name: "Import notes", exact: true }).click();
  await expect(page.locator(".goal-panel")).toHaveAttribute("open", "");
  await expect
    .poll(() => page.evaluate(() => (window as any).guideScrolls.at(-1)?.options.behavior))
    .toBe("smooth");
  await expect(page.locator(".goal-panel > summary")).toBeFocused();
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await page.getByRole("button", { name: "Import notes", exact: true }).click();
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.outerHTML);
  await page.waitForTimeout(1400);
  expect(await page.evaluate(() => document.activeElement?.outerHTML)).toBe(focused);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await page.getByRole("button", { name: "Import notes", exact: true }).click();
  expect(await page.evaluate(() => (window as any).guideScrolls.at(-1)?.options.behavior)).toBe(
    "instant",
  );
  await expect(page.locator(".goal-panel > summary")).toBeFocused();
});

test("cancelling guide navigation stops the in-flight native smooth scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("tab", { name: "Planning", exact: true }).click();
  await page.getByRole("button", { name: "Import notes", exact: true }).click();
  await page.waitForFunction(
    () => scrollY > 20 && document.querySelector(".goal-panel")!.getBoundingClientRect().top > 200,
    undefined,
    { polling: "raf" },
  );
  // A modifier key cancels navigation without its own focus or scrolling action.
  await page.keyboard.press("Shift");
  const samples = await page.evaluate(async () => {
    // Observe rendered frames: Chromium can commit one already-queued compositor update.
    const values: number[] = [];
    for (let frame = 0; frame < 24; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      values.push(scrollY);
    }
    return values;
  });
  expect(Math.max(...samples) - Math.min(...samples), JSON.stringify(samples)).toBeLessThanOrEqual(
    2,
  );
  await expect(page.locator(".goal-panel > summary")).not.toBeFocused();
});

test("guide setup shares the real idle timer, private intention and rain without starting anything", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const guide = page.locator(".quick-guide");
  await guide.getByText("Set up this session", { exact: true }).click();
  await guide.getByLabel("Quick focus length").fill("37");
  await expect(page.getByRole("spinbutton", { name: "Focus length", exact: true })).toHaveValue(
    "37",
  );
  await expect(page.getByRole("timer")).toHaveText("37:00");
  await page.getByRole("spinbutton", { name: "Focus length", exact: true }).fill("19");
  await expect(guide.getByLabel("Quick focus length")).toHaveValue("19");
  await guide.getByLabel("Quick session intention").fill("A private shared-state draft");
  await expect(page.getByLabel("Your session intention", { exact: true })).toHaveValue(
    "A private shared-state draft",
  );
  await page.getByLabel("Your session intention", { exact: true }).fill("Edited in the main tool");
  await expect(guide.getByLabel("Quick session intention")).toHaveValue("Edited in the main tool");
  await expect(page.locator("[data-action=start]")).toBeEnabled();
  await page.locator("[data-action=start]").click();
  await expect(guide.getByLabel("Quick focus length")).toBeDisabled();
  await page.locator("[data-action=pause]").click();
  await expect(guide.getByLabel("Quick focus length")).toBeDisabled();
  await guide.getByRole("tab", { name: "Focus", exact: true }).click();
  await guide.getByLabel("Quick optional rain").check();
  await page.locator(".ambience-panel > summary").click();
  await expect(page.getByLabel("Optional rain", { exact: true })).toBeChecked();
  await page.getByLabel("Optional rain", { exact: true }).uncheck();
  await expect(guide.getByLabel("Quick optional rain")).not.toBeChecked();
});
