import { test, expect } from "@playwright/test";
test("synthetic hosted direct planning flows from both buttons and Home preserves the reviewed plan", async ({
  page,
}, info) => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(
      JSON.stringify({
        sub: "11111111-1111-4111-8111-111111111111",
        exp,
        session_id: "synthetic-session",
      }),
    ).toString("base64url"),
    "synthetic",
  ].join(".");
  await page.addInitScript(
    ({ token, exp }) =>
      localStorage.setItem(
        "sb-synthetic-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "synthetic-refresh",
          expires_at: exp,
          expires_in: 3600,
          token_type: "bearer",
          user: {
            id: "11111111-1111-4111-8111-111111111111",
            email: "synthetic@example.invalid",
            aud: "authenticated",
            app_metadata: {},
            user_metadata: {},
            created_at: "2026-01-01T00:00:00Z",
          },
        }),
      ),
    { token, exp },
  );
  await page.route("**/api/config", (r) =>
    r.fulfill({
      json: {
        mode: "hosted",
        auth: {
          required: true,
          url: "https://synthetic.supabase.co",
          anonKey: "sb_publishable_synthetic",
          publicOrigin: "http://127.0.0.1:4285",
        },
      },
    }),
  );
  await page.route("**/api/session", (r) => r.fulfill({ json: { ok: true } }));
  await page.route("**/api/ai/status", (r) =>
    r.fulfill({ json: { configured: true, liveVerified: false } }),
  );
  const requests: any[] = [];
  await page.route("**/api/ai/plan", (r) => {
    const request = r.request().postDataJSON();
    requests.push(request);
    return requests.length === 1
      ? r.fulfill({
          json: {
            requestId: request.requestId,
            plan: {
              objectives: ["Review one chapter"],
              steps: [
                {
                  title: "Explain one idea",
                  instructions: "Write one explanation.",
                  estimatedMinutes: 5,
                  sourceIds: [request.sources[0].id],
                },
              ],
              questions: [],
            },
          },
        })
      : r.fulfill({ status: 429, json: { error: "Synthetic free capacity limit" } });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Continue (?:to Study Room|last session)$/, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Your session intention", { exact: true }).fill("Review one chapter");
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "Plan session", exact: true }).click();
  await expect(page.getByRole("region", { name: "Session planning", exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: "Use reviewed plan", exact: true })).toBeVisible();
  expect(requests).toHaveLength(1);
  await page.screenshot({ path: info.outputPath("direct-ai-review.png") });
  await page.getByRole("button", { name: "Use reviewed plan", exact: true }).click();
  await page.getByRole("checkbox", { name: "Explain one idea", exact: true }).check();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: /^Continue (?:to Study Room|last session)$/, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Explain one idea", exact: true })).toBeChecked();
  expect(requests).toHaveLength(1);
  await page
    .getByRole("button", { name: "study room", exact: true })
    .click({ clickCount: 5, delay: 30 });
  await page.getByRole("button", { name: "Define protocol", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "rate-limited" })).toBeVisible();
  expect(requests).toHaveLength(2);
  await expect(page.getByRole("checkbox", { name: "Explain one idea", exact: true })).toBeChecked();
  await expect(page.getByRole("timer")).toHaveText("25:00");
});
