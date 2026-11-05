import { test } from "node:test";
import assert from "node:assert/strict";
import { blockRules } from "../extension/rules.js";
import { focusWorker, start, slot } from "./helpers/focus-worker.js";

for (const cold of [false, true]) {
  for (let target = 0; target <= 5; target++) {
    test(`${cold ? "cold" : "warm"} consumed expiry slot ${target} removes rules despite general local outage`, async () => {
      const w = await focusWorker();
      await start(w);
      const names = [...w.alarms.keys()];
      w.failures.add("read");
      w.failures.add("write");
      w.failures.add("rulesUpdate");
      for (let i = 0; i < target; i++) await w.consume(names[i], cold, i % 2 === 1);
      w.failures.delete("rulesUpdate");
      await w.consume(names[target], cold, target % 2 === 1);
      assert.deepEqual(w.rules(), []);
      assert.equal(w.operations.filter((o) => o.op === "alarmCreate").length, 6);
      assert.equal(w.data.active.phase, "running", "failed diagnostics cannot be authority");
      // Reads were unavailable: no claim of full housekeeping completion.
      assert.ok(w.alarms.size <= 5);
    });
  }
}

test("expiry read outage + removal failure retains independent cold retry, then recovers without Stop", async () => {
  const w = await focusWorker();
  await start(w);
  const names = [...w.alarms.keys()];
  w.failures.add("read");
  w.failures.add("rulesUpdate");
  await w.consume(names[0], true);
  assert.equal(w.rules().length, 1);
  assert.equal(w.alarms.size, 5);
  w.failures.delete("rulesUpdate");
  await w.consume(names[1], true, true);
  assert.deepEqual(w.rules(), []);
  w.failures.delete("read");
  await w.consume(names[2], true);
  assert.equal(w.data.active, undefined);
  assert.equal(w.alarms.size, 0);
});

test("valid consumed event removes its range before any local/alarm/DNR reads and tolerates all read providers failing", async () => {
  const w = await focusWorker();
  await start(w);
  const names = [...w.alarms.keys()];
  for (const key of ["read", "write", "rulesRead", "alarmGet", "alarmGetAll"]) w.failures.add(key);
  const index = w.operations.length;
  await w.consume(names[0], true);
  assert.equal(w.operations[index].op, "rulesUpdate");
  assert.deepEqual(
    w.rules(),
    [],
    "actual boundary rules removed, but endpoint confirmation is unavailable",
  );
  assert.equal(w.alarms.size, 5, "readback unavailable retains backstops");
  w.failures.clear();
  await w.consume(names[1], true);
  assert.equal(w.alarms.size, 0);
  assert.equal(w.data.active, undefined);
});

test("strict alarm names, range, kind, original end, anchor, slot, time and one-shot shape reject malformed authority", async () => {
  const w = await focusWorker();
  await start(w);
  const event = structuredClone(w.alarms.get(slot(w, 1)!));
  w.advance(event.scheduledTime);
  const parts = event.name.split(":");
  const names = [
    event.name + ":x",
    event.name.replace("focus:v2", "focus:v3"),
    event.name + "\n",
    event.name + "\r\n",
    event.name + "\u2028",
  ];
  for (const [index, value] of [
    [2, "01"],
    [2, "0"],
    [2, "1000001"],
    [3, "NaN"],
    [3, "9007199254740992"],
    [4, "1"],
    [5, "0"],
    [5, "51"],
    [6, "other"],
    [7, "1"],
    [8, "6"],
    [8, "-1"],
  ] as const) {
    const p = [...parts];
    p[index] = value;
    names.push(p.join(":"));
  }
  const earlyZero = [...parts];
  earlyZero[6] = "earlyStop";
  earlyZero[7] = String(w.now() - 30000);
  earlyZero[8] = "0";
  names.push(earlyZero.join(":"));
  const index = w.operations.length;
  for (const name of names) await w.dispatch({ ...event, name }, true);
  for (const extra of [
    { scheduledTime: event.scheduledTime + 1 },
    { periodInMinutes: 1 },
    { periodInMinutes: 0 },
  ])
    await w.dispatch({ ...event, ...extra }, true);
  w.advance(event.scheduledTime - 1);
  await w.dispatch(event, true);
  assert.deepEqual(w.operations.slice(index), [], "invalid events must confer no authority");
  assert.equal(w.rules().length, 1);
  assert.equal(event.name.includes("example"), false);
});

