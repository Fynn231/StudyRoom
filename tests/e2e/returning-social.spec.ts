import { test, expect, chromium } from "@playwright/test";
import { resolve } from "node:path";
import { createServer } from "node:http";
async function enter(page: any) {
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Continue (?:to Study Room|last session)$/, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("timer")).toBeVisible();
}
test("returning home restores a paused checkpoint; focus view is reversible and never claims system DND", async ({
  page,
}, info) => {
  await enter(page);
  await page.getByLabel("Enable focus chime", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Start focus", exact: true }).click();
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "Pause focus", exact: true }).click();
  const before = await page.getByRole("timer").innerText();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Welcome back to your study room.",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("welcome-back.png") });
  await page.getByRole("button", { name: "Continue last session", exact: true }).click();
  await expect(page.getByRole("timer")).toHaveText(before);
  await expect(page.getByRole("button", { name: "Resume focus", exact: true })).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: /^Protect your focus$/ })
    .click();
  await page.getByRole("button", { name: "Enter focus view", exact: true }).click();
  await expect(page.locator(".focus-view")).toBeVisible();
  await expect(page.getByRole("button", { name: "Exit focus view", exact: true })).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText(before);
  await page.screenshot({ path: info.outputPath("focus-view.png") });
  await page.getByRole("button", { name: "Exit focus view", exact: true }).click();
  await expect(page.locator(".focus-view")).toHaveCount(0);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Welcome back to your study room.",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue last session", exact: true }).click();
  await expect(page.getByRole("timer")).toHaveText(before);
});
test("profiles are private until shared, scoped to room, editable without leaking drafts, and removable", async ({
  browser,
}, info) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  try {
    const p = await a.newPage(),
      q = await b.newPage();
    await enter(p);
    await p.getByRole("button", { name: "Party", exact: true }).click();
    await p.getByLabel("Your name", { exact: true }).fill("Cedar");
    await p.getByRole("button", { name: "Create room", exact: true }).click();
    const code = await p.getByLabel("Room code", { exact: true }).innerText();
    await q.goto("/?room=" + code);
    await q.getByLabel("Your name", { exact: true }).fill("Fern");
    await q.getByRole("button", { name: "Join room", exact: true }).click();
    await expect(q.locator(".people li")).toHaveCount(2);
    await expect(q.getByRole("region", { name: "What everyone is listening to" })).toContainText(
      "No listening status shared yet.",
    );
    await p
      .locator("summary")
      .filter({ hasText: /^Your Spotify listening status$/ })
      .click();
    await expect(
      p.getByRole("button", {
        name: "Share Spotify status with room",
        exact: true,
      }),
    ).toBeVisible();
    await p.getByRole("button", { name: "Profile and account", exact: true }).click();
    await p.getByLabel("Profile display name", { exact: true }).fill("Cedar the reader");
    await p.getByLabel("About your study space", { exact: true }).fill("One chapter at a time");
    await expect(q.locator(".people")).not.toContainText("Cedar the reader");
    await p.getByRole("button", { name: "Share profile with room", exact: true }).click();
    await expect(q.locator(".people")).toContainText("Cedar the reader");
    await expect(q.locator(".people")).toContainText("One chapter at a time");
    await p.getByLabel("About your study space", { exact: true }).fill("PRIVATE EDIT");
    await expect(q.locator(".people")).not.toContainText("PRIVATE EDIT");
    await q.getByText("View Cedar the reader’s profile", { exact: true }).click();
    await q.locator(".people").screenshot({ path: info.outputPath("room-profile.png") });
    await q.setViewportSize({ width: 390, height: 844 });
    await expect(
      q.getByRole("article", {
        name: "Cedar the reader's study profile",
        exact: true,
      }),
    ).toBeVisible();
    expect(await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
      true,
    );
    await q.locator(".people").screenshot({ path: info.outputPath("room-profile-phone.png") });
    await p.getByRole("button", { name: "Hide room profile", exact: true }).click();
    await expect(q.locator(".people")).not.toContainText("Cedar the reader");
  } finally {
    await a.close();
    await b.close();
  }
});
test("actual optional extension blocks a chosen synthetic site and Stop restores access in an isolated Chromium profile", async ({}, info) => {
  let fixtureHits = 0;
  const fixture = createServer((req, res) => {
    if (req.url === "/focus-fixture") fixtureHits++;
    res.setHeader("Cache-Control", "no-store");
    res.end("Synthetic focus blocker fixture");
  });
  await new Promise<void>((r) => fixture.listen(0, "127.0.0.1", r));
  const port = (fixture.address() as any).port;
  const path = resolve("extension");
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    executablePath: chromium.executablePath(),
    headless: true,
    args: [
      `--disable-extensions-except=${path}`,
      `--load-extension=${path}`,
      "--host-resolver-rules=MAP focus-blocker.test 127.0.0.1",
      "--proxy-bypass-list=focus-blocker.test",
    ],
  });
  context.setDefaultTimeout(10000);
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker", { timeout: 15000 }));
    const id = new URL(worker.url()).host;
    const target = await context.newPage();
    const fixtureUrl = `http://focus-blocker.test:${port}/focus-fixture`;
    await target.goto(fixtureUrl);
    await expect(target.locator("body")).toHaveText("Synthetic focus blocker fixture");
    const hitsBeforeBlocking = fixtureHits;
    // Exercise the conservative numeric ceiling using native DNR, not a mock.
    const capAcceptance = await worker.evaluate(async () => {
      const api = (globalThis as any).chrome;
      const id = 50000050;
      await api.declarativeNetRequest.updateSessionRules({
        addRules: [
          {
            id,
            priority: 1,
            action: { type: "block" },
            condition: { urlFilter: "||focus-blocker.test^", resourceTypes: ["main_frame"] },
          },
        ],
      });
      const accepted = (await api.declarativeNetRequest.getSessionRules()).some(
        (r: any) => r.id === id,
      );
      await api.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] });
      if ((await api.declarativeNetRequest.getSessionRules()).length)
        throw Error("Numeric probe cleanup failed");
      return accepted;
    });
    expect(capAcceptance).toBe(true);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.getByLabel("Website domains").fill("focus-blocker.test");
    await popup.getByLabel("Minutes", { exact: true }).fill("1");
    await popup.getByRole("button", { name: "Start blocking", exact: true }).click();
    await expect(popup.locator("#status")).toContainText("Blocking 1 selected sites");
    expect(
      await worker.evaluate(() =>
        (globalThis as any).chrome.declarativeNetRequest.getSessionRules(),
      ),
    ).toHaveLength(1);
    let blocked = false;
    try {
      await target.goto(fixtureUrl);
    } catch (error) {
      blocked = String(error).includes("ERR_BLOCKED_BY_CLIENT");
    }
    expect(blocked).toBe(true);
    expect(fixtureHits).toBe(hitsBeforeBlocking);
    await popup.screenshot({ path: info.outputPath("blocker-active.png") });
    const firstState = await worker.evaluate(async () => {
      const api = (globalThis as any).chrome;
      return {
        active: (await api.storage.local.get("active")).active,
        rules: await api.declarativeNetRequest.getSessionRules(),
        alarms: await api.alarms.getAll(),
      };
    });
    expect(firstState.rules.map((r: any) => r.id)).toEqual([51]);
    expect(firstState.alarms).toHaveLength(6);
    expect(firstState.active.generation).toBe(1);
    await popup.getByRole("button", { name: "Stop blocking now", exact: true }).click();
    await expect(popup.locator("#status")).toHaveText("Blocking is off.");
    expect(
      await worker.evaluate(() =>
        (globalThis as any).chrome.declarativeNetRequest.getSessionRules(),
      ),
    ).toEqual([]);
    expect(await worker.evaluate(() => (globalThis as any).chrome.alarms.getAll())).toEqual([]);
    await target.goto(fixtureUrl);
    await expect(target.locator("body")).toHaveText("Synthetic focus blocker fixture");
    expect(fixtureHits).toBeGreaterThan(hitsBeforeBlocking);

    // Native alarm loss is now fail-open plus visible warning, never repair.
    await popup.getByRole("button", { name: "Start blocking", exact: true }).click();
    await expect(popup.locator("#status")).toContainText("Blocking 1 selected sites");
    const lostAlarm = await worker.evaluate(async () => {
      const api = (globalThis as any).chrome;
      const alarms = await api.alarms.getAll();
      const alarm = alarms.find((a: any) => a.name.endsWith(":0"));
      if (!alarm) throw Error("No native expiry slot");
      await api.alarms.clear(alarm.name);
      return alarm.name;
    });
    await popup.getByRole("button", { name: "Check status", exact: true }).click();
    await expect(popup.locator("#status")).toContainText("Blocking safety could not be confirmed");
    await expect(popup.locator("#status")).toContainText("disable or remove");
    expect(
      await worker.evaluate(() =>
        (globalThis as any).chrome.declarativeNetRequest.getSessionRules(),
      ),
    ).toEqual([]);
    expect(await worker.evaluate(() => (globalThis as any).chrome.alarms.getAll())).toEqual([]);
    await target.goto(fixtureUrl);
    await expect(target.locator("body")).toHaveText("Synthetic focus blocker fixture");
    await popup.screenshot({ path: info.outputPath("blocker-missing-alarm-warning.png") });
    await popup.getByRole("button", { name: "Stop blocking now", exact: true }).click();
    await expect(popup.locator("#status")).toHaveText("Blocking is off.");

    // Preserve expired persisted-lease recovery coverage (not native expiry).
    await popup.getByRole("button", { name: "Start blocking", exact: true }).click();
    await expect(popup.locator("#status")).toContainText("Blocking 1 selected sites");
    await worker.evaluate(async () => {
      const api = (globalThis as any).chrome;
      const { active } = await api.storage.local.get("active");
      await api.storage.local.set({ active: { ...active, endsAt: Date.now() - 1 } });
    });
    await popup.getByRole("button", { name: "Check status", exact: true }).click();
    await expect(popup.locator("#status")).toHaveText("Blocking is off.");
    expect(
      await worker.evaluate(() =>
        (globalThis as any).chrome.declarativeNetRequest.getSessionRules(),
      ),
    ).toEqual([]);
    await target.goto(fixtureUrl);
    await expect(target.locator("body")).toHaveText("Synthetic focus blocker fixture");
    console.log(
      "NATIVE_STAGE_A",
      JSON.stringify({
        browser: context.browser()?.version(),
        capId: 50000050,
        capAcceptance,
        firstGeneration: firstState.active.generation,
        firstRuleIds: firstState.rules.map((r: any) => r.id),
        verifiedExpirySlots: firstState.alarms.length,
        lostAlarm,
        fixtureHits,
        observed: [
          "navigation-before",
          "ERR_BLOCKED_BY_CLIENT-during",
          "Stop-native-absence",
          "navigation-after-Stop",
          "missing-alarm-visible-warning",
          "navigation-after-fail-open",
          "expired-persisted-lease-release",
        ],
      }),
    );
  } finally {
    await context.close();
    fixture.closeAllConnections();
    await new Promise<void>((r) => fixture.close(() => r()));
  }
});

