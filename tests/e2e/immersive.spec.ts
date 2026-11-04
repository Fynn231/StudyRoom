import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const width of [1440, 390])
  test(`welcome and continuous mode transitions at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/");
    const welcome = page.getByRole("dialog");
    await expect(welcome).toBeVisible();
    await expect(page.getByRole("button", { name: "Enter Study Room", exact: true })).toBeFocused();
    await expect(page.locator(".welcome-copy")).toHaveCSS("opacity", "1");
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({ path: info.outputPath(`welcome-${width}.png`) });
    await page.getByRole("button", { name: "Enter Study Room", exact: true }).click();
    await expect(welcome).toHaveAttribute("data-leaving", "true");
    await expect(welcome).toHaveCount(0);
    await expect(page.locator("#main")).toBeFocused();
    await page.getByLabel("Enable focus chime", { exact: true }).uncheck();
    const timer = await page.getByRole("timer").elementHandle();
    await page
      .getByLabel("Your session intention", { exact: true })
      .fill("Synthetic transition continuity");
    await page.getByRole("button", { name: "Start focus", exact: true }).click();
    await page
      .getByRole("button", { name: "study room", exact: true })
      .click({ clickCount: 5, delay: 30 });
    await expect(page.locator(".lock-in-mode")).toBeVisible();
    await expect(page.locator(".environment-wash")).toHaveAttribute("data-locked", "true");
    await expect
      .poll(
        async () => {
          const opacity = await page
            .locator(".environment-wash")
            .evaluate((e) => Number(getComputedStyle(e).opacity));
          return opacity > 0 && opacity < 1;
        },
        { intervals: [16, 32, 64, 100] },
      )
      .toBe(true);
    await page.screenshot({ path: info.outputPath(`enter-mid-${width}.png`) });
    await expect(page.locator(".environment-wash")).toHaveCSS("opacity", "1");
    expect(await timer!.evaluate((e) => e.isConnected)).toBe(true);
    await expect(page.getByLabel("Primary objective", { exact: true })).toHaveValue(
      "Synthetic transition continuity",
    );
    await page.screenshot({ path: info.outputPath(`locked-${width}.png`) });
    await page.getByRole("button", { name: "Exit Lock In Mode", exact: true }).click();
    await expect(page.locator(".environment-wash")).toHaveAttribute("data-locked", "false");
    await expect
      .poll(
        async () => {
          const opacity = await page
            .locator(".environment-wash")
            .evaluate((e) => Number(getComputedStyle(e).opacity));
          return opacity > 0 && opacity < 1;
        },
        { intervals: [16, 32, 64, 100] },
      )
      .toBe(true);
    await expect(page.locator(".environment-wash")).toHaveCSS("opacity", "0");
    expect(await timer!.evaluate((e) => e.isConnected)).toBe(true);
    await page.getByRole("button", { name: "Pause focus", exact: true }).click();
    await page
      .locator("summary")
      .filter({ hasText: /^Room ambience$/ })
      .click();
    await page.getByRole("button", { name: "Show welcome again", exact: true }).click();
    await expect(welcome).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(welcome).toHaveCount(0);
    await expect(page.getByLabel("Your session intention", { exact: true })).toHaveValue(
      "Synthetic transition continuity",
    );
    await page.reload();
    await expect(page.getByRole("timer")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Welcome back to your study room." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continue last session", exact: true }).click();
    await expect(welcome).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page
      .locator("summary")
      .filter({ hasText: /^Room ambience$/ })
      .click();
    await page.getByRole("button", { name: "Show welcome again", exact: true }).click();
    expect(
      await page
        .locator(".welcome-petals i")
        .evaluateAll((es) => es.every((e) => getComputedStyle(e).animationName === "none")),
    ).toBe(true);
    await page.getByRole("button", { name: "Continue last session", exact: true }).click();
    await expect(welcome).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
  });
test("ambience is explicit, loops locally, mutes, fades with mode and never restarts from saved preferences", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Base = window.AudioContext;
    let count = 0;
    (window as any).__audioCount = () => count;
    window.AudioContext = class extends Base {
      constructor(...args: any[]) {
        super(...(args as []));
        count++;
        (window as any).__ambienceContext = this;
      }
      createGain() {
        const node = super.createGain();
        if (!(window as any).__ambienceMaster) (window as any).__ambienceMaster = node;
        return node;
      }
    } as any;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Skip welcome", exact: true }).click();
  await page
    .locator("summary")
    .filter({ hasText: /^Room ambience$/ })
    .click();
  expect(await page.evaluate(() => (window as any).__audioCount())).toBe(0);
  await page.getByRole("button", { name: "Play room ambience", exact: true }).click();
  await expect(page.getByText("Beneath the Rain is playing.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__audioCount())).toBe(1);
  await page.waitForTimeout(1000);
  const normal = await page.evaluate(() => (window as any).__ambienceMaster.gain.value);
  await page
    .getByRole("button", { name: "study room", exact: true })
    .click({ clickCount: 5, delay: 30 });
  await page.waitForTimeout(1800);
  const lowered = await page.evaluate(() => (window as any).__ambienceMaster.gain.value);
  expect(lowered).toBeLessThan(normal * 0.4);
  expect(await page.evaluate(() => (window as any).__audioCount())).toBe(1);
  await page.getByRole("button", { name: "Exit Lock In Mode", exact: true }).click();
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => (window as any).__ambienceMaster.gain.value)).toBeGreaterThan(
    normal * 0.9,
  );
  await page.getByRole("button", { name: "Mute room ambience", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unmute room ambience", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Stop room ambience", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__ambienceContext.state))
    .toBe("closed");
  await page.reload();
  await page.getByRole("button", { name: "Skip welcome", exact: true }).click();
  await page
    .locator("summary")
    .filter({ hasText: /^Room ambience$/ })
    .click();
  expect(await page.evaluate(() => (window as any).__audioCount())).toBe(0);
  await expect(
    page.getByRole("button", { name: "Unmute room ambience", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Stop room ambience", exact: true }),
  ).toBeDisabled();
});

test("unsupported audio remains recoverable without affecting focus", async ({ page }) => {
  await page.addInitScript(() => {
    window.AudioContext = class {
      constructor() {
        throw Error("Synthetic unsupported audio");
      }
    } as any;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Skip welcome", exact: true }).click();
  await page
    .locator("summary")
    .filter({ hasText: /^Room ambience$/ })
    .click();
  await page.getByRole("button", { name: "Play room ambience", exact: true }).click();
  await expect(
    page.getByText("Audio could not start. Check browser audio permissions and try Play again.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Play room ambience", exact: true })).toBeEnabled();
  await expect(page.getByRole("timer")).toHaveText("25:00");
});