test("native storage key reordering must not invalidate prepared/running intent readback", async () => {
  const w = await focusWorker();
  const get = w.chrome.storage.local.get;
  const reorder = (value: any): any =>
    Array.isArray(value)
      ? value.map(reorder)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, reorder(value[key])]),
          )
        : value;
  w.chrome.storage.local.get = async (keys) => reorder(await get(keys));
  const active = await start(w);
  assert.equal(active.phase, "running");
  w.failures.add("rulesUpdate");
  await w.send({ type: "stop" });
  assert.equal(
    w.alarms.size,
    11,
    "earlyStop readback must also compare structure, not insertion order",
  );
});

test("rule allocator preserves legacy default IDs and rejects nonfinite/overflow bases", () => {
  assert.equal(blockRules(["example.com"])[0].id, 1);
  assert.equal(blockRules(["example.com"], 51)[0].id, 51);
  assert.equal(blockRules(["example.com"], 50000050)[0].id, 50000050);
  for (const base of [0, -1, 1.5, NaN, Infinity, 50000051, Number.MAX_SAFE_INTEGER])
    assert.throws(() => blockRules(["example.com"], base));
});

test("generation counter missing/corrupt with actual prior-v2 evidence rejects Start, never resets", async () => {
  for (const counter of [undefined, null, "1", -1, 1.5, 0, NaN, 1000001]) {
    const w = await focusWorker();
    const old = await start(w);
    if (counter === undefined) delete w.data.focusGeneration;
    else w.data.focusGeneration = counter;
    const creates = w.operations.filter((o) => o.op === "alarmCreate").length;
    const result = await w.send({ type: "start", domains: "example.com", minutes: 1 });
    assert.equal(result.ok, false);
    assert.equal(w.data.active.generation, old.generation);
    assert.equal(w.operations.filter((o) => o.op === "alarmCreate").length, creates);
  }
});

test("last finite generation installs in its disjoint range; next Start rejects without wrap", async () => {
  const w = await focusWorker();
  w.data.focusGeneration = 999999;
  w.data.focusV2Evidence = true;
  const active = await start(w);
  assert.equal(active.generation, 1000000);
  assert.equal(w.rules()[0].id, 50000001);
  assert.equal((await w.send({ type: "start", domains: "example.com", minutes: 1 })).ok, false);
  assert.equal(w.data.focusGeneration, 1000000);
});

test("allocator write and readback failures are fail-closed BEFORE preparation or rule installation", async () => {
  for (const mode of ["write", "read", "mismatch"]) {
    const w = await focusWorker();
    let allocated = false;
    w.setHook((op, value) => {
      if (op === "write" && "focusGeneration" in value) {
        allocated = true;
        if (mode === "write") throw Error("allocator write");
      }
      if (op === "read" && allocated && Array.isArray(value) && value.includes("focusGeneration")) {
        if (mode === "read") throw Error("allocator readback");
        if (mode === "mismatch") w.data.focusGeneration = 0;
      }
    });
    assert.equal((await w.send({ type: "start", domains: "example.com", minutes: 1 })).ok, false);
    assert.deepEqual(w.rules(), []);
    assert.equal(w.operations.filter((o) => o.op === "alarmCreate").length, 0);
  }
});

