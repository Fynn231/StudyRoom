import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHybridHandler } from "../server/hybridPlanning.js";
import { AiCapacity } from "../server/aiCapacity.js";
import { schedule } from "../src/planning/scheduler.js";
import { validatePlanningInput } from "../src/planning/schema.js";

export const input = validatePlanningInput({
  tasks: [
    {
      id: "task",
      title: "Synthetic task",
      deadline: null,
      priority: 2,
      difficulty: 2,
      estimatedMinutes: 25,
      completedMinutes: 0,
    },
  ],
  objectives: [],
  windows: [{ start: "2026-11-04T10:00:00.000Z", end: "2026-11-04T11:00:00.000Z" }],
  preferences: { focusMinutes: 25, breakMinutes: 5 },
});
test("outer handler preserves attempted ID and uncertain-save category; same-ID reconciliation never inserts twice", async (t) => {
  const id = "11111111-1111-4111-8111-111111111111",
    plan = { id, title: "Reviewed", input, plan: schedule(input) };
  let row: unknown,
    failConfirmation = true,
    posts = 0;
  const handler = createHybridHandler({
    hosted: true,
    origin: "https://study.example",
    capacity: new AiCapacity(),
    account: {
      supabaseUrl: "https://fake.invalid",
      anonKey: "synthetic",
      fetch: async (url, init) => {
        const query = new URL(String(url)).searchParams;
        if (init?.method === "POST") {
          posts++;
          const saved = JSON.parse(String(init.body));
          row = { id: saved.id, title: saved.title, payload: saved.payload };
          return new Response(null, { status: 201 });
        }
        assert.equal(query.get("user_id"), "eq.A");
        assert.equal(query.get("id"), `eq.${id}`);
        if (row && failConfirmation) throw Error("synthetic lost confirmation");
        return Response.json(row ? [row] : []);
      },
    },
  });
  const server = createServer((req, res) => {
    void handler(req, res, { user: { id: "A" }, token: "synthetic" });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    handler.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const save = () =>
    fetch(
      `http://127.0.0.1:${(server.address() as { port: number }).port}/api/ai/hybrid/account-plans`,
      {
        method: "POST",
        headers: { Origin: "https://study.example", "Content-Type": "application/json" },
        body: JSON.stringify(plan),
      },
    );
  const first = await save(),
    error = await first.json();
  assert.equal(first.status, 503);
  assert.equal(error.category, "save_uncertain");
  assert.equal(error.attemptedId, id);
  assert.match(error.error, /reconcil|reload/i);
  failConfirmation = false;
  const retry = await save();
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).saved, true);
  assert.equal(posts, 1, "retry reads the exact owner/ID before considering another insert");
});
