import { test, expect } from "@playwright/test";

test("distinct pages retain live timer, intention and music owners; history works", async ({
  page,
}) => {
  const errors: string[] = [];
  const mutations: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() === "POST" && !request.url().includes("socket.io"))
      mutations.push(request.url());
  });
  await page.goto("/?view=study");
  await page
    .getByLabel("Your session intention", { exact: true })
    .fill("Synthetic private route draft");
  await page.getByLabel("Focus length", { exact: true }).fill("37");
  await page.locator('[data-action="start"]').click();
  await page.evaluate(() => {
    (window as any).retainedTimer = document.querySelector('[role="timer"]');
    (window as any).retainedMusic = document.querySelector(".music-panel");
  });
  const nav = page.getByRole("navigation", { name: "Workspace" });
  await nav.getByRole("link", { name: "Plan", exact: true }).click();
  await expect(page.getByRole("timer")).not.toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Plan your next step.");
  await page.goBack();
  await expect(page.locator('[data-action="pause"]')).toBeVisible();
  await expect(page.getByLabel("Your session intention", { exact: true })).toHaveValue(
    "Synthetic private route draft",
  );
  await page.goForward();
  await expect(page).toHaveURL(/view=plan/);
  for (const name of ["Music", "Together", "Progress", "Guide", "Study"])
    await nav.getByRole("link", { name, exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        (window as any).retainedTimer === document.querySelector('[role="timer"]') &&
        (window as any).retainedMusic === document.querySelector(".music-panel"),
    ),
  ).toBe(true);
  expect(mutations).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: ".test-output/navigation-study-desktop.png", fullPage: true });
});

test("deep links, literal invalid invites, refresh and query fallbacks", async ({ page }) => {
  for (const query of ["view=unknown", "view=plan&view=music", "view=%70lan&view=study"]) {
    await page.goto(`/?${query}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("One thing at a time.");
  }
  await page.goto("/?view=plan&room=AB%43DEF");
  await expect(page.getByRole("alert")).toContainText("Invalid invite");
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("link", { name: "Music", exact: true })
    .click();
  expect(page.url()).toContain("room=AB%43DEF");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A soundtrack, on your terms.");
  await expect(page.getByRole("alert")).toContainText("Invalid invite");
});

test("phone walkthrough uses actual controls, stays optional, and causes no overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore features & walkthrough" }).click();
  await page.getByRole("button", { name: "Start walkthrough" }).click();
  await page.getByLabel("Focus length", { exact: true }).fill("19");
  await expect(page.getByRole("timer")).toHaveText("19:00");
  for (let step = 0; step < 5; step++)
    await page.getByRole("button", { name: "Next step" }).click();
  await page.getByRole("button", { name: "Finish walkthrough" }).click();
  await expect(page.locator('[data-action="start"]')).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText("19:00");
  const nav = page.getByRole("navigation", { name: "Workspace" });
  for (const name of ["Study", "Plan", "Music", "Together", "Progress", "Guide"]) {
    await nav.getByRole("link", { name, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `.test-output/navigation-${name.toLowerCase()}-phone.png`,
      fullPage: true,
    });
  }
});

test("repaired literal invites retain Together on Back and reject decoded duplicates", async ({
  page,
}) => {
  await page.goto("/?room=ABC123");
  if (await page.locator("dialog[open]").isVisible()) await page.keyboard.press("Escape");
  const nav = page.getByRole("navigation", { name: "Workspace" });
  await expect(nav.getByRole("link", { name: "Together", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await nav.getByRole("link", { name: "Music", exact: true }).click();
  await page.goBack();
  await expect(nav.getByRole("link", { name: "Together", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(new URL(page.url()).search).toBe("?room=ABC123");
  await page.goto("/?room=ABC123&r%6fom=DEF456&raw=AB%43DEF&&note=a+b#keep");
  await expect(nav.getByRole("link", { name: "Study", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await nav.getByRole("link", { name: "Music", exact: true }).click();
  expect(new URL(page.url()).search).toBe(
    "?room=ABC123&r%6fom=DEF456&raw=AB%43DEF&&note=a+b&view=music",
  );
});

test("repaired walkthrough keyboard dismissals focus the visible current page", async ({
  page,
}) => {
  await page.goto("/?view=guide");
  if (await page.locator("dialog[open]").isVisible()) await page.keyboard.press("Escape");
  const nav = page.getByRole("navigation", { name: "Workspace" });
  for (const destination of ["study", "plan"]) {
    for (const name of ["Skip walkthrough", "Close walkthrough"]) {
      await nav.getByRole("link", { name: "Guide", exact: true }).click();
      const start = page.getByRole("button", { name: "Start walkthrough", exact: true });
      await start.focus();
      await page.keyboard.press("Enter");
      if (destination === "plan")
        await page.getByRole("button", { name: "Next step", exact: true }).click();
      const close = page.getByRole("button", { name, exact: true });
      await close.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(`[data-page-heading="${destination}"]`)).toBeFocused();
      await expect(page.locator(`[data-page-heading="${destination}"]`)).toBeVisible();
    }
  }
});

test("repaired browser Back cancels an unfinished guide profile activation", async ({ page }) => {
  await page.goto("/?view=study");
  if (await page.locator("dialog[open]").isVisible()) await page.keyboard.press("Escape");
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("link", { name: "Guide", exact: true })
    .click();
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  await page.goBack();
  await expect(page.locator('[data-page-heading="study"]')).toBeFocused();
  await page.waitForTimeout(2400);
  await expect(page.locator('[data-page-heading="study"]')).toBeFocused();
  await expect(page.locator(".profile-account-button")).toHaveAttribute("aria-expanded", "false");
});

test("expanded Plan fits the 320px client viewport without mobile widening", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/?view=plan");
  await page.locator(".hybrid-planner > summary").click();
  const geometry = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(geometry.client).toBe(320);
  expect(geometry.scroll).toBe(geometry.client);
});

test("Music headings retain a complete hierarchy when playback options are expanded", async ({
  page,
}) => {
  await page.goto("/?view=music");
  const panel = page.locator(".music-panel");
  if ((await panel.getAttribute("open")) === null) await panel.locator(":scope > summary").click();
  for (let pass = 0; pass < 3; pass++)
    for (const details of await panel.locator("details:visible").all())
      if ((await details.getAttribute("open")) === null)
        await details.locator(":scope > summary").click();
  await expect(page.locator(".spotify-device-player h3")).toBeVisible();
  const levels = await page
    .getByRole("heading")
    .evaluateAll((headings) => headings.map((heading) => Number(heading.tagName.slice(1))));
  let previous = 0;
  for (const level of levels) {
    expect(level, `Heading h${level} after h${previous}`).toBeLessThanOrEqual(previous + 1);
    previous = level;
  }
});

test("duration help is at least 12px on the Study page", async ({ page }) => {
  await page.goto("/?view=study");
  const help = page.locator(".duration-field small");
  await expect(help).toBeVisible();
  expect(
    await help.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(12);
});

test("Quick Guide disclosure has a 44px touch target", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?view=guide");
  const summary = page.locator(".quick-guide > summary");
  await expect(summary).toBeVisible();
  const rect = await summary.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.height).toBeGreaterThanOrEqual(44);
  expect(rect!.width).toBeGreaterThanOrEqual(44);
});
