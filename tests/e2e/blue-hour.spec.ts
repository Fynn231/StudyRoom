import { test, expect, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /^Continue (?:to Study Room|last session)$/ }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.getByLabel("Enable focus chime", { exact: true }).uncheck();
  await page
    .getByLabel("Your session intention", { exact: true })
    .fill("A quiet chapter by the water");
  await page.getByRole("button", { name: "Start focus", exact: true }).click();
  await page.locator(".appearance > summary").click();
  await page.getByRole("button", { name: "Blue Hour", exact: true }).click();
}
const pose = (page: Page) =>
  page.locator(".water-wave").evaluateAll((els) =>
    els.map((e) => ({
      transform: getComputedStyle(e).transform,
      opacity: getComputedStyle(e).opacity,
    })),
  );

for (const [name, width, height] of [
  ["laptop", 1440, 900],
  ["phone", 390, 844],
] as const) {
  test(`${name}: water wavefronts move behind retained content, pause and switch off`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await ready(page);
    const timer = await page.getByRole("timer").elementHandle();
    const draft = await page.getByLabel("Your session intention", { exact: true }).elementHandle();
    await expect(page.locator(".water-wave")).toHaveCount(15);
    await expect(page.locator(".water-ripples")).toHaveAttribute("data-running", "true");
    const before = await pose(page);
    await page.waitForTimeout(450);
    expect(await pose(page)).not.toEqual(before);
    await page.getByLabel("Water ripples", { exact: true }).uncheck();
    const stopped = await pose(page);
    await page.waitForTimeout(120);
    expect(await pose(page)).toEqual(stopped);
    await page.getByLabel("Water ripples", { exact: true }).check();
    await page.locator(".appearance > summary").click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(350);
    await page.screenshot({ path: info.outputPath(`${name}-water-a.png`) });
    const a = await pose(page);
    await page.waitForTimeout(700);
    await page.screenshot({ path: info.outputPath(`${name}-water-b.png`) });
    expect(await pose(page)).not.toEqual(a);
    expect(
      await page.locator(".water-ripples").evaluate((e) => getComputedStyle(e).pointerEvents),
    ).toBe("none");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    await page.locator("main").focus();
    await page.keyboard.type("lllll", { delay: 30 });
    await expect(page.locator(".lock-in-mode")).toBeVisible();
    await expect(page.locator(".water-ripples")).toHaveAttribute("data-running", "false");
    await page.locator("main").focus();
    await page.keyboard.type("nnnnn", { delay: 30 });
    await expect(page.locator(".lock-in-mode")).toHaveCount(0);
    await expect(page.locator(".water-ripples")).toHaveAttribute("data-running", "true");
    expect(await timer!.evaluate((e) => e === document.querySelector('[role="timer"]'))).toBe(true);
    expect(
      await draft!.evaluate(
        (e, current) => e === current,
        await page.getByLabel("Your session intention", { exact: true }).elementHandle(),
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await expect(page.locator(".welcome-scene")).toBeVisible();
    await expect(page.locator(".water-ripples")).toHaveAttribute("data-running", "false");
    await page.getByRole("button", { name: /^Continue (?:to Study Room|last session)$/ }).click();
    await expect(page.locator(".water-ripples")).toHaveAttribute("data-running", "true");
    if (name === "phone") {
      await page.getByRole("timer").scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath("phone-water-timer.png") });
    }
    await expect(page.getByLabel("Your session intention", { exact: true })).toHaveValue(
      "A quiet chapter by the water",
    );
    await expect(page.locator('[data-action="pause"]')).toBeEnabled();
    await page.locator(".appearance > summary").click();
    await page.getByRole("button", { name: "Sage", exact: true }).click();
    await expect(page.locator(".water-ripples")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("reduced motion keeps recognizable water still, including runtime preference changes", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await expect(page.locator(".water-ripples")).toHaveAttribute("data-running", "false");
  const still = await pose(page);
  await page.waitForTimeout(160);
  expect(await pose(page)).toEqual(still);
  await page.screenshot({ path: info.outputPath("reduced-water.png") });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator(".water-ripples")).toHaveAttribute("data-running", "true");
  await page.waitForTimeout(150);
  expect(await pose(page)).not.toEqual(still);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const paused = await pose(page);
  await page.waitForTimeout(150);
  expect(await pose(page)).toEqual(paused);
});
