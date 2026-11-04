// Standalone UI gate: dynamic local port, disposable browser, no installed extension.
// Run: node --import tsx tests/e2e/focus-reliability.browser.mjs
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { createStudyServer } from "../../server/app.ts";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve(".test-output/focus-reliability-browser");
await mkdir(output, { recursive: true });
let vite, browser;
const app = createStudyServer((req, res) => vite.middlewares(req, res));
try {
  vite = await createServer({
    configFile: false,
    cacheDir: resolve(".test-output/focus-vite-cache"),
    server: { middlewareMode: true, host: "127.0.0.1", hmr: { server: app.http } },
    appType: "spa",
  });
  const url = await app.listen(0);
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const errors = [];
  const results = [];
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 640 },
    { width: 768, height: 1024 },
    { width: 820, height: 1180 },
    { width: 1920, height: 1080 },
  ]) {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(url);
    await page.getByRole("button", { name: "Skip welcome", exact: true }).click();
    await expect(page.getByRole("timer")).toBeVisible();
    const before = await page.getByRole("timer").innerText();
    const setup = page.locator(".focus-setup");
    await setup.locator(":scope > summary").click();
    await expect(setup.getByText("Focus view is off.", { exact: true })).toBeVisible();
    await setup.getByText("Check or stop website blocking", { exact: true }).click();
    await expect(
      setup.getByText(/If Stop is not confirmed, disable or remove the extension/),
    ).toBeVisible();
    await expect(
      setup.getByText(/Ending your study timer or leaving Focus view does not stop the blocker/),
    ).toBeVisible();
    const checkbox = setup.getByRole("checkbox");
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await expect(setup.getByText(/Recorded as your own confirmation/)).toBeVisible();
    await checkbox.uncheck();
    await setup.screenshot({ path: resolve(output, `setup-${viewport.width}.png`) });
    await setup.getByRole("button", { name: "Enter focus view", exact: true }).click();
    await expect(page.locator(".focus-view")).toBeVisible();
    await expect(page.getByRole("timer")).toHaveText(before);
    await page.getByRole("button", { name: "Exit focus view", exact: true }).click();
    await expect(page.locator(".focus-view")).toHaveCount(0);
    await expect(page.getByRole("timer")).toHaveText(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    results.push({ viewport, recoveryVisible: true, timerUnchanged: true, overflow: false });
  }
  expect(errors).toEqual([]);
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        passed: true,
        url,
        results,
        errors,
        browser: await browser.version(),
        extensionEnforcement: "not tested",
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ passed: true, results, errors, output, extensionEnforcement: "not tested" }),
  );
} finally {
  await browser?.close();
  await vite?.close();
  await app.close();
}