for (const operation of ["alarmCreate", "alarmGet"]) {
  for (let cut = 1; cut <= 6; cut++) {
    test(`partial ${operation} preparation cut ${cut} rolls back without ever installing rules`, async () => {
      const w = await focusWorker();
      let n = 0;
      w.setHook((op, value) => {
        const name = typeof value === "string" ? value : value?.name;
        if (op === operation && String(name).startsWith("focus:v2:") && ++n === cut)
          throw Error("preparation cut");
      });
      const result = await w.send({ type: "start", domains: "example.com", minutes: 1 });
      assert.equal(result.ok, false);
      assert.equal(
        w.operations.filter((o) => o.op === "rulesUpdate" && o.value.addRules.length).length,
        0,
      );
      assert.deepEqual(w.rules(), []);
      assert.equal(w.alarms.size, 0);
      assert.equal(w.data.focusGeneration, 1, "allocation burned, not rolled back");
      w.setHook(undefined);
      assert.equal((await start(w)).generation, 2);
    });
  }
}

test("post-install persistence failure rolls back exact generation and never claims Start", async () => {
  const w = await focusWorker();
  w.setHook((op, value) => {
    if (op === "write" && value.active?.phase === "running") throw Error("running persistence");
  });
  assert.equal((await w.send({ type: "start", domains: "example.com", minutes: 1 })).ok, false);
  assert.equal(
    w.operations.filter((o) => o.op === "rulesUpdate" && o.value.addRules.length).length,
    1,
  );
  assert.deepEqual(w.rules(), []);
  assert.equal(w.alarms.size, 0);
});

test("all slots consumed, terminal writes failed, cold boots/status/Stop never mint schedules", async () => {
  const w = await focusWorker();
  const active = await start(w);
  const events = [...w.alarms.values()].map((x) => structuredClone(x));
  w.failures.add("rulesUpdate");
  w.failures.add("write");
  for (const event of events) await w.consume(event.name, true);
  assert.equal(w.alarms.size, 0);
  for (let i = 0; i < 3; i++) {
    w.boot();
    await w.send({ type: "status" });
    await w.send({ type: "stop" });
    await w.dispatch(events[5], true);
  }
  assert.equal(w.operations.filter((o) => o.op === "alarmCreate").length, 6);
  assert.equal(w.data.active.endsAt, active.endsAt);
  assert.equal(w.rules().length, 1, "deliberate DNR outage cannot be solved in software");
  w.failures.clear();
  w.boot();
  assert.equal(w.rules().length, 1, "no retained event means no spontaneous recovery claim");
  assert.equal((await w.send({ type: "stop" })).ok, true);
  assert.deepEqual(w.rules(), []);
});

for (const cold of [false, true]) {
  for (let target = 0; target < 5; target++) {
    test(`${cold ? "cold" : "warm"} quick Stop slot ${target + 1} is a finite independent release capability`, async () => {
      const w = await focusWorker();
      const active = await start(w, 180);
      w.failures.add("rulesUpdate");
      await w.send({ type: "stop" });
      const early = [...w.alarms.values()].filter((a) => a.name.includes(":earlyStop:"));
      w.failures.add("read");
      w.failures.add("write");
      for (let i = 0; i < target; i++) await w.consume(early[i].name, cold);
      w.failures.delete("rulesUpdate");
      await w.consume(early[target].name, cold, true);
      assert.deepEqual(w.rules(), []);
      assert.equal(w.data.active.endsAt, active.endsAt);
      assert.equal(w.operations.filter((o) => o.op === "alarmCreate").length, 11);
    });
  }
}

test("cold explicit Stop removes readable owned rules before consulting control metadata", async () => {
  const w = await focusWorker();
  await start(w, 180);
  w.boot();
  const index = w.operations.length;
  assert.equal((await w.send({ type: "stop" })).ok, true);
  const operations = w.operations.slice(index);
  const removal = operations.findIndex((o) => o.op === "rulesUpdate");
  const metadata = operations.findIndex((o) => o.op === "read");
  assert.ok(
    removal >= 0 && removal < metadata,
    "readable owned rules permit immediate removal without awaiting metadata",
  );
});

