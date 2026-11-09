import { test, expect } from "@playwright/test";

// Real app, local soundtrack, Web Audio graph and trusted browser interactions.
// Spotify status/SDK are SYNTHETIC boundaries, not OAuth, Premium or audible Spotify proof.
async function instrument(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    const probe = { active: 0, started: 0, closed: 0 };
    (window as any).__roomAudioProbe = probe;
    window.AudioContext = class extends Native {
      private sources = new Set<AudioBufferSourceNode>();
      createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source),
          stop = source.stop.bind(source);
        source.start = (...args: Parameters<typeof source.start>) => {
          start(...args);
          this.sources.add(source);
          probe.active++;
          probe.started++;
        };
        source.stop = (...args: Parameters<typeof source.stop>) => {
          if (this.sources.delete(source)) probe.active--;
          stop(...args);
        };
        return source;
      }
      close() {
        probe.active -= this.sources.size;
        this.sources.clear();
        probe.closed++;
        return super.close();
      }
    };
  });
}
const activity = (playing: boolean, observedAt = Date.now()) => ({
  title: "Deliberate synthetic track",
  artist: "Fixture artist",
  url: "https://open.spotify.com/track/0123456789ABCDEFGHIJKL",
  playing,
  observedAt,
  positionMs: 1000,
  durationMs: 180000,
});
test("owner Spotify playback closes actual soundtrack and rain; trusted gestures, Home, Focus and Lock In cannot restart", async ({
  page,
}) => {
  await instrument(page);
  let track: ReturnType<typeof activity> | null = null;
  let reads = 0;
  await page.route("**/api/music/spotify/listening", (route) => {
    reads++;
    return route.fulfill({ json: { track } });
  });
  await page.route("**/api/music/disconnect", (route) => route.fulfill({ json: { ok: true } }));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const room = page.locator(".ambience-panel");
  await room.locator(":scope > summary").click();
  await expect(room.getByRole("status")).toContainText("is playing.");
  await room.getByLabel("Optional rain").check();
  await expect
    .poll(() => page.evaluate(() => (window as any).__roomAudioProbe.active))
    .toBeGreaterThan(1);
  const before = await room.getByLabel("Music volume", { exact: true }).inputValue();
  await page.getByText("Your Spotify listening status", { exact: true }).click();
  const refresh = page.getByRole("button", { name: "Refresh listening status", exact: true });
  await refresh.click();
  await expect.poll(() => reads).toBe(1);
  await expect(room.getByRole("status")).toContainText("is playing.");
  track = activity(true, Date.now() - 100000);
  await refresh.click();
  await expect.poll(() => reads).toBe(2);
  await expect(room.getByRole("status")).toContainText("is playing.");
  track = activity(true);
  await refresh.click();
  await expect(room.getByRole("status")).toContainText("Pause Spotify or unload");
  await expect.poll(() => page.evaluate(() => (window as any).__roomAudioProbe.active)).toBe(0);
  await expect(room.getByRole("button", { name: "Play room audio", exact: true })).toBeDisabled();
  const stoppedStarts = await page.evaluate(() => (window as any).__roomAudioProbe.started);
  await page.getByRole("button", { name: "study room", exact: true }).click({ clickCount: 5 });
  // Each actual click is a mode gesture; no provider track is ever inferred.
  if (!(await page.locator(".lock-in-mode").count())) {
    for (let i = 0; i < 5; i++) await page.keyboard.press("l");
  }
  await expect(page.locator(".lock-in-mode")).toHaveCount(1);
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.locator(".music-panel")).not.toContainText(/AZALI|featured|ALTERED OBSIDIAN/i);
  await page.locator("button.wordmark").focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("n");
  await expect(page.locator(".lock-in-mode")).toHaveCount(0);
  await page.getByRole("tab", { name: "Focus", exact: true }).click();
  await page.getByRole("button", { name: "Focus options", exact: true }).click();
  await page.getByRole("button", { name: "Enter focus view", exact: true }).click();
  await expect(page.locator(".focus-view")).toHaveCount(1);
  await page.getByRole("button", { name: "Exit focus view", exact: true }).click();
  await room.getByRole("button", { name: "Show welcome again", exact: true }).click();
  await page.getByRole("button", { name: /Continue/, exact: false }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).__roomAudioProbe.active)).toBe(0);
  expect(await page.evaluate(() => (window as any).__roomAudioProbe.started)).toBe(stoppedStarts);
  await expect(room.getByLabel("Optional rain")).toBeChecked();
  await expect(room.getByLabel("Music volume", { exact: true })).toHaveValue(before);
  track = activity(false);
  // Polling is personal and independent from sharing. A focus refresh observes pause.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(room.getByRole("button", { name: "Play room audio", exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (window as any).__roomAudioProbe.active)).toBe(0);
  await room.getByRole("button", { name: "Play room audio", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__roomAudioProbe.active))
    .toBeGreaterThan(1);
  await refresh.click();
  track = activity(true);
  await refresh.click();
  await expect.poll(() => page.evaluate(() => (window as any).__roomAudioProbe.active)).toBe(0);
  await page.getByRole("button", { name: "Disconnect Spotify connection", exact: true }).click();
  await page.keyboard.press("Tab");
  await expect.poll(() => page.evaluate(() => (window as any).__roomAudioProbe.active)).toBe(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: ".test-output/audio-correction-stopped.png", fullPage: true });
});

