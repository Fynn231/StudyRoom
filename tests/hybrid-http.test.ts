import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHybridHandler } from "../server/hybridPlanning.js";
import { AiCapacity } from "../server/aiCapacity.js";
import { PlanningProviderError } from "../server/qwenPlanning.js";
import { schedule } from "../src/planning/scheduler.js";
import type { PlanningInput } from "../src/planning/schema.js";
const input: PlanningInput = {
  tasks: [
    {
      id: "one",
      title: "Study one section",
      deadline: null,
      priority: 1,
      difficulty: 1,
      estimatedMinutes: 10,
      completedMinutes: 0,
    },
  ],
  objectives: [],
  windows: [{ start: "2026-11-03T10:00:00.000Z", end: "2026-11-03T10:30:00.000Z" }],
  preferences: { focusMinutes: 25, breakMinutes: 5 },
};
async function fixture(
  t: any,
  provider?: any,
  account?: import("../server/planningAccount.js").AccountConfig,
) {
  const capacity = new AiCapacity();
  const handler = createHybridHandler({
    hosted: true,
    origin: "https://study.example",
    capacity,
    provider,
    account,
  });
  // Synthetic verified identities supplied by the harness, never production HTTP headers.
  const server = createServer((req, res) => {
    const user = req.headers["x-fixture-user"];
    void handler(
      req,
      res,
      typeof user === "string" ? { user: { id: user }, token: "synthetic-token" } : undefined,
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as any).port}`;
  t.after(async () => {
    handler.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  });
  const post = (path: string, body: unknown, user = "A", extra: Record<string, string> = {}) =>
    fetch(origin + path, {
      method: "POST",
      headers: {
        Origin: "https://study.example",
        "Content-Type": "application/json",
        "x-fixture-user": user,
        ...extra,
      },
      body: JSON.stringify(body),
    });
  return { handler, post, origin };
}
test("hybrid routes reject absent authentication, cross origin, unknown owner fields, oversized data and missing consent", async (t) => {
  let called = 0;
  const { origin, post } = await fixture(t, {
    kind: "cloud-qwen",
    enhance: async () => {
      called++;
      throw Error();
    },
  });
  assert.equal((await fetch(origin + "/api/ai/hybrid/status")).status, 401);
  assert.equal(
    (
      await post("/api/ai/hybrid/enhance", { input, consent: true }, "A", {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
  assert.equal((await post("/api/ai/hybrid/enhance", { input, consent: false })).status, 400);
  assert.equal(
    (await post("/api/ai/hybrid/enhance", { input, consent: true, userId: "victim" })).status,
    400,
  );
  assert.equal(
    (await post("/api/ai/hybrid/enhance", { input, consent: true, padding: "x".repeat(25000) }))
      .status,
    413,
  );
  assert.equal(called, 0);
});
test("deterministic baseline remains operational without a provider or account schema", async (t) => {
  const { post } = await fixture(t);
  const response = await post("/api/ai/hybrid/baseline", { input });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).plan, schedule(input));
  assert.equal((await post("/api/ai/hybrid/enhance", { input, consent: true })).status, 503);
  assert.equal((await post("/api/ai/hybrid/account-plans", {})).status, 503);
});
test("two independent users may enhance concurrently, same-user duplication and excess concurrency are denied", async (t) => {
  const pending: (() => void)[] = [];
  const seen: string[] = [];
  const { post, handler } = await fixture(t, {
    kind: "cloud-qwen",
    enhance: async (value: PlanningInput) => {
      seen.push(value.tasks[0].title);
      await new Promise<void>((r) => pending.push(r));
      return {
        plan: schedule(value),
        verification: { model: "qwen/fixture:free", provider: "openrouter-qwen-free", cost: 0 },
      };
    },
  });
  const a = post("/api/ai/hybrid/enhance", { input, consent: true }, "A");
  const b = post(
    "/api/ai/hybrid/enhance",
    { input: { ...input, tasks: [{ ...input.tasks[0], title: "Private B" }] }, consent: true },
    "B",
  );
  for (let i = 0; i < 100 && pending.length < 2; i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(pending.length, 2);
  const duplicate = await post("/api/ai/hybrid/enhance", { input, consent: true }, "A");
  assert.equal(duplicate.status, 429);
  assert.ok(duplicate.headers.get("retry-after"));
  assert.equal((await post("/api/ai/hybrid/enhance", { input, consent: true }, "C")).status, 429);
  pending.forEach((r) => r());
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(ra.status, 200);
  assert.equal(rb.status, 200);
  const av = await ra.json(),
    bv = await rb.json();
  assert.equal(JSON.stringify(av).includes("Private B"), false);
  assert.equal(bv.plan.blocks[0].title, "Private B");
  assert.equal(handler.metrics().active, 0);
  assert.equal(seen.length, 2);
});
test("upstream Retry-After imposes shared cooldown without storing raw prompts or invoking paid fallback", async (t) => {
  let calls = 0;
  const { post, origin, handler } = await fixture(t, {
    kind: "cloud-qwen",
    enhance: async () => {
      calls++;
      throw new PlanningProviderError("upstream_capacity", 120, 429);
    },
  });
  const first = await post("/api/ai/hybrid/enhance", { input, consent: true }, "A");
  assert.equal(first.status, 429);
  assert.equal(first.headers.get("retry-after"), "120");
  const next = await post("/api/ai/hybrid/enhance", { input, consent: true }, "B");
  assert.equal(next.status, 429);
  assert.equal(calls, 1);
  const status = await (
    await fetch(origin + "/api/ai/hybrid/status", { headers: { "x-fixture-user": "B" } })
  ).json();
  assert.equal(status.lastIssue.reason, "upstream_capacity");
  assert.equal(JSON.stringify(status).includes("Study one section"), false);
  assert.equal(JSON.stringify(handler.metrics()).includes("A"), false);
});

test("account save succeeds only after exact owner-scoped readback; partial failures never destroy existing schedules", async (t) => {
  const saved = {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Reviewed schedule",
    input,
    plan: schedule(input),
  };
  const existing = {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Previously saved",
    payload: { input, plan: schedule(input) },
  };
  const original = structuredClone(existing);
  const stored = new Map([[existing.id, structuredClone(existing)]]);
  let mode = "missing";
  let posts = 0,
    reads = 0;
  const { post } = await fixture(t, undefined, {
    supabaseUrl: "https://synthetic.invalid",
    anonKey: "synthetic-publishable",
    fetch: async (url, init) => {
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer synthetic-token");
      if (init?.method === "POST") {
        posts++;
        const body = JSON.parse(String(init.body));
        assert.equal(body.user_id, "A");
        stored.set(body.id, { id: body.id, title: body.title, payload: body.payload });
        return new Response(null, { status: 201 });
      }
      assert.equal(init?.method, "GET", "confirmation must never delete or rewrite stored data");
      reads++;
      const query = new URL(String(url)).searchParams;
      assert.equal(query.get("user_id"), "eq.A");
      assert.equal(query.get("id"), `eq.${saved.id}`);
      assert.equal(query.get("limit"), "1");
      if (mode === "unavailable") return Response.json({}, { status: 503 });
      if (mode === "missing") return Response.json([]);
      const row = structuredClone(stored.get(saved.id)!);
      if (mode === "changed") row.title = "Unexpected different title";
      if (mode === "wrong-id") row.id = existing.id;
      if (mode === "invalid") row.payload.plan = { ...saved.plan, blocks: [] };
      return Response.json([row]);
    },
  });
  for (mode of ["missing", "unavailable", "changed", "wrong-id", "invalid", "confirmed"]) {
    const response = await post("/api/ai/hybrid/account-plans", saved);
    const value = await response.json();
    assert.equal(response.status, mode === "confirmed" ? 200 : 503, mode);
    assert.equal(value.saved === true, mode === "confirmed", mode);
    assert.deepEqual(
      stored.get(existing.id),
      original,
      "no compensating delete or overwrite of existing data",
    );
  }
  assert.equal(
    posts,
    1,
    "uncertain retries reconcile exact owner/ID and never overwrite a committed copy",
  );
  assert.equal(reads, 7, "six exact-ID preflights and the first insert's confirmation");
});
