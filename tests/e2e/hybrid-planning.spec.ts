import { test, expect } from "@playwright/test";
test("hybrid planning works offline, requires cloud consent, preserves edits on failure and never starts focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  // Keep the fixture's availability in the future without freezing timer/animation callbacks.
  await page.clock.setFixedTime(new Date("2026-11-03T08:00:00"));
  await page.goto("/");
  await page.getByRole("button", { name: "Skip welcome", exact: true }).click();
  await page
    .locator("summary")
    .filter({ hasText: /^Plan tasks & deadlines$/ })
    .click();
  await page.getByLabel("Task 1 title", { exact: true }).fill("Explain photosynthesis");
  await page.getByLabel("Task 1 estimated minutes", { exact: true }).fill("45");
  await page.getByLabel("Task 1 completed minutes", { exact: true }).fill("10");
  await page.getByLabel("Availability 1 start", { exact: true }).fill("2026-11-03T10:00");
  await page.getByLabel("Availability 1 end", { exact: true }).fill("2026-11-03T11:00");
  let cloud = 0;
  await page.route("**/api/ai/hybrid/enhance", (route) => {
    cloud++;
    const body = route.request().postDataJSON();
    expect(body.consent).toBe(true);
    expect(body.input.tasks[0].completedMinutes).toBe(10);
    return route.fulfill({
      status: 429,
      headers: { "Retry-After": "120" },
      contentType: "application/json",
      body: JSON.stringify({
        error: "Cloud Qwen unavailable (upstream_capacity). Your baseline and edits are unchanged.",
      }),
    });
  });
  await page.getByRole("button", { name: "Build baseline schedule", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review your schedule", exact: true }),
  ).toBeVisible();
  expect(cloud).toBe(0);
  await page
    .getByRole("textbox", { name: "Block 1 instructions", exact: true })
    .fill("My private edited instruction");
  await page.getByLabel("Planning provider", { exact: true }).selectOption("cloud-qwen");
  await expect(
    page.getByRole("button", { name: "Enhance with free Qwen", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: /I agree to send this schedule/ }).check();
  await page.getByRole("button", { name: "Enhance with free Qwen", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("upstream_capacity");
  expect(cloud).toBe(1);
  await expect(
    page.getByRole("textbox", { name: "Block 1 instructions", exact: true }),
  ).toHaveValue("My private edited instruction");
  await expect(
    page.getByRole("button", { name: "Enhance with free Qwen", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("timer")).toHaveText("25:00");
  await expect(page.getByRole("button", { name: "Start focus", exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Approve and save schedule to account", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Account sync");
  await expect(
    page.getByRole("textbox", { name: "Block 1 instructions", exact: true }),
  ).toHaveValue("My private edited instruction");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});