test("synthetic SDK confirms playback only by state; deliberate embed switch stops room audio without claiming playback", async ({
  page,
}) => {
  await instrument(page);
  await page.addInitScript(() => {
    const listeners: Record<string, (state: any) => void> = {};
    (window as any).__sdkListeners = listeners;
    (window as any).Spotify = {
      Player: class {
        addListener(name: string, callback: (state: any) => void) {
          listeners[name] = callback;
          return true;
        }
        async connect() {
          return true;
        }
        async pause() {}
        disconnect() {}
        async activateElement() {}
        async togglePlay() {}
      },
    };
  });
  await page.route("**/api/music/status", (route) =>
    route.fulfill({
      json: {
        spotify: { ready: true, authorized: true, canPlay: true, blocker: null },
        apple: { ready: false, blocker: "Unavailable fixture" },
      },
    }),
  );
  await page.route("**/api/music/spotify/play", (route) =>
    route.fulfill({ json: { requested: true } }),
  );
  await page.route("https://open.spotify.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "Synthetic official embed boundary; no playback detected",
    }),
  );
  await page.goto("/");
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator(".ambience-panel > summary").click();
  const room = page.locator(".ambience-panel");
  await expect(room.getByRole("status")).toContainText("is playing.");
  await page.locator(".music-panel > summary").click();
  await page.getByText("Add a playlist or Spotify link", { exact: true }).click();
  await page
    .getByLabel("Spotify link", { exact: true })
    .fill("https://open.spotify.com/track/0123456789ABCDEFGHIJKL");
  await page.getByRole("button", { name: "Select music link", exact: true }).click();
  await page.getByText("Account-connected playback", { exact: true }).click();
  await page.getByRole("button", { name: "Play Spotify", exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!(window as any).__sdkListeners.ready)).toBe(true);
  await page.evaluate(() =>
    (window as any).__sdkListeners.ready({ device_id: "synthetic-device" }),
  );
  await expect(page.locator(".music-panel")).toContainText("Waiting for Spotify device state");
  await expect(room.getByRole("status")).toContainText("is playing.");
  await page.evaluate(() => (window as any).__sdkListeners.player_state_changed(null));
  await expect(room.getByRole("status")).toContainText("is playing.");
  await page.evaluate(() =>
    (window as any).__sdkListeners.player_state_changed({
      paused: false,
      position: 1000,
      duration: 180000,
      track_window: { current_track: { name: "Fixture track", artists: [] } },
    }),
  );
  await expect.poll(() => page.evaluate(() => (window as any).__roomAudioProbe.active)).toBe(0);
  await expect(room.getByRole("button", { name: "Play room audio", exact: true })).toBeDisabled();
  await page.evaluate(() =>
    (window as any).__sdkListeners.player_state_changed({
      paused: true,
      position: 1000,
      duration: 180000,
      track_window: { current_track: { name: "Fixture track", artists: [] } },
    }),
  );
  await expect(room.getByRole("button", { name: "Play room audio", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).__roomAudioProbe.active)).toBe(0);
  await room.getByRole("button", { name: "Play room audio", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__roomAudioProbe.active))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Load selected Spotify player", exact: true }).click();
  await expect(page.locator("iframe")).toHaveAttribute(
    "src",
    /embed\/track\/0123456789ABCDEFGHIJKL/,
  );
  await expect.poll(() => page.evaluate(() => (window as any).__roomAudioProbe.active)).toBe(0);
  await expect(page.locator(".music-panel")).toContainText("Loading does not confirm playback");
  await expect(room.getByRole("button", { name: "Play room audio", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Unload Spotify player", exact: true }).click();
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(room.getByRole("button", { name: "Play room audio", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).__roomAudioProbe.active)).toBe(0);
});
