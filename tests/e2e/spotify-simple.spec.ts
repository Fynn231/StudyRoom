import { test, expect } from "@playwright/test";
// Synthetic Spotify adapter/UI proof only; never real provider/audio verification.
test("Spotify has one main control, opens consent directly, and plays a newly selected playlist", async ({
  page,
  context,
}, info) => {
  let authorized = false;
  const plays: any[] = [];
  await context.route("https://accounts.spotify.com/**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "Synthetic consent fixture — no actual Spotify permission granted",
    }),
  );
  await page.route("**/api/music/status", (r) =>
    r.fulfill({
      json: {
        spotify: {
          ready: true,
          authorized,
          canPlay: authorized,
          blocker: null,
        },
        apple: { ready: false, blocker: "unavailable" },
      },
    }),
  );
  await page.route("**/api/music/spotify/begin", (r) =>
    r.fulfill({
      json: { url: "https://accounts.spotify.com/authorize?state=synthetic" },
    }),
  );
  await page.route("**/api/music/spotify/token", (r) =>
    r.fulfill({
      json: { access_token: "SYNTHETIC_ONLY", expiresAt: Date.now() + 60000 },
    }),
  );
  await page.route("**/api/music/spotify/play", (r) => {
    plays.push(r.request().postDataJSON());
    return r.fulfill({ json: { requested: true } });
  });
  await page.addInitScript(() => {
    class FixturePlayer {
      listeners: Record<string, (v: any) => void> = {};
      paused = false;
      constructor(public options: any) {
        window.addEventListener("fixture:spotify-state", (e: any) =>
          this.listeners.player_state_changed?.(e.detail),
        );
        window.addEventListener("fixture:spotify-offline", () => this.listeners.not_ready?.({}));
      }
      addListener(name: string, fn: (v: any) => void) {
        this.listeners[name] = fn;
        return true;
      }
      async connect() {
        this.options.getOAuthToken(() => {});
        queueMicrotask(() => this.listeners.ready?.({ device_id: "fixture-device" }));
        return true;
      }
      async activateElement() {}
      async pause() {}
      disconnect() {}
      async togglePlay() {
        this.paused = !this.paused;
        this.listeners.player_state_changed?.({
          paused: this.paused,
          position: 12000,
          duration: 180000,
          track_window: {
            current_track: {
              name: "Synthetic song",
              artists: [{ name: "Synthetic artist" }],
            },
          },
        });
      }
    }
    (window as any).Spotify = { Player: FixturePlayer };
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Continue (?:to Study Room|last session)$/, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .locator("summary")
    .filter({ hasText: /^Music$/ })
    .click();
  await page
    .locator("summary")
    .filter({ hasText: /^Account-connected playback$/ })
    .click();
  const panel = page
    .locator(".music-custom")
    .filter({ has: page.locator(".spotify-device-player") });
  await expect(panel.getByRole("button", { name: "Connect Spotify", exact: true })).toBeEnabled();
  const visibleButtons = () => panel.getByRole("button").filter({ visible: true });
  await expect(visibleButtons()).toHaveCount(1);
  const opened = context.waitForEvent("page");
  await panel.getByRole("button", { name: "Connect Spotify", exact: true }).click();
  const consent = await opened;
  await expect(consent).toHaveURL(/accounts.spotify.com\/authorize/);
  await expect(consent.locator("body")).toContainText("Synthetic consent fixture");
  await expect(page).toHaveURL("http://127.0.0.1:4285/");
  await consent.close();
  authorized = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(panel.getByRole("button", { name: "Play Spotify", exact: true })).toBeEnabled();
  await panel.getByRole("button", { name: "Play Spotify", exact: true }).click();
  await expect.poll(() => plays.length).toBe(1);
  await expect(panel.getByRole("button", { name: "Pause Spotify", exact: true })).toHaveCount(0);
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("fixture:spotify-state", {
        detail: {
          paused: false,
          position: 12000,
          duration: 180000,
          track_window: {
            current_track: {
              name: "Synthetic song",
              artists: [{ name: "Synthetic artist" }],
            },
          },
        },
      }),
    ),
  );
  await expect(panel.getByRole("button", { name: "Pause Spotify", exact: true })).toBeVisible();
  await expect(visibleButtons()).toHaveCount(1);
  await panel.getByRole("button", { name: "Pause Spotify", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Resume Spotify", exact: true })).toBeVisible();
  await panel.screenshot({
    path: info.outputPath("spotify-simple-desktop.png"),
  });
  for (let i = 0; i < 5; i++) await page.locator(".wordmark").click();
  await expect(page.locator(".lock-in-mode")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Resume Spotify", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.screenshot({ path: info.outputPath("spotify-simple-phone.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .locator("summary")
    .filter({ hasText: /^Add a playlist or Spotify link$/ })
    .click();
  const playlist = "https://open.spotify.com/playlist/37i9dQZF1DX8NTLI2TtZa6";
  await page.getByLabel("Spotify link", { exact: true }).fill(playlist);
  await page.getByRole("button", { name: "Select music link", exact: true }).click();
  expect(plays.length).toBe(1);
  await panel.getByRole("button", { name: "Play Spotify", exact: true }).click();
  await expect.poll(() => plays.at(-1)?.url).toBe(playlist);
  await page.evaluate(() => window.dispatchEvent(new Event("fixture:spotify-offline")));
  await expect(panel.getByRole("button", { name: "Play Spotify", exact: true })).toBeEnabled();
});