test("closing untouched tabs preserves the prior checkpoint; active reset still saves", async ({
  context,
}) => {
  const first = await context.newPage();
  await enter(first);
  await first.getByLabel("Enable focus chime", { exact: true }).uncheck();
  await first.getByLabel("Focus length", { exact: true }).fill("12");
  await first.getByRole("button", { name: "Start focus", exact: true }).click();
  await first.getByRole("button", { name: "Pause focus", exact: true }).click();
  const read = () => first.evaluate(() => localStorage.getItem("studyroom.timerCheckpoint.v1"));
  const saved = await read();
  expect(saved).toBeTruthy();
  const idle = await context.newPage();
  await idle.goto("/");
  await expect(idle.getByRole("dialog")).toBeVisible();
  // Continue last session deliberately restores the timer. Escape is an
  // untouched visit and must not replace the other tab's checkpoint.
  await idle.keyboard.press("Escape");
  await expect(idle.getByRole("dialog")).toHaveCount(0);
  await idle.goto("about:blank");
  await idle.close();
  expect(await read()).toBe(saved);
  const welcome = await context.newPage();
  await welcome.goto("/");
  await expect(
    welcome.getByRole("heading", { name: "Welcome back to your study room.", exact: true }),
  ).toBeVisible();
  await welcome.goto("about:blank");
  await welcome.close();
  expect(await read()).toBe(saved);
  await first.getByRole("button", { name: "Reset timer", exact: true }).click();
  await expect.poll(async () => JSON.parse((await read())!).remainingMs).toBe(720000);
  await expect(first.getByRole("timer")).toHaveText("12:00");
  await first.close();
});

test("device Focus confirmation is a visit-only self-report, never restored as OS permission", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Continue (?:to Study Room|last session)$/, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .locator("summary")
    .filter({ hasText: /^Protect your focus$/ })
    .click();
  const confirmation = page.getByRole("checkbox", {
    name: "I enabled my device’s Focus or Do Not Disturb myself for this session",
  });
  await expect(confirmation).not.toBeChecked();
  await confirmation.check();
  await expect(
    page.getByText("Recorded as your own confirmation for this visit only.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: /^Continue (?:to Study Room|last session)$/, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .locator("summary")
    .filter({ hasText: /^Protect your focus$/ })
    .click();
  await expect(confirmation).not.toBeChecked();
  await expect(
    page.getByText("Safari cannot display a permission prompt", { exact: false }),
  ).toBeVisible();
});
