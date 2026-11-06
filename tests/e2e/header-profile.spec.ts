import { test, expect } from "@playwright/test";

for (const width of [1366, 390])
  test(`${width} nested profile disclosure preserves native popup accessibility in every view`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator("dialog[open]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByLabel("Your session intention", { exact: true }).fill("Keep disclosure draft");
    await page.locator("[data-action=start]").click();
    await page.evaluate(() => {
      (window as any).disclosureTimer = document.querySelector('[role="timer"]');
    });
    const access = page.getByRole("button", { name: "Profile and account", exact: true });
    const panel = page.locator(".profile-account-panel");
    const details = panel.locator(".study-profile");
    async function toggleDetails() {
      await page.evaluate(() => {
        const details = document.querySelector(".profile-account-panel .study-profile")!;
        (window as any).profileDisclosureToggled = new Promise<void>((resolve) => {
          details.addEventListener("toggle", () => setTimeout(resolve, 0), { once: true });
        });
      });
      await details.locator(":scope > summary").click();
      await page.evaluate(() => (window as any).profileDisclosureToggled);
    }
    for (const locked of [false, true]) {
      if (locked) {
        await page.locator("button.wordmark").click({ clickCount: 5, delay: 30 });
        await expect(page.locator(".lock-in-mode")).toBeVisible();
        await page.waitForTimeout(2100);
      }
      for (const focusView of [false, true]) {
        if (focusView) {
          await page.getByRole("tab", { name: "Focus", exact: true }).click();
          await page.getByRole("button", { name: "Focus options", exact: true }).click();
          await page.getByRole("button", { name: "Enter focus view", exact: true }).click();
        }
        await access.click();
        const name = panel.getByLabel("Profile display name", { exact: true });
        await expect(name).toBeVisible();
        await name.fill("Retained disclosure name");
        await toggleDetails();
        expect(await details.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(false);
        expect(await panel.evaluate((node) => node.matches(":popover-open"))).toBe(true);
        await expect(panel).toHaveAttribute("aria-hidden", "false");
        await expect(panel).toHaveAttribute("role", "dialog");
        await expect(access).toHaveAttribute("aria-expanded", "true");
        await expect(
          page.getByRole("dialog", { name: "Profile and account", exact: true }),
        ).toBeVisible();
        await toggleDetails();
        await expect(name).toBeVisible();
        await expect(name).toHaveValue("Retained disclosure name");
        if (focusView)
          await panel
            .getByRole("button", { name: "Close profile and account", exact: true })
            .click();
        else {
          await access.focus();
          await page.keyboard.press("Escape");
        }
        await expect(panel).not.toBeVisible();
        await expect(panel).toHaveAttribute("aria-hidden", "true");
        await expect(access).toHaveAttribute("aria-expanded", "false");
        await expect(page.locator(".lock-in-mode")).toHaveCount(locked ? 1 : 0);
        await expect(page.locator(".room-backdrop")).toHaveClass(
          focusView ? /focus-view/ : /^(?!.*focus-view)/,
        );
        expect(
          await page.evaluate(
            () => document.querySelector('[role="timer"]') === (window as any).disclosureTimer,
          ),
        ).toBe(true);
        await expect(page.locator("[data-action=pause]")).toBeEnabled();
        await expect(page.locator(".intention-surface textarea")).toHaveValue(
          "Keep disclosure draft",
        );
        if (focusView)
          await page.getByRole("button", { name: "Exit focus view", exact: true }).click();
      }
    }
  });

test("reopening profile refreshes real completed cycles without resetting private drafts", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Your session intention", { exact: true }).fill("Keep this intention");
  const access = page.getByRole("button", { name: "Profile and account", exact: true });
  const panel = page.getByRole("dialog", { name: "Profile and account", exact: true });
  await access.click();
  await expect(panel.locator(".profile-card")).toContainText("0 completed cycles · 0 minutes");
  await panel.getByLabel("Profile display name", { exact: true }).fill("Unsaved profile name");
  await panel.getByLabel("About your study space", { exact: true }).fill("Unsaved profile bio");
  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  await page.clock.install();
  await page.getByLabel("Focus length", { exact: true }).fill("1");
  for (const cycles of [1, 2]) {
    if (cycles > 1) await page.locator("[data-action=reset]").click();
    await page.locator("[data-action=start]").click();
    await page.clock.runFor(60100);
    const completion = page.getByRole("dialog");
    await expect(completion).toBeVisible();
    await completion.getByRole("button", { name: "Skip", exact: true }).click();
    await expect(completion).toHaveCount(0);
    const savedProgress = await page.evaluate(() => {
      const records = JSON.parse(localStorage.getItem("studyroom.completedSessions.v1") || "[]");
      return {
        sessions: records.filter((record: { focusedMs: number }) => record.focusedMs > 0).length,
        minutes: Math.floor(
          records.reduce(
            (sum: number, record: { focusedMs: number }) => sum + record.focusedMs,
            0,
          ) / 60000,
        ),
      };
    });
    expect(savedProgress.sessions).toBe(cycles);
    expect(savedProgress.minutes).toBeGreaterThanOrEqual(cycles - 1);
    await access.click();
    await expect(panel.locator(".profile-card")).toContainText(
      `${savedProgress.sessions} completed cycles · ${savedProgress.minutes} minutes`,
    );
    await expect(
      panel.locator(".study-badges li").filter({ hasText: "First focus" }),
    ).toHaveAttribute("data-earned", "true");
    await expect(panel.getByLabel("Profile display name", { exact: true })).toHaveValue(
      "Unsaved profile name",
    );
    await expect(panel.getByLabel("About your study space", { exact: true })).toHaveValue(
      "Unsaved profile bio",
    );
    await expect(page.locator(".intention-surface textarea")).toHaveValue("Keep this intention");
    await expect(page.locator(".study-profile")).toHaveCount(1);
    await panel.getByRole("button", { name: "Close profile and account", exact: true }).click();
    await expect(panel).not.toBeVisible();
  }
});
for (const width of [1366, 390])
  test(`${width} header profile stays accessible in both modes without remounting work`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator("dialog[open]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByLabel("Your session intention", { exact: true })
      .fill("Keep this private draft");
    await page.locator("[data-action=start]").click();
    await page.evaluate(() => {
      (window as any).originalTimer = document.querySelector('[role="timer"]');
    });
    for (const locked of [false, true]) {
      if (locked) {
        await page.locator("button.wordmark").click({ clickCount: 5, delay: 30 });
        await expect(page.locator(".lock-in-mode")).toBeVisible();
        await page.waitForTimeout(2100);
      }
      const access = page.getByRole("button", { name: "Profile and account", exact: true });
      await expect(access).toBeVisible();
      const box = await access.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThan(width / 2);
      await access.focus();
      await page.keyboard.press("Enter");
      const panel = page.getByRole("dialog", { name: "Profile and account", exact: true });
      await expect(panel).toBeVisible();
      await expect(panel.getByLabel("Profile display name", { exact: true })).toBeFocused();
      if (!locked)
        await panel
          .getByLabel("Profile display name", { exact: true })
          .fill("Private profile draft");
      else
        await expect(panel.getByLabel("Profile display name", { exact: true })).toHaveValue(
          "Private profile draft",
        );
      const panelBounds = await panel.boundingBox();
      const closeBounds = await panel
        .getByRole("button", { name: "Close profile and account", exact: true })
        .boundingBox();
      expect(closeBounds!.y).toBeGreaterThanOrEqual(panelBounds!.y);
      expect(closeBounds!.y + closeBounds!.height).toBeLessThanOrEqual(
        panelBounds!.y + panelBounds!.height,
      );
      await page.screenshot({
        path: info.outputPath(`profile-${locked ? "locked" : "normal"}.png`),
      });
      await page.keyboard.press("Escape");
      await expect(panel).not.toBeVisible();
      await expect(access).toBeFocused();
      expect(
        await page.evaluate(
          () => document.querySelector('[role="timer"]') === (window as any).originalTimer,
        ),
      ).toBe(true);
      await expect(page.locator("[data-action=pause]")).toBeEnabled();
      await expect(page.locator(".lock-in-mode")).toHaveCount(locked ? 1 : 0);
      await expect(page.locator(".intention-surface textarea")).toHaveValue(
        "Keep this private draft",
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);

      // Header access must expose the real editor even when Focus view hides tools.
      await page.getByRole("tab", { name: "Focus", exact: true }).click();
      await page.getByRole("button", { name: "Focus options", exact: true }).click();
      await page.getByRole("button", { name: "Enter focus view", exact: true }).click();
      await access.click();
      await expect(panel).toBeVisible();
      await expect(panel.getByLabel("Profile display name", { exact: true })).toBeVisible();
      await expect(panel.getByLabel("Profile display name", { exact: true })).toBeFocused();
      await expect(panel.getByLabel("Profile display name", { exact: true })).toHaveValue(
        "Private profile draft",
      );
      expect(
        await page.evaluate(
          () => document.querySelector('[role="timer"]') === (window as any).originalTimer,
        ),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(access).toBeFocused();
      await expect(page.locator(".room-backdrop")).toHaveClass(/focus-view/);
      await page.getByRole("button", { name: "Exit focus view", exact: true }).click();
    }
    await page.getByRole("tab", { name: "Profile", exact: true }).click();
    await page.getByRole("button", { name: "Your profile", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Profile and account", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".study-profile")).toHaveCount(1);
  });

for (const width of [1366, 390])
  test(`${width} Escape outside an open profile preserves LOCKED IN and Focus view`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator("dialog[open]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByLabel("Your session intention", { exact: true }).fill("Outside Escape draft");
    await page.locator("[data-action=start]").click();
    await page.evaluate(() => {
      (window as any).outsideEscapeTimer = document.querySelector('[role="timer"]');
    });
    await page.locator("button.wordmark").click({ clickCount: 5, delay: 30 });
    await expect(page.locator(".lock-in-mode")).toBeVisible();
    await page.waitForTimeout(2100);
    const access = page.getByRole("button", { name: "Profile and account", exact: true });
    const panel = page.getByRole("dialog", { name: "Profile and account", exact: true });
    for (const focusView of [false, true]) {
      if (focusView) {
        await page.getByRole("tab", { name: "Focus", exact: true }).click();
        await page.getByRole("button", { name: "Focus options", exact: true }).click();
        await page.getByRole("button", { name: "Enter focus view", exact: true }).click();
      }
      await access.click();
      await expect(panel.getByLabel("Profile display name", { exact: true })).toBeFocused();
      for (
        let step = 0;
        step < 8 && !(await access.evaluate((node) => node === document.activeElement));
        step++
      )
        await page.keyboard.press("Shift+Tab");
      await expect(access).toBeFocused();
      await expect(panel).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(panel).not.toBeVisible();
      // Allow an unintended view-transition callback to run before asserting preservation.
      await page.waitForTimeout(500);
      await expect(page.locator(".lock-in-mode")).toHaveCount(1);
      await expect(page.locator(".room-backdrop")).toHaveClass(
        focusView ? /focus-view/ : /^(?!.*focus-view)/,
      );
      expect(
        await page.evaluate(
          () => document.querySelector('[role="timer"]') === (window as any).outsideEscapeTimer,
        ),
      ).toBe(true);
      await expect(page.locator("[data-action=pause]")).toBeEnabled();
      await expect(page.locator(".intention-surface textarea")).toHaveValue("Outside Escape draft");
    }
  });
