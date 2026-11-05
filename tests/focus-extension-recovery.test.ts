import { test } from "node:test";
import assert from "node:assert/strict";
import { focusWorker, start, slot } from "./helpers/focus-worker.js";

for (const gap of [false, true]) {
  test(`cold consumed retry removes its old real-Start lease with all local reads failing (${gap ? "microtask gap" : "immediate"})`, async () => {
    const w = await focusWorker();
    await w.drain(); // Baseline worker boot is intentionally allowed before Start.
    await start(w);
    const expiry = slot(w, 0)!;
    const retry = slot(w, 1) ?? "focus-cleanup-1";
    w.failures.add("rulesUpdate");
    await w.consume(expiry);
    assert.equal(w.rules().length, 1, "expiry removal genuinely failed");
    w.failures.add("read");
    w.failures.delete("rulesUpdate");
    await w.consume(retry, true, gap);
    assert.deepEqual(
      w.rules(),
      [],
      "consumed envelope must authorize removal without metadata/alarm rediscovery",
    );
  });

  test(`cold higher consumed retry cannot be vetoed by stale persisted observations (${gap ? "microtask gap" : "immediate"})`, async () => {
    const w = await focusWorker();
    await w.drain();
    await start(w);
    const expiry = slot(w, 0)!;
    const first = slot(w, 1) ?? "focus-cleanup-1";
    const second = slot(w, 2) ?? "focus-cleanup-2";
    w.failures.add("rulesUpdate");
    await w.consume(expiry);
    const persisted = structuredClone(w.data);
    w.failures.add("write");
    await w.consume(first);
    assert.deepEqual(w.data, persisted, "failed writes leave older persisted observations");
    const creates = w.operations.filter((o) => o.op === "alarmCreate").length;
    w.failures.delete("rulesUpdate");
    await w.consume(second, true, gap);
    assert.deepEqual(w.rules(), [], "higher consumed event retains release authority");
    assert.equal(
      w.alarms.has(first),
      false,
      "cold boot must never recreate an older consumed slot",
    );
    assert.equal(
      w.operations.filter((o) => o.op === "alarmCreate").length,
      creates,
      "no recovery scheduling",
    );
  });
}

test("Start reserves disjoint generation ranges and verifies all six expiry slots before enforcement", async () => {
  const w = await focusWorker();
  const a = await start(w);
  assert.equal(a.v, 2);
  assert.equal(a.ruleBase, 51);
  assert.equal(w.alarms.size, 6);
  const install = w.operations.findIndex((o) => o.op === "rulesUpdate" && o.value.addRules.length);
  assert.equal(
    w.operations
      .slice(0, install)
      .filter((o) => o.op === "alarmGet" && String(o.value).startsWith("focus:v2:")).length,
    6,
  );
  assert.equal(w.data.focusGeneration, 1);
  await w.send({ type: "stop" });
  const b = await start(w);
  assert.equal(b.generation, 2);
  assert.equal(b.ruleBase, 101);
});

test("early manual Stop allocates only one durable quick batch and keeps expiry backstop", async () => {
  const w = await focusWorker();
  const a = await start(w, 180);
  const expiry = [...w.alarms.keys()];
  w.failures.add("rulesUpdate");
  assert.equal((await w.send({ type: "stop" })).ok, false);
  const early = [...w.alarms.values()].filter((x) => x.name.includes(":earlyStop:"));
  assert.equal(early.length, 5);
  assert.deepEqual(
    early.map((x) => x.scheduledTime - w.now()),
    [30000, 90000, 210000, 450000, 930000],
  );
  assert.equal(w.data.active.endsAt, a.endsAt);
  const creates = w.operations.filter((o) => o.op === "alarmCreate").length;
  for (let i = 0; i < 3; i++) {
    w.boot();
    await w.send({ type: "stop" });
    await w.send({ type: "status" });
  }
  assert.equal(w.operations.filter((o) => o.op === "alarmCreate").length, creates);
  for (const name of expiry) assert.ok(w.alarms.has(name));
  w.failures.delete("rulesUpdate");
  await w.consume(early[0].name, true);
  assert.deepEqual(w.rules(), []);
});

test("missing required future alarm fails open with a warning without repair", async () => {
  const w = await focusWorker();
  const active = await start(w);
  const name = slot(w, 4)!;
  w.alarms.delete(name);
  const creates = w.operations.filter((o) => o.op === "alarmCreate").length;
  const result = await w.send({ type: "status" });
  assert.equal(result.ok, true);
  assert.equal(result.active, null);
  assert.match(result.warning, /disable or remove/);
  assert.deepEqual(w.rules(), []);
  assert.equal(w.data.active, undefined);
  assert.equal(w.operations.filter((o) => o.op === "alarmCreate").length, creates);
  assert.equal(active.endsAt, w.now() + 60000);
});

test("popup displays a successful fail-open warning instead of silently saying off", async (t) => {
  const { JSDOM } = await import("jsdom");
  const { readFile } = await import("node:fs/promises");
  const vm = await import("node:vm");
  const { normalizeDomains } = await import("../extension/rules.js");
  const dom = new JSDOM(
    await readFile(new URL("../extension/popup.html", import.meta.url), "utf8"),
  );
  t.after(() => dom.window.close());
  const source = await readFile(new URL("../extension/popup.js", import.meta.url), "utf8");
  await vm.runInNewContext(`(async () => { ${source.replace(/^import .*;\n/, "")} })()`, {
    document: dom.window.document,
    normalizeDomains,
    setInterval: () => 0,
    chrome: {
      storage: { local: { get: async () => ({}) } },
      runtime: {
        sendMessage: async () => ({
          ok: true,
          active: null,
          warning: "Safety warning: disable or remove the extension.",
        }),
      },
    },
  });
  assert.match(dom.window.document.getElementById("status")!.textContent!, /Safety warning/);
});

test("module evaluation synchronously registers listeners with zero Chrome IO, even across a microtask", async () => {
  const w = await focusWorker();
  assert.equal(typeof w.listeners.onMessage, "function");
  assert.equal(typeof w.listeners.onAlarm, "function");
  await Promise.resolve();
  await w.drain();
  assert.deepEqual(w.operations, []);
});
