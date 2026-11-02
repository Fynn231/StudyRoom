import { test, expect } from "@playwright/test";
test("upfront guide tabs support keyboard, open the right tool, and preserve private work on phone", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Skip welcome", exact: true }).click();
  await page
    .getByLabel("Your session intention", { exact: true })
    .fill("Private navigation continuity fixture");
  await page.getByLabel("Enable focus chime", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Start focus", exact: true }).click();
  const tabs = page.getByRole("tablist", { name: "Study Room quick guide" });
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole("tab")).toHaveCount(6);
  await tabs.getByRole("tab", { name: "Start", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Planning", exact: true })).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText("Plan your next step");
  await page.getByRole("button", { name: "Import notes", exact: true }).click();
  await expect(page.locator(".goal-panel")).toHaveAttribute("open", "");
  await expect(page.locator(".goal-panel > summary")).toBeFocused();
  await tabs.getByRole("tab", { name: "Music", exact: true }).click();
  await page.getByRole("button", { name: "Open music", exact: true }).click();
  await expect(page.locator(".music-panel")).toHaveAttribute("open", "");
  await tabs.getByRole("tab", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("not encrypted");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".quick-guide").screenshot({ path: info.outputPath("quick-guide-phone.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByLabel("Your session intention", { exact: true })).toHaveValue(
    "Private navigation continuity fixture",
  );
  await expect(page.getByRole("button", { name: "Pause focus", exact: true })).toBeVisible();
  const headers = (await page.request.get("/")).headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  // Enforce the security boundary in an actual browser, not only a header assertion.
  await page.evaluate(() => {
    const frame = document.createElement("iframe");
    frame.title = "Blocked Study Room frame";
    frame.src = "/";
    document.body.appendChild(frame);
  });
  await expect
    .poll(() =>
      page
        .frames()
        .filter((f) => f !== page.mainFrame())
        .map((f) => f.url()),
    )
    .toContain("chrome-error://chromewebdata/");
  await expect(page.getByRole("button", { name: "Pause focus", exact: true })).toBeVisible();
});
