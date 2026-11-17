import { test, expect, type Page } from "@playwright/test";
import { visitWorkspace } from "./workspace-visit.js";

async function enterFocus(page: Page) {
  await page.locator(".focus-setup > summary").click();
  await page.getByRole("button", { name: "Enter focus view", exact: true }).click();
  await expect(page.locator(".focus-view")).toBeVisible();
}

test("Focus Study retains reviewed planning owners and hides secondary tools with explicit settings recovery", async ({
  page,
}, info) => {
  await page.goto("/?view=study");
  await page.getByLabel("Focus length", { exact: true }).fill("37");
  await page
    .getByLabel("Your session intention", { exact: true })
    .fill("Synthetic reviewed focus draft");
  await page.getByRole("button", { name: "Plan session", exact: true }).click();
  await page.getByLabel("Use local AI for planning choices", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Steps", exact: true }).click();
  const plan = page.getByRole("region", { name: "Private intention plan", exact: true });
  await expect(plan).toBeVisible();
  await plan.getByRole("checkbox").first().check();
  await plan.getByRole("button", { name: "Save on this device", exact: true }).click();
  await page.locator(".saved-study-plans > summary").click();
  await page.getByRole("button", { name: "Resume plan", exact: true }).click();
  const resumed = page.getByRole("region", { name: "Resumed saved study plan", exact: true });
  await expect(resumed).toBeVisible();
  await page.locator(".saved-study-plans > summary").click();
  await page.evaluate(() => {
    const selectors = [
      '[role="timer"]',
      ".intention-surface textarea",
      ".session-plan",
      ".goal-panel",
      ".resumed-study-plan",
    ];
    (window as any).focusOwners = selectors.map((s) => document.querySelector(s));
    (window as any).focusSelectors = selectors;
    (window as any).focusSaved = localStorage.getItem("study-room.saved-study-plans.v1");
  });
  expect(await page.evaluate(() => (window as any).focusSaved)).toBeTruthy();
  await visitWorkspace(page, "Study");
  await enterFocus(page);
  await expect(plan).toBeVisible();
  await expect(resumed).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText("37:00");
  await expect(page.getByLabel("Your session intention", { exact: true })).toHaveValue(
    "Synthetic reviewed focus draft",
  );
  await expect(plan.getByRole("checkbox").first()).toBeChecked();
  await expect(page.locator(".session-tools")).not.toBeVisible();
  await expect(page.locator(".goal-panel")).not.toBeVisible();
  await expect(page.locator(".focus-setup")).not.toBeVisible();
  await expect(
    page.getByLabel("Paste a brief or external plan", { exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Request AI refinement", exact: true }),
  ).not.toBeVisible();
  for (const name of ["Music", "Plan", "Together", "Progress", "Guide"] as const) {
    await visitWorkspace(page, name);
    await expect(page.locator(".focus-view")).toBeVisible();
    await expect(page.getByRole("timer")).not.toBeVisible();
    expect(await page.locator(".workspace-section[hidden]:not([inert])").count()).toBe(0);
    if (name === "Plan") await expect(page.locator(".goal-panel")).toBeVisible();
  }
  await page.getByRole("tab", { name: "Focus", exact: true }).click();
  await page.getByRole("button", { name: "Focus options", exact: true }).click();
  await expect(page.locator(".focus-setup")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Return to focus view", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return to focus view", exact: true }).click();
  await expect(page.locator(".focus-setup")).not.toBeVisible();
  await expect(plan).toBeVisible();
  await expect(resumed).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).focusSelectors.every(
        (s: string, i: number) => document.querySelector(s) === (window as any).focusOwners[i],
      ),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => localStorage.getItem("study-room.saved-study-plans.v1") === (window as any).focusSaved,
    ),
  ).toBe(true);
  const savedStep = resumed.locator(".step-check input").first();
  await savedStep.uncheck();
  await expect(page.getByText("Saved completion updated.", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as any).restoreFocusStorage = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === "study-room.saved-study-plans.v1")
        throw new Error("Synthetic focus storage refusal");
      return original.call(this, key, value);
    };
  });
  await savedStep.click();
  await expect(page.locator(".saved-plans-error")).toBeVisible();
  await expect(page.locator(".saved-plans-error")).toContainText("Could not update saved plans");
  await expect(savedStep).not.toBeChecked();
  await page.evaluate(() => (window as any).restoreFocusStorage());
  await page.screenshot({ path: info.outputPath("focus-study.png"), fullPage: true });
});

test("Focus Together keeps active room invitations visible without auto joining or exposing inactive pages", async ({
  page,
}, info) => {
  await page.goto("/?view=study");
  await enterFocus(page);
  await visitWorkspace(page, "Together");
  await expect(page.getByLabel("Room code", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Party", exact: true }).click();
  await expect(page.getByLabel("Room code", { exact: true })).toHaveCount(0);
  await page.getByLabel("Your name", { exact: true }).fill("Synthetic Focus Cedar");
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(page.locator(".people li")).toHaveCount(1);
  await expect(page.getByLabel("Room code", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy link", exact: true })).toBeVisible();
  const invite = page.getByLabel("Room invite link", { exact: true });
  await expect(invite).toBeVisible();
  await invite.selectText();
  await expect(invite).toBeFocused();
  await expect(invite).toHaveValue(/room=[A-Z0-9]{6}/);
  await expect(page.getByRole("timer")).not.toBeVisible();
  await expect(page.locator(".focus-view")).toBeVisible();
  expect(await page.locator(".workspace-section[hidden]:not([inert])").count()).toBe(0);
  await page.screenshot({ path: info.outputPath("focus-together.png"), fullPage: true });
});
