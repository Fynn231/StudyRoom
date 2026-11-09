import { test, expect } from "@playwright/test";

async function enter(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue to Study Room", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function keys(page: import("@playwright/test").Page, key: string) {
  await page.locator("#main").focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press(key);
}

test("fresh entry records timed opacity frames", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue to Study Room", exact: true }).click();
  await page.waitForFunction(() => {
    const e = document.querySelector(".welcome-scene");
    const opacity = e ? Number(getComputedStyle(e).opacity) : 0;
    return opacity > 0 && opacity < 0.95;
  });
  const samples = await page.evaluate(async () => {
    const frames = [];
    for (let frame = 0; frame < 3; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      frames.push({
        at: performance.now(),
        opacity: Number(getComputedStyle(document.querySelector(".welcome-scene")!).opacity),
      });
    }
    return frames;
  });
  for (const sample of samples) {
    expect(sample.opacity).toBeGreaterThan(0);
    expect(sample.opacity).toBeLessThan(1);
  }
  await page.screenshot({ path: info.outputPath("fresh-fade-mid.png") });
  expect(samples[2].opacity).toBeLessThan(samples[0].opacity);
  await info.attach("fresh-opacity-frames.json", {
    body: JSON.stringify(samples),
    contentType: "application/json",
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#main")).toBeFocused();
});

test("Home Continue fades while retaining live timer and draft", async ({ page }, info) => {
  await enter(page);
  const timer = await page.getByRole("timer").elementHandle();
  const draft = await page.getByLabel("Your session intention", { exact: true }).elementHandle();
  await page.getByLabel("Your session intention", { exact: true }).fill("Live Home draft");
  await page.getByLabel("Enable focus chime", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Start focus", exact: true }).click();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Continue last session", exact: true }).click();
  await page.waitForFunction(() => {
    const e = document.querySelector(".welcome-scene");
    const opacity = e ? Number(getComputedStyle(e).opacity) : 0;
    return opacity > 0 && opacity < 0.95;
  });
  const sample = await page.evaluate(() => ({
    at: performance.now(),
    opacity: document.querySelector(".welcome-scene")
      ? Number(getComputedStyle(document.querySelector(".welcome-scene")!).opacity)
      : null,
  }));
  await info.attach("home-fade-sample.json", {
    body: JSON.stringify(sample),
    contentType: "application/json",
  });
  const opacity = sample.opacity!;
  expect(opacity).toBeGreaterThan(0);
  expect(opacity).toBeLessThan(1);
  await page.screenshot({ path: info.outputPath("home-fade-mid.png") });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#main")).toBeFocused();
  expect(await timer!.evaluate((e) => e.isConnected)).toBe(true);
  expect(await draft!.evaluate((e) => e.isConnected)).toBe(true);
  await expect(page.getByLabel("Your session intention", { exact: true })).toHaveValue(
    "Live Home draft",
  );
  await expect(page.getByRole("button", { name: "Pause focus", exact: true })).toBeVisible();
});

