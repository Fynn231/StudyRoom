import { test } from "node:test";
import assert from "node:assert/strict";
import { schedule, applyEnhancement, validateScheduledPlan } from "../src/planning/scheduler.js";
import { validatePlanningInput, type PlanningInput } from "../src/planning/schema.js";
import { AiCapacity, CapacityError } from "../server/aiCapacity.js";
import {
  cloudQwen,
  freeQwenModels,
  PlanningProviderError,
  retrySeconds,
} from "../server/qwenPlanning.js";
import { accountPlans } from "../server/planningAccount.js";

export const input: PlanningInput = {
  tasks: [
    {
      id: "essay",
      title: "Explain photosynthesis",
      deadline: "2026-11-03T12:00:00.000Z",
      priority: 3,
      difficulty: 3,
      estimatedMinutes: 45,
      completedMinutes: 10,
    },
    {
      id: "review",
      title: "Recall key terms",
      deadline: null,
      priority: 1,
      difficulty: 1,
      estimatedMinutes: 10,
      completedMinutes: 0,
    },
  ],
  objectives: ["Explain the cycle from memory"],
  windows: [{ start: "2026-11-03T10:00:00.000Z", end: "2026-11-03T11:00:00.000Z" }],
  preferences: { focusMinutes: 25, breakMinutes: 5 },
};
const clone = () => structuredClone(input);
const catalog = {
  data: [
    {
      id: "qwen/fixture:free",
      pricing: { prompt: "0", completion: "0", request: "0" },
      supported_parameters: ["response_format"],
    },
  ],
};

