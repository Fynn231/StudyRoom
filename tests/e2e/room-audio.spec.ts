import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
async function observe(page: Page, blocked = false) {
  await page.addInitScript((blocked) => {
    const w = window as any;
    w.__roomAudio = { contexts: [], sources: [], resumes: [], ramps: [] };
    w.__allowResume = !blocked;
    const Base = window.AudioContext;
    window.AudioContext = class extends Base {
      constructor(...args: any[]) {
        super(...(args as []));
        w.__roomAudio.contexts.push(this);
        if (blocked) void this.suspend();
      }
      resume() {
        w.__roomAudio.resumes.push({
          active: navigator.userActivation.isActive,
          time: this.currentTime,
        });
        return w.__allowResume ? super.resume() : new Promise<void>(() => {});
      }
      createGain() {
        const gain = super.createGain();
        if (!w.__roomAudio.master) w.__roomAudio.master = gain;
        const set = gain.gain.setTargetAtTime.bind(gain.gain);
        gain.gain.setTargetAtTime = (value, time, constant) => {
          w.__roomAudio.ramps.push({ value, time, constant });
          return set(value, time, constant);
        };
        return gain;
      }
      createBufferSource() {
        const source = super.createBufferSource();
        w.__roomAudio.sources.push(source);
        return source;
      }
    } as any;
  }, blocked);
}
const entry = (page: Page) =>
  page.getByRole("button", { name: /^Continue (?:to Study Room|last session)$/ });
async function panel(page: Page) {
  await page.locator(".ambience-panel > summary").click();
}
async function gain(page: Page) {
  return page.evaluate(() => (window as any).__roomAudio.master.gain.value);
}
test("default-policy audio entry, native music readiness, welcome mute and navigation never duplicate", async ({
  page,
}, info) => {
  await observe(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Skip welcome" })).toHaveCount(0);
  await expect(page.getByText(/Enter quietly/)).toHaveCount(0);
  await expect(entry(page)).toBeFocused();
  await expect.poll(() => page.evaluate(() => (window as any).__roomAudio.contexts.length)).toBe(1);
  const initial = await page.locator(".welcome-sound [role=status]").textContent();
  await page.getByRole("button", { name: "Mute room audio", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unmute room audio", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await entry(page).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await panel(page);
  await page.getByRole("button", { name: "Unmute room audio", exact: true }).click();
  await expect(
    page.getByText("Wind over the Reading Terrace is playing.", { exact: true }),
  ).toBeVisible();
  // Wait on the AudioContext clock and actual gain readiness, not wall-clock sleeps.
  await expect.poll(() => gain(page)).toBeGreaterThan(0.29);
  const normal = await gain(page);
  const source = await page.evaluate(() => {
    const a = (window as any).__roomAudio;
    return {
      count: a.sources.length,
      duration: a.sources[0].buffer.duration,
      loop: a.sources[0].loop,
      time: a.contexts[0].currentTime,
      resumes: a.resumes,
    };
  });
  expect(source.count).toBe(1);
  expect(source.duration).toBeCloseTo(120, 4);
  expect(source.loop).toBe(true);
  expect(source.resumes.some((r: any) => r.active)).toBe(true);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => document.querySelector("dialog")!.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator(".focus-setup > summary").click();
  await page.getByRole("button", { name: "Enter focus view", exact: true }).click();
  await page.getByRole("button", { name: "Exit focus view", exact: true }).click();
  await page
    .getByRole("button", { name: "study room", exact: true })
    .click({ clickCount: 5, delay: 30 });
  await expect.poll(() => gain(page)).toBeLessThan(normal * 0.4);
  await page.getByRole("button", { name: "Return to normal mode", exact: true }).click();
  await expect.poll(() => gain(page)).toBeGreaterThan(normal * 0.95);
  await page.getByLabel("Optional rain", { exact: true }).check();
  await expect.poll(() => page.evaluate(() => (window as any).__roomAudio.sources.length)).toBe(4);
  await page.getByLabel("Optional rain", { exact: true }).uncheck();
  expect(await page.evaluate(() => (window as any).__roomAudio.contexts.length)).toBe(1);
  const final = await page.evaluate(() => {
    const a = (window as any).__roomAudio;
    return { time: a.contexts[0].currentTime, ramps: a.ramps, resumes: a.resumes };
  });
  expect(final.time).toBeGreaterThan(source.time);
  await page.getByRole("button", { name: "Stop room audio", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__roomAudio.contexts[0].state))
    .toBe("closed");
  await page.reload();
  await expect(page.getByRole("button", { name: "Mute room audio", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__roomAudio.contexts.length)).toBe(0);
  await entry(page).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__roomAudio.contexts.length)).toBe(0);
  await info.attach("audio-clock-and-ramp-readiness.json", {
    body: JSON.stringify({ initial, normal, source, final }, null, 2),
    contentType: "application/json",
  });
});
test("blocked unresolved resume remains truthful and Continue is never blocked", async ({
  page,
}) => {
  await observe(page, true);
  await page.goto("/");
  await expect(page.locator(".welcome-sound [role=status]")).toContainText(
    "paused by your browser",
  );
  await entry(page).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await panel(page);
  await expect(page.getByRole("button", { name: "Play room audio", exact: true })).toBeEnabled();
  await page.evaluate(() => ((window as any).__allowResume = true));
  await page.getByRole("button", { name: "Play room audio", exact: true }).click();
  await expect(
    page.getByText("Wind over the Reading Terrace is playing.", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).__roomAudio.sources.length)).toBe(1);
  await page.evaluate(() => (window as any).__roomAudio.contexts[0].suspend());
  await expect(page.locator(".ambience-panel [role=status]")).toContainText(
    "paused by your browser",
  );
  await page.getByRole("button", { name: "Play room audio", exact: true }).click();
  await expect(
    page.getByText("Wind over the Reading Terrace is playing.", { exact: true }),
  ).toBeVisible();
});
test("saved muted v1 never autoplays on Continue; unmute explicitly starts", async ({ page }) => {
  await observe(page);
  await page.addInitScript(() =>
    localStorage.setItem("studyroom.ambience.v1", JSON.stringify({ volume: 0.2, muted: true })),
  );
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Unmute room audio", exact: true })).toBeVisible();
  await entry(page).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__roomAudio.contexts.length)).toBe(0);
  await panel(page);
  await page.getByRole("button", { name: "Unmute room audio", exact: true }).click();
  await expect(
    page.getByText("Wind over the Reading Terrace is playing.", { exact: true }),
  ).toBeVisible();
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
  await expect(page.locator(".welcome-sound [role=status]")).toContainText("unavailable");
  await entry(page).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await panel(page);
  await page.getByRole("button", { name: "Play room audio", exact: true }).click();
  await expect(page.locator(".ambience-panel [role=status]")).toContainText("unavailable");
  await expect(page.getByRole("timer")).toHaveText("25:00");
});
test("missing asset reports unavailable without trapping entry or retry", async ({ page }) => {
  let requests = 0;
  await page.route("**/audio/whimsical-study-loop.mp3", (r) => {
    requests++;
    return r.fulfill({ status: 404, body: "missing test asset" });
  });
  await page.goto("/");
  await expect(page.locator(".welcome-sound [role=status]")).toContainText("unavailable");
  await entry(page).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await panel(page);
  await expect(page.getByRole("button", { name: "Play room audio", exact: true })).toBeEnabled();
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "Play room audio", exact: true }).click();
  await expect.poll(() => requests).toBe(2);
  await expect(page.locator(".ambience-panel [role=status]")).toContainText("unavailable");
  await expect(page.getByRole("timer")).toHaveText("25:00");
});

