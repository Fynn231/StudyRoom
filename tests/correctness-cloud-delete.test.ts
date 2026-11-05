import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHybridHandler } from "../server/hybridPlanning.js";
import { AiCapacity } from "../server/aiCapacity.js";

const id = "11111111-1111-4111-8111-111111111111";
test("saved-cloud-plan DELETE validates route, guards, exact owner and confirmed removal", async (t) => {
  let authenticated = true,
    confirm = true,
    exists = true;
  const calls: { url: URL; method: string }[] = [];
  const handler = createHybridHandler({
    hosted: true,
    origin: "https://study.example",
    capacity: new AiCapacity(),
    account: {
      supabaseUrl: "https://fake.invalid",
      anonKey: "synthetic",
      fetch: async (url, init) => {
        const query = new URL(String(url));
        calls.push({ url: query, method: init!.method! });
        assert.equal(query.searchParams.get("user_id"), "eq.owner-A");
        assert.equal(query.searchParams.get("id"), `eq.${id}`);
        assert.equal(init!.redirect, "error");
        assert.ok(init!.signal);
        if (init?.method === "DELETE") {
          exists = !confirm;
          return Response.json(confirm ? [{ id }] : []);
        }
        return Response.json(exists ? [{ id }] : []);
      },
    },
  });
  const server = createServer((req, res) => {
    void handler(
      req,
      res,
      authenticated ? { user: { id: "owner-A" }, token: "synthetic" } : undefined,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    handler.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/ai/hybrid/account-plans`;
  const request = (suffix: string, method = "DELETE", origin = "https://study.example") =>
    fetch(base + suffix, { method, headers: { Origin: origin } });
  let response = await request(`?id=${id}`);
  assert.equal(response.status, 200, "query-bearing deletion route must be reachable");
  assert.deepEqual(await response.json(), { deleted: true, id });
  assert.deepEqual(
    calls.map((c) => c.method),
    ["DELETE", "GET"],
  );
  calls.length = 0;
  for (const suffix of ["", "?id=bad", `?id=${id}&id=${id}`, `?id=${id}%26user_id=eq.other`])
    assert.equal((await request(suffix)).status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await request(`?id=${id}`, "PATCH")).status, 405);
  assert.equal((await request(`?id=${id}`, "DELETE", "https://evil.example")).status, 403);
  authenticated = false;
  assert.equal((await request(`?id=${id}`)).status, 401);
  authenticated = true;
  assert.equal(calls.length, 0);
  confirm = false;
  exists = true;
  response = await request(`?id=${id}`);
  assert.notEqual(response.status, 200, "empty/cross-owner RLS result is not a confirmed deletion");
  assert.notEqual((await response.json()).deleted, true);
});