test("trusted warm Stop attempts owned removal BEFORE metadata reads; failed durable quick-intent never schedules", async () => {
  for (const failure of ["read", "write"]) {
    const w = await focusWorker();
    await start(w, 180);
    w.failures.add(failure);
    w.failures.add("rulesUpdate");
    const index = w.operations.length;
    assert.equal((await w.send({ type: "stop" })).ok, false);
    assert.equal(w.operations[index].op, "rulesUpdate");
    assert.equal(w.operations.filter((o) => o.op === "alarmCreate").length, 6);
    w.boot();
    await w.send({ type: "status" });
    assert.equal(w.operations.filter((o) => o.op === "alarmCreate").length, 6);
  }
});

test("unreadable identity falls back to readable actual owned rules, not invented durable allocation", async () => {
  const w = await focusWorker();
  await start(w, 180);
  w.boot();
  w.failures.add("read");
  w.failures.add("rulesUpdate");
  assert.equal((await w.send({ type: "stop" })).ok, false);
  assert.equal(w.operations.filter((o) => o.op === "alarmCreate").length, 6);
  w.failures.delete("rulesUpdate");
  assert.equal(
    (await w.send({ type: "stop" })).ok,
    false,
    "metadata housekeeping still unconfirmed",
  );
  assert.deepEqual(w.rules(), []);
});

test("early Stop intent readback mismatch burns budget without creating an unproven batch", async () => {
  const w = await focusWorker();
  await start(w, 180);
  w.failures.add("rulesUpdate");
  let intentWritten = false;
  w.setHook((op, value) => {
    if (op === "write" && value.active?.earlyStop) intentWritten = true;
    if (op === "read" && value === "active" && intentWritten)
      throw Error("intent readback unavailable");
  });
  await w.send({ type: "stop" });
  assert.ok(w.data.active.earlyStop, "intent persisted but readback failed");
  assert.equal(w.operations.filter((o) => o.op === "alarmCreate").length, 6);
  w.setHook(undefined);
  w.boot();
  await w.send({ type: "stop" });
  assert.equal(w.operations.filter((o) => o.op === "alarmCreate").length, 6);
});

test("quick batch exhaustion and cold repeated Stop never replenish, expiry remains original independent backstop", async () => {
  const w = await focusWorker();
  const a = await start(w, 180);
  w.failures.add("rulesUpdate");
  await w.send({ type: "stop" });
  const early = [...w.alarms.values()].filter((x) => x.name.includes(":earlyStop:"));
  w.failures.add("write");
  for (const event of early) await w.consume(event.name, true);
  for (let i = 0; i < 3; i++) {
    w.boot();
    await w.send({ type: "stop" });
    await w.send({ type: "status" });
  }
  assert.equal(w.operations.filter((o) => o.op === "alarmCreate").length, 11);
  assert.equal(w.alarms.size, 6);
  assert.equal(w.alarms.get(slot(w, 0)!)?.scheduledTime, a.endsAt);
  w.failures.delete("rulesUpdate");
  await w.consume(slot(w, 0)!, true);
  assert.deepEqual(w.rules(), []);
});

test("badge failure does not gate Start, alarm release or confirmed Stop", async () => {
  const w = await focusWorker();
  w.failures.add("badge");
  w.failures.add("title");
  await start(w);
  await w.consume(slot(w, 0)!, true);
  assert.deepEqual(w.rules(), []);
  assert.equal((await w.send({ type: "stop" })).ok, true);
});

test("preferences survive fail-open, expiry and release-only legacy migration", async () => {
  const w = await focusWorker();
  await start(w);
  const preferences = { domains: w.data.domains, minutes: w.data.minutes };
  w.alarms.delete(slot(w, 3)!);
  await w.send({ type: "status" });
  assert.equal(w.data.domains, preferences.domains);
  assert.equal(w.data.minutes, preferences.minutes);
  w.data.active = { domains: ["other.example"], endsAt: w.now() + 60000 };
  w.data.cleanup = { exhausted: true, attempt: 6 };
  w.setRules(blockRules(["other.example"]));
  await w.dispatch({ name: "focus-end", scheduledTime: w.now() }, true);
  assert.deepEqual(w.rules(), []);
  assert.equal(w.data.domains, preferences.domains);
  assert.equal(w.operations.filter((o) => o.op === "alarmCreate").length, 6);
});