for (const width of [1440, 1198, 1024, 768, 390, 360])
  test(`normal Focus guide controls after locked return ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 960 });
    await enter(page);
    await page.getByRole("tab", { name: "Focus", exact: true }).click();
    const before = await page.getByLabel("Quick optional rain", { exact: true }).boundingBox();
    expect(before!.width).toBeLessThanOrEqual(24);
    expect(before!.height).toBeLessThanOrEqual(24);
    await page
      .locator(".quick-guide")
      .screenshot({ path: info.outputPath(`focus-before-${width}.png`) });
    await keys(page, "l");
    await expect(page.locator(".lock-in-mode")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(".lock-in-mode")).toHaveCount(0);
    await page.getByRole("tab", { name: "Focus", exact: true }).click();
    await page.waitForTimeout(2200); // Inspect settled rendering, not the native transition snapshot.
    const selectedTab = page.getByRole("tab", { name: "Focus", exact: true });
    const selectedColors = await selectedTab.evaluate((e) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--ink)";
      e.append(probe);
      const ink = getComputedStyle(probe).color;
      probe.remove();
      return { ink, background: getComputedStyle(e).backgroundColor };
    });
    expect(selectedColors.background).toBe(selectedColors.ink);
    const checkbox = page.getByLabel("Quick optional rain", { exact: true });
    const box = await checkbox.boundingBox();
    await page
      .locator(".quick-guide")
      .screenshot({ path: info.outputPath(`focus-return-${width}.png`) });
    expect(box!.width).toBeLessThanOrEqual(24);
    expect(box!.height).toBeLessThanOrEqual(24);
    const label = await checkbox.locator("..").boundingBox();
    expect(label!.height).toBeGreaterThanOrEqual(44);
    const action = await page
      .getByRole("button", { name: "Focus options", exact: true })
      .boundingBox();
    expect(action!.height).toBeGreaterThanOrEqual(44);
    expect(action!.height).toBeLessThanOrEqual(52);
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

for (const width of [1440, 390])
  test(`desktop has symmetric hidden gestures without mode buttons ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await enter(page);
    await keys(page, "l");
    await expect(page.locator(".lock-in-mode")).toHaveCount(1);
    await expect(
      page.getByRole("button", {
        name: /Return to normal mode|Exit Lock In Mode|Switch to normal mode/,
      }),
    ).toHaveCount(0);
    await keys(page, "l");
    await expect(page.locator(".lock-in-mode")).toHaveCount(1);
    await keys(page, "n");
    await expect(page.locator(".lock-in-mode")).toHaveCount(0);
  });

test("touch has a deliberate labelled mode switch in both directions", async ({
  browser,
  baseURL,
}, info) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    baseURL,
  });
  const page = await context.newPage();
  await enter(page);
  const into = page.getByRole("button", { name: "Switch to locked in mode", exact: true });
  await expect(into).toBeVisible();
  const b = await into.boundingBox();
  expect(b!.height).toBeGreaterThanOrEqual(44);
  expect(b!.width).toBeGreaterThanOrEqual(44);
  await into.tap();
  await expect(page.locator(".lock-in-mode")).toHaveCount(1);
  await page.getByRole("button", { name: "Switch to normal mode", exact: true }).tap();
  await expect(page.locator(".lock-in-mode")).toHaveCount(0);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: info.outputPath("touch-normal.png") });
  await context.close();
});

test("checkpoint reload fades into paused timer and reduced motion returns immediately", async ({
  page,
}, info) => {
  await enter(page);
  await page.getByLabel("Enable focus chime", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Start focus", exact: true }).click();
  await page.waitForTimeout(1300);
  await page.reload();
  await page.getByRole("button", { name: "Continue last session", exact: true }).click();
  await page.waitForFunction(() => {
    const e = document.querySelector(".welcome-scene");
    const opacity = e ? Number(getComputedStyle(e).opacity) : 0;
    return opacity > 0 && opacity < 0.95;
  });
  const opacity = await page
    .locator(".welcome-scene")
    .evaluate((e) => Number(getComputedStyle(e).opacity));
  expect(opacity).toBeGreaterThan(0);
  expect(opacity).toBeLessThan(1);
  await page.screenshot({ path: info.outputPath("checkpoint-fade-mid.png") });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resume focus", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause focus", exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Last timer restored paused. No study time was credited while you were away.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Continue last session", exact: true }).click();
  expect(await page.locator(".welcome-scene").count()).toBe(0);
  await expect(page.locator("#main")).toBeFocused();
});

test("rapid opposite gestures preserve timer and draft DOM", async ({ page }) => {
  await enter(page);
  const timer = await page.getByRole("timer").elementHandle();
  const draft = await page.getByLabel("Your session intention", { exact: true }).elementHandle();
  await page.getByLabel("Your session intention", { exact: true }).fill("Rapid gesture continuity");
  for (let round = 0; round < 3; round++) {
    await keys(page, "l");
    await expect(page.locator(".lock-in-mode")).toHaveCount(1);
    await keys(page, "n");
    await expect(page.locator(".lock-in-mode")).toHaveCount(0);
  }
  expect(await timer!.evaluate((e) => e.isConnected)).toBe(true);
  expect(await draft!.evaluate((e) => e.isConnected)).toBe(true);
  await expect(page.getByLabel("Your session intention", { exact: true })).toHaveValue(
    "Rapid gesture continuity",
  );
});