test("scheduler is deterministic, preserves input, accounts for progress and budgets breaks", () => {
  const original = clone(),
    plan = schedule(original);
  assert.deepEqual(original, input);
  assert.deepEqual(schedule(input), plan);
  assert.equal(plan.blocks[0].taskId, "essay");
  assert.equal(
    plan.blocks
      .filter((b) => b.kind === "study")
      .reduce((n, b) => n + (Date.parse(b.end) - Date.parse(b.start)) / 60000, 0),
    45,
  );
  assert.equal(plan.unfinished.length, 0);
  assert.ok(plan.blocks.some((b) => b.kind === "break"));
  assert.deepEqual(validateScheduledPlan(input, plan), plan);
});
test("deadline ordering, priorities, difficulty and completed tasks are honored without inventing progress", () => {
  const value = clone();
  value.tasks[0].completedMinutes = 45;
  const plan = schedule(value);
  assert.ok(plan.blocks.every((b) => b.taskId !== "essay"));
  value.tasks[0].completedMinutes = 0;
  value.tasks[1].deadline = value.tasks[0].deadline;
  value.tasks[1].priority = 3;
  value.tasks[1].difficulty = 5;
  assert.equal(schedule(value).blocks[0].taskId, "review");
  value.tasks[0].deadline = "2026-11-03T09:00:00.000Z";
  assert.ok(schedule(value).warnings.some((w) => w.includes("Deadline may be missed")));
});
test("all-completed work stays empty; tight windows report unfinished work and never overbook", () => {
  const value = clone();
  value.tasks = value.tasks.map((t) => ({ ...t, completedMinutes: t.estimatedMinutes }));
  assert.deepEqual(schedule(value).blocks, []);
  value.tasks = clone().tasks;
  value.windows[0].end = "2026-11-03T10:01:00.000Z";
  const plan = schedule(value);
  assert.equal(plan.blocks.length, 1);
  assert.equal(
    plan.unfinished.reduce((n, t) => n + t.minutes, 0),
    44,
  );
});
test("schema rejects overlapping/invalid dates, duplicate IDs, impossible progress and unbounded requests", () => {
  const bad: PlanningInput[] = [];
  let v = clone();
  v.tasks.push({ ...v.tasks[0] });
  bad.push(v);
  v = clone();
  v.windows.push({ ...v.windows[0] });
  bad.push(v);
  v = clone();
  v.tasks[0].completedMinutes = 46;
  bad.push(v);
  v = clone();
  v.tasks[0].estimatedMinutes = 0;
  bad.push(v);
  v = clone();
  v.tasks[0].deadline = "2026-02-30T00:00:00.000Z";
  bad.push(v);
  v = clone();
  v.windows[0].end = v.windows[0].start;
  bad.push(v);
  v = clone();
  v.preferences.focusMinutes = NaN;
  bad.push(v);
  v = clone();
  v.tasks[0].title = "bad\u0000text";
  bad.push(v);
  for (const value of bad) assert.throws(() => validatePlanningInput(value));
  assert.throws(() => validatePlanningInput({ ...clone(), providerUrl: "http://localhost" }));
});
test("scheduler invariants hold across multiple windows, task sizes and preference combinations", () => {
  for (let n = 1; n <= 100; n++) {
    const value = clone();
    value.tasks[0].estimatedMinutes = n;
    value.tasks[0].completedMinutes = n % 4;
    value.preferences.focusMinutes = 5 + (n % 60);
    value.preferences.breakMinutes = n % 15;
    value.windows.push({ start: "2026-11-03T13:00:00.000Z", end: "2026-11-03T14:00:00.000Z" });
    const plan = schedule(value);
    let previous = 0;
    for (const b of plan.blocks) {
      const start = Date.parse(b.start),
        end = Date.parse(b.end);
      assert.ok(start >= previous && end > start);
      previous = end;
      assert.ok(
        value.windows.some((w) => start >= Date.parse(w.start) && end <= Date.parse(w.end)),
      );
    }
    for (const task of value.tasks) {
      const allotted = plan.blocks
        .filter((b) => b.taskId === task.id)
        .reduce((n, b) => n + (Date.parse(b.end) - Date.parse(b.start)) / 60000, 0);
      assert.equal(
        allotted + (plan.unfinished.find((t) => t.taskId === task.id)?.minutes ?? 0),
        task.estimatedMinutes - task.completedMinutes,
      );
    }
  }
});
test("models may edit wording only, never inject unknown IDs, overlaps, completion or timestamps", () => {
  const base = schedule(input),
    suggestions = base.blocks
      .filter((b) => b.kind === "study")
      .map((b) => ({
        blockId: b.id,
        title: b.title,
        instructions: "Explain the idea, then test recall.",
      }));
  const enhanced = applyEnhancement(input, { suggestions });
  assert.equal(enhanced.blocks[0].instructions, "Explain the idea, then test recall.");
  assert.deepEqual(
    enhanced.blocks.map(({ title, instructions, ...b }) => b),
    base.blocks.map(({ title, instructions, ...b }) => b),
  );
  assert.throws(() => applyEnhancement(input, { suggestions: [...suggestions, suggestions[0]] }));
  assert.throws(() =>
    applyEnhancement(input, {
      suggestions: suggestions.map((b, i) => (i ? b : { ...b, blockId: "not-a-task" })),
    }),
  );
  assert.throws(() =>
    applyEnhancement(input, { suggestions: suggestions.map((b) => ({ ...b, done: true })) }),
  );
  assert.throws(() =>
    validateScheduledPlan(input, {
      ...base,
      blocks: base.blocks.map((b, i) => (i ? b : { ...b, end: "2026-11-03T12:00:00.000Z" })),
    }),
  );
});
test("per-user quotas are isolated, concurrency bounded and provider cooldown is shared", () => {
  let now = 0;
  const capacity = new AiCapacity(() => now);
  const a = capacity.acquire("A");
  const b = capacity.acquire("B");
  assert.throws(
    () => capacity.acquire("A"),
    (e) => e instanceof CapacityError && e.reason === "busy",
  );
  assert.throws(
    () => capacity.acquire("C"),
    (e) => e instanceof CapacityError && e.reason === "busy",
  );
  a();
  a();
  b();
  for (let i = 0; i < 3; i++) capacity.acquire("A")();
  assert.throws(
    () => capacity.acquire("A"),
    (e) => e instanceof CapacityError && e.reason === "user_quota",
  );
  capacity.acquire("B")();
  capacity.cooldown(120);
  assert.throws(
    () => capacity.acquire("B"),
    (e) => e instanceof CapacityError && e.retryAfter === 120,
  );
  now += 120000;
  capacity.acquire("A")();
  assert.deepEqual(Object.keys(capacity.metrics()).sort(), [
    "active",
    "admitted",
    "denied",
    "failed",
    "succeeded",
  ]);
});
test("daily caps and bounded identity cardinality fail closed rather than evicting quotas", () => {
  let now = 0;
  const c = new AiCapacity(() => now, {
    userMinute: 10,
    userDay: 2,
    providerMinute: 20,
    providerDay: 3,
    concurrent: 2,
    users: 2,
  });
  c.acquire("A")();
  c.acquire("A")();
  assert.throws(
    () => c.acquire("A"),
    (e) => e instanceof CapacityError && e.reason === "user_quota",
  );
  c.acquire("B")();
  assert.throws(
    () => c.acquire("B"),
    (e) => e instanceof CapacityError && e.reason === "provider_quota",
  );
  assert.throws(
    () => c.acquire("C"),
    (e) => e instanceof CapacityError && e.reason === "capacity",
  );
  now = 86400001;
  c.acquire("C")();
});
test("Qwen discovery excludes paid/stale/non-Qwen and unsupported structured-output routes", () => {
  assert.deepEqual(freeQwenModels(catalog), ["qwen/fixture:free"]);
  for (const model of [
    { ...catalog.data[0], id: "qwen/fixture" },
    { ...catalog.data[0], id: "other/fixture:free" },
    { ...catalog.data[0], pricing: { prompt: "0.1", completion: "0" } },
    { ...catalog.data[0], supported_parameters: [] },
  ])
    assert.deepEqual(freeQwenModels({ data: [model] }), []);
});
test("Qwen adapter sends minimum selected data, fixed endpoint/zero price and verifies output", async () => {
  const calls: { url: string; body?: any }[] = [];
  const provider = cloudQwen("synthetic-server-key", async (url, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: String(url), body });
    if (!body) return Response.json(catalog);
    assert.equal(body.model, "qwen/fixture:free");
    assert.equal(body.provider.allow_fallbacks, false);
    assert.deepEqual(body.provider.max_price, { prompt: 0, completion: 0 });
    assert.equal(body.models, undefined);
    assert.equal(body.tools, undefined);
    const selected = JSON.parse(body.messages[1].content);
    assert.equal(JSON.stringify(selected).includes("2026-"), false);
    assert.equal(JSON.stringify(selected).includes("completedMinutes"), false);
    return Response.json({
      model: body.model,
      usage: { cost: 0 },
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestions: selected.blocks.map((b: any) => ({
                blockId: b.blockId,
                title: b.title,
                instructions: "Test recall.",
              })),
            }),
          },
        },
      ],
    });
  });
  const result = await provider.enhance(input, new AbortController().signal);
  assert.equal(result.verification.cost, 0);
  assert.equal(calls.length, 2);
  assert.equal(JSON.stringify(result).includes("synthetic-server-key"), false);
});
test("absent free Qwen never calls inference or substitutes a paid/generic model", async () => {
  let calls = 0;
  const provider = cloudQwen("synthetic", async () => {
    calls++;
    return Response.json({ data: [] });
  });
  await assert.rejects(
    provider.enhance(input, new AbortController().signal),
    (e) => e instanceof PlanningProviderError && e.reason === "no_free_qwen",
  );
  assert.equal(calls, 1);
});
test("upstream errors are classified without raw text and Retry-After is bounded; no automatic retries", async () => {
  for (const [status, message, reason] of [
    [429, "daily requests limit exceeded", "daily_quota"],
    [429, "temporarily rate-limited upstream", "upstream_capacity"],
    [429, "rate limited", "rate_limit"],
    [401, "secret invalid", "credentials"],
    [503, "secret unavailable", "unavailable"],
  ] as const) {
    let calls = 0;
    const provider = cloudQwen("synthetic", async () => {
      calls++;
      return calls === 1
        ? Response.json(catalog)
        : Response.json({ error: { message } }, { status, headers: { "Retry-After": "120" } });
    });
    await assert.rejects(
      provider.enhance(input, new AbortController().signal),
      (e) =>
        e instanceof PlanningProviderError &&
        e.reason === reason &&
        e.retryAfter === 120 &&
        !e.message.includes("secret"),
    );
    assert.equal(calls, 2);
  }
  assert.equal(retrySeconds("999999999"), 86400);
  assert.equal(retrySeconds("invalid"), 60);
  assert.equal(retrySeconds(new Date(120000).toUTCString(), 0), 120);
});
test("provider output with changed model, paid/unconfirmed cost or invented blocks is rejected", async () => {
  for (const response of [
    { model: "qwen/paid", usage: { cost: 0 }, choices: [] },
    { model: "qwen/fixture:free", usage: { cost: 1 }, choices: [] },
    { model: "qwen/fixture:free", choices: [] },
    {
      model: "qwen/fixture:free",
      usage: { cost: 0 },
      choices: [{ message: { content: '{"suggestions":[]}' } }],
    },
  ]) {
    let count = 0;
    const provider = cloudQwen("synthetic", async () =>
      Response.json(++count === 1 ? catalog : response),
    );
    await assert.rejects(provider.enhance(input, new AbortController().signal));
    assert.equal(count, 2);
  }
});
test("account transport binds owner/JWT, never takes a body owner or service role, validates saved data", async () => {
  const plan = schedule(input),
    identity = { user: { id: "user-A" }, token: "synthetic-user-jwt" };
  let calls = 0,
    posted = false;
  const config = {
    supabaseUrl: "https://project.supabase.co",
    anonKey: "public-anon",
    fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      assert.equal(new URL(String(url)).origin, "https://project.supabase.co");
      assert.equal((init!.headers as any).Authorization, "Bearer synthetic-user-jwt");
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        assert.equal(body.user_id, "user-A");
        posted = true;
        return new Response(null, { status: 201 });
      }
      assert.equal(new URL(String(url)).searchParams.get("user_id"), "eq.user-A");
      if (!posted) return Response.json([]);
      return Response.json([
        { id: "11111111-1111-4111-8111-111111111111", title: "Schedule", payload: { input, plan } },
      ]);
    },
  };
  await accountPlans(config, identity, {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Schedule",
    input,
    plan,
  });
  const loaded = await accountPlans(config, identity);
  assert.ok("plans" in loaded);
  assert.equal(calls, 4); // exact-ID preflight, insert, exact confirmation, then library load
});

test("very large availability respects the exact rendering cap and carries unscheduled work forward", () => {
  const value = clone();
  value.tasks = [{ ...value.tasks[0], estimatedMinutes: 1440, completedMinutes: 0, difficulty: 5 }];
  value.preferences = { focusMinutes: 5, breakMinutes: 1 };
  value.windows = [
    { start: "2026-11-03T10:00:00.000Z", end: "2026-11-03T18:00:00.000Z" },
    { start: "2026-11-04T10:00:00.000Z", end: "2026-11-04T18:00:00.000Z" },
  ];
  const plan = schedule(value);
  assert.ok(plan.blocks.length <= 200);
  assert.ok(plan.unfinished[0].minutes > 0);
  assert.ok(plan.warnings.some((w) => w.includes("block limit")));
});