for (const permitted of [false, true]) {
  test(`direct room entry audits ${permitted ? "policy-permitted autoplay" : "blocked gesture recovery"} without a welcome or timer start`, async ({
    page,
  }, info) => {
    await observe(page, !permitted);
    if (permitted) {
      await page.goto("/healthz");
      await page.locator("body").click();
    }
    await page.goto("/?room=ABC123");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByLabel("Your name", { exact: true })).toBeVisible();
    await panel(page);
    if (!permitted) {
      await expect(page.locator(".ambience-panel [role=status]")).toContainText(
        "paused by your browser",
      );
      await page.evaluate(() => ((window as any).__allowResume = true));
      await page.getByLabel("Your name", { exact: true }).click();
    }
    await expect(page.locator(".ambience-panel [role=status]")).toContainText(
      "Wind over the Reading Terrace is playing.",
    );
    await expect.poll(() => gain(page)).toBeGreaterThan(0.29);
    await expect(page.getByRole("timer")).toHaveText("25:00");
    await expect(page.getByRole("button", { name: "Join room", exact: true })).toBeEnabled();
    const data = await page.evaluate(() => {
      const a = (window as any).__roomAudio;
      return {
        contexts: a.contexts.length,
        sources: a.sources.length,
        duration: a.sources[0].buffer.duration,
        loop: a.sources[0].loop,
        resumes: a.resumes,
      };
    });
    expect(data.contexts).toBe(1);
    expect(data.sources).toBe(1);
    expect(data.duration).toBeCloseTo(120, 4);
    expect(data.loop).toBe(true);
    await info.attach("direct-entry-audio", {
      body: JSON.stringify(data, null, 2),
      contentType: "application/json",
    });
  });
}

test("policy-permitted welcome autoplay can be silenced before entry", async ({ page }, info) => {
  await observe(page);
  // Establish genuine same-origin browser interaction, not an autoplay-policy launch flag.
  await page.goto("/healthz");
  await page.locator("body").click();
  await page.goto("/");
  await expect(page.locator(".welcome-sound [role=status]")).toHaveText(
    "Wind over the Reading Terrace is playing.",
  );
  await expect.poll(() => gain(page)).toBeGreaterThan(0.29);
  await page.getByRole("button", { name: "Mute room audio", exact: true }).click();
  await expect.poll(() => gain(page)).toBeLessThan(0.001);
  await expect(page.getByRole("dialog")).toBeVisible();
  const observation = await page.evaluate(() => ({
    state: (window as any).__roomAudio.contexts[0].state,
    count: (window as any).__roomAudio.contexts.length,
    volume: (window as any).__roomAudio.master.gain.value,
  }));
  expect(observation.state).toBe("running");
  expect(observation.count).toBe(1);
  await page.screenshot({ path: info.outputPath("welcome-permitted-autoplay-muted.png") });
  await info.attach("permitted-autoplay.json", {
    body: JSON.stringify(observation),
    contentType: "application/json",
  });
});
