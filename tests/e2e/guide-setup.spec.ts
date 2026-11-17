import { test, expect } from "@playwright/test";
import { visitWorkspace } from "./workspace-visit.js";

test("guide opens collapsed destinations before smooth scrolling and never steals later focus", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await visitWorkspace(page, "Guide");
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
  expect(await page.evaluate(() => (window as any).guideScrolls.at(-1)?.open)).toBe(true);
  await expect(page.locator(".goal-panel > summary")).toBeFocused();
  await visitWorkspace(page, "Guide");
  await page.getByRole("button", { name: "Import notes", exact: true }).click();
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.outerHTML);
  await page.waitForTimeout(1400);
  expect(await page.evaluate(() => document.activeElement?.outerHTML)).toBe(focused);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await visitWorkspace(page, "Guide");
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
  // Real imported content makes the later Saved plans destination deep enough
  // to observe native compositor movement, without adding a synthetic spacer.
  await visitWorkspace(page, "Plan");
  await page.locator(".goal-panel > summary").click();
  await page.getByLabel("Choose Markdown notes", { exact: true }).setInputFiles({
    name: "scroll-regression.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      "# Scroll regression fixture\n" +
        Array.from({ length: 30 }, (_, i) => `- [ ] Review private fixture section ${i + 1}`).join(
          "\n",
        ),
    ),
  });
  await expect(page.locator(".goal-panel")).toContainText("1 note(s) in tab memory");
  await visitWorkspace(page, "Guide");
  await page.getByRole("tab", { name: "Planning", exact: true }).click();
  await page.getByRole("button", { name: "Saved plans", exact: true }).click();
  await page.waitForFunction(
    () =>
      scrollY > 20 &&
      document.querySelector(".saved-study-plans")!.getBoundingClientRect().top > 200,
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
  await expect(page.locator(".saved-study-plans > summary")).not.toBeFocused();
});

test("walkthrough uses real setup, retains private drafts and rain, and never starts focus", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const duration = page.getByRole("spinbutton", { name: "Focus length", exact: true });
  const intention = page.getByLabel("Your session intention", { exact: true });
  await duration.fill("37");
  await expect(page.getByRole("timer")).toHaveText("37:00");
  await intention.fill("A private shared-state draft");
  await visitWorkspace(page, "Guide");
  await expect(page.getByLabel("Quick focus length")).toHaveCount(0);
  await expect(page.getByLabel("Quick session intention")).toHaveCount(0);
  await page.getByRole("button", { name: "Start walkthrough", exact: true }).click();
  await expect(duration).toHaveValue("37");
  await expect(intention).toHaveValue("A private shared-state draft");
  await duration.fill("19");
  await expect(page.getByRole("timer")).toHaveText("19:00");
  await intention.fill("Edited in the main tool");
  const tour = page.getByRole("complementary", { name: "Site walkthrough", exact: true });
  for (const destination of ["Plan", "Music", "Together", "Progress", "Study"]) {
    await tour.getByRole("button", { name: "Next step", exact: true }).click();
    await expect(
      page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("link", {
        name: destination,
        exact: true,
      }),
    ).toHaveAttribute("aria-current", "page");
  }
  await tour.getByRole("button", { name: "Finish walkthrough", exact: true }).click();
  await expect(tour).toHaveCount(0);
  await expect(duration).toHaveValue("19");
  await expect(intention).toHaveValue("Edited in the main tool");
  await expect(page.getByRole("timer")).toHaveText("19:00");
  await expect(page.locator("[data-action=start]")).toBeEnabled();
  await expect(page.locator("[data-action=pause]")).toHaveCount(0);
  await page.locator("[data-action=start]").click();
  await expect(duration).toBeDisabled();
  await visitWorkspace(page, "Guide");
  await visitWorkspace(page, "Study");
  await expect(duration).toBeDisabled();
  await expect(intention).toHaveValue("Edited in the main tool");
  await page.locator("[data-action=pause]").click();
  await expect(duration).toBeDisabled();
  const paused = await page.getByRole("timer").textContent();
  await visitWorkspace(page, "Guide");
  const guide = page.locator(".quick-guide");
  await guide.getByRole("tab", { name: "Focus", exact: true }).click();
  await guide.getByLabel("Quick optional rain").check();
  await visitWorkspace(page, "Music");
  await page.locator(".ambience-panel > summary").click();
  await expect(page.getByLabel("Optional rain", { exact: true })).toBeChecked();
  await page.getByLabel("Optional rain", { exact: true }).uncheck();
  await visitWorkspace(page, "Guide");
  await expect(guide.getByLabel("Quick optional rain")).not.toBeChecked();
  await visitWorkspace(page, "Study");
  await expect(duration).toBeDisabled();
  await expect(page.getByRole("timer")).toHaveText(paused!);
  await expect(intention).toHaveValue("Edited in the main tool");
});
