import { test, expect } from "@playwright/test";

// Real Study Room browser interaction with a synthetic provider boundary only.
// This fixture never grants Spotify consent and is not real OAuth/audio proof.
test("listening Connect opens read-only consent directly without playback takeover or lost work", async ({
  page,
  context,
}) => {
  const playbackRequests: string[] = [];
  const sdkRequests: string[] = [];
  let begins = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (/^\/api\/music\/spotify\/(?:token|play)$/.test(url.pathname))
      playbackRequests.push(url.pathname);
    if (url.hostname === "sdk.scdn.co") sdkRequests.push(url.pathname);
  });
  await context.route("https://accounts.spotify.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "Synthetic listening consent fixture. No real Spotify permission granted.",
    }),
  );
  await page.route("**/api/music/spotify/begin?purpose=listening", (route) => {
    expect(route.request().method()).toBe("POST");
    begins++;
    return route.fulfill({
      json: {
        url: "https://accounts.spotify.com/authorize?state=synthetic-listening-test",
      },
    });
  });
  await page.goto("/");
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("spinbutton", { name: "Focus length", exact: true }).fill("37");
  await page
    .getByLabel("Your session intention", { exact: true })
    .fill("Private listening test draft");
  await page.getByText("Your Spotify listening status", { exact: true }).click();
  const opened = context.waitForEvent("page", { timeout: 5000 });
  await page.getByRole("button", { name: "Connect Spotify listening status", exact: true }).click();
  const consent = await opened;
  await expect(consent).toHaveURL(/^https:\/\/accounts\.spotify\.com\/authorize\?/);
  await expect(consent.locator("body")).toContainText("Synthetic listening consent fixture");
  await expect.poll(() => begins).toBe(1);
  await expect(page).toHaveURL("http://127.0.0.1:4285/");
  await expect(page.getByRole("timer")).toHaveText("37:00");
  await expect(page.getByLabel("Your session intention", { exact: true })).toHaveValue(
    "Private listening test draft",
  );
  expect(playbackRequests).toEqual([]);
  expect(sdkRequests).toEqual([]);
  await consent.close();
});

test("disconnect cancels a pending consent window and ignores its late response", async ({
  page,
  context,
}) => {
  let release!: () => void;
  let started!: () => void;
  const responseGate = new Promise<void>((resolve) => (release = resolve));
  const requestStarted = new Promise<void>((resolve) => (started = resolve));
  await context.route("https://accounts.spotify.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "Synthetic consent must not open after disconnect",
    }),
  );
  await page.route("**/api/music/spotify/begin?purpose=listening", async (route) => {
    started();
    await responseGate;
    await route
      .fulfill({
        json: { url: "https://accounts.spotify.com/authorize?state=synthetic-late-response" },
      })
      .catch(() => {}); // Aborting the actual fetch can invalidate the held fixture route.
  });
  await page.route("**/api/music/disconnect", (route) => route.fulfill({ json: { ok: true } }));
  await page.goto("/");
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByText("Your Spotify listening status", { exact: true }).click();
  const opened = context.waitForEvent("page");
  await page.getByRole("button", { name: "Connect Spotify listening status", exact: true }).click();
  const consent = await opened;
  await requestStarted;
  try {
    await page.getByRole("button", { name: "Disconnect Spotify connection", exact: true }).click();
    await expect(page.locator(".spotify-presence [role=status]")).toContainText(
      "Spotify disconnected from Study Room",
    );
    await expect.poll(() => consent.isClosed(), { timeout: 3000 }).toBe(true);
    release();
    await expect(
      page.getByRole("link", { name: "Continue listening connection in Spotify" }),
    ).toHaveCount(0);
    await expect(page.locator(".spotify-presence [role=status]")).toContainText(
      "Spotify disconnected from Study Room",
    );
  } finally {
    release();
    if (!consent.isClosed()) await consent.close();
  }
});
