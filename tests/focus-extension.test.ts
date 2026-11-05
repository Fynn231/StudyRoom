import { test } from "node:test";
import assert from "node:assert/strict";
import { blockRules, normalizeDomains } from "../extension/rules.js";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { focusWorker, start, slot } from "./helpers/focus-worker.js";

const lease = () => ({ domains: ["example.com"], endsAt: Date.now() + 60000 });

test("worker wake fails open on a lost expiry alarm without extending or restoring the lease", async () => {
  const w = await focusWorker();
  await start(w);
  w.alarms.delete(slot(w, 0)!);
  w.boot();
  const status = await w.send({ type: "status" });
  assert.equal(status.ok, true);
  assert.equal(status.active, null);
  assert.match(status.warning, /disable or remove/);
  assert.deepEqual(w.rules(), []);
  assert.equal(w.alarms.size, 0);
});

test("status clears a live lease with missing or altered session rules instead of claiming blocking", async () => {
  for (const rules of [[], blockRules(["other.example"], 51)]) {
    const w = await focusWorker();
    await start(w);
    w.setRules(rules);
    const status = await w.send({ type: "status" });
    assert.equal(status.ok, true);
    assert.equal(status.active, null, "a durable lease alone is not browser enforcement");
    assert.deepEqual(w.rules(), []);
    assert.equal(w.data.active, undefined);
  }
});

test("missing-alarm reconciliation does not require alarm creation to fail open", async () => {
  const w = await focusWorker();
  await start(w);
  w.alarms.delete(slot(w, 0)!);
  w.failures.add("alarmCreate");
  const status = await w.send({ type: "status" });
  assert.equal(status.ok, true);
  assert.match(status.warning, /disable or remove/);
  assert.deepEqual(w.rules(), []);
  assert.equal(w.data.active, undefined);
});

for (const cause of ["stale envelope during a read outage", "invalid Start"] as const) {
  test(`popup polling preserves a persisted warning during healthy blocking after ${cause}`, async (t) => {
    const w = await focusWorker();
    await start(w);
    const oldEnvelope = structuredClone(w.alarms.get(slot(w, 1)!));
    await w.send({ type: "stop" });
    await start(w, 180);
    if (cause === "invalid Start") {
      assert.equal((await w.send({ type: "start", domains: "example.com", minutes: 0 })).ok, false);
    } else {
      w.advance(oldEnvelope.scheduledTime);
      w.failures.add("read");
      await w.dispatch(oldEnvelope, true);
      w.failures.delete("read");
    }
    assert.equal(w.data.focusWarning, true);
    assert.equal(w.rules().length, 1);
    const dom = new JSDOM(
      await readFile(new URL("../extension/popup.html", import.meta.url), "utf8"),
    );
    t.after(() => dom.window.close());
    let poll!: () => Promise<void>;
    const source = await readFile(new URL("../extension/popup.js", import.meta.url), "utf8");
    await vm.runInNewContext(`(async () => { ${source.replace(/^import .*;\n/, "")} })()`, {
      document: dom.window.document,
      normalizeDomains,
      setInterval: (callback: () => Promise<void>) => {
        poll = callback;
        return 0;
      },
      chrome: {
        storage: w.chrome.storage,
        runtime: { sendMessage: (message: any) => w.send(message) },
      },
    });
    const text = () => dom.window.document.getElementById("status")!.textContent!;
    assert.match(text(), /disable or remove/, "healthy status must carry the sticky warning");
    for (let i = 0; i < 3; i++) {
      await poll();
      assert.match(text(), /disable or remove/);
    }
    w.boot();
    await poll();
    assert.match(text(), /disable or remove/, "cold worker must preserve the durable warning");
    dom.window.document.getElementById("stop")!.click();
    await w.drain();
    await new Promise((resolve) => setImmediate(resolve));
    await poll();
    assert.equal(text(), "Blocking is off.");
    assert.notEqual(w.data.focusWarning, true);
    await start(w, 3);
    await w.send({ type: "start", domains: "example.com", minutes: 0 });
    await poll();
    assert.match(text(), /disable or remove/);
    await start(w, 3);
    await poll();
    assert.match(text(), /^Blocking 1 selected sites/);
    assert.notEqual(w.data.focusWarning, true, "successful explicit Start also clears the warning");
  });
}

test("late popup status cannot overwrite a newer successful Stop", async (t) => {
  const dom = new JSDOM(
    await readFile(new URL("../extension/popup.html", import.meta.url), "utf8"),
  );
  t.after(() => dom.window.close());
  let finishStatus!: (result: any) => void;
  const pendingStatus = new Promise((resolve) => {
    finishStatus = resolve;
  });
  const source = await readFile(new URL("../extension/popup.js", import.meta.url), "utf8");
  const ready = vm.runInNewContext(`(async () => { ${source.replace(/^import .*;\n/, "")} })()`, {
    document: dom.window.document,
    normalizeDomains,
    setInterval: () => 0,
    chrome: {
      storage: { local: { get: async () => ({}) } },
      runtime: {
        sendMessage: async (message: any) =>
          message.type === "status" ? pendingStatus : { ok: true, active: null },
      },
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  dom.window.document.getElementById("stop")!.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dom.window.document.getElementById("status")!.textContent, "Blocking is off.");
  finishStatus({ ok: true, active: lease() });
  await ready;
  assert.equal(
    dom.window.document.getElementById("status")!.textContent,
    "Blocking is off.",
    "an older read must not resurrect a stopped status",
  );
});

test("popup offers an explicit status retry after a messaging failure", async (t) => {
  const dom = new JSDOM(
    await readFile(new URL("../extension/popup.html", import.meta.url), "utf8"),
  );
  t.after(() => dom.window.close());
  let failed = true;
  const source = await readFile(new URL("../extension/popup.js", import.meta.url), "utf8");
  await vm.runInNewContext(`(async () => { ${source.replace(/^import .*;\n/, "")} })()`, {
    document: dom.window.document,
    normalizeDomains,
    setInterval: () => 0,
    chrome: {
      storage: {
        local: {
          get: async () => {
            throw Error("unavailable preferences");
          },
        },
      },
      runtime: {
        sendMessage: async () => {
          if (failed) throw Error("worker unavailable");
          return { ok: true, active: null };
        },
      },
    },
  });
  assert.match(dom.window.document.getElementById("status")!.textContent!, /Status unavailable/);
  const retry = dom.window.document.getElementById("refresh");
  assert.ok(retry, "manual status recovery must not require closing the popup");
  failed = false;
  retry.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dom.window.document.getElementById("status")!.textContent, "Blocking is off.");
});

test("expiry, malformed leases and startup/install events leave no rules or stored active claim", async () => {
  for (const change of [
    { endsAt: 1_799_999_999_999 },
    { domains: ["bad.local"] },
    { endsAt: 1_800_000_000_000 + 181 * 60000 },
  ]) {
    const w = await focusWorker();
    await start(w);
    Object.assign(w.data.active, change);
    assert.equal((await w.send({ type: "status" })).active, null);
    assert.deepEqual(w.rules(), []);
    assert.equal(w.data.active, undefined);
  }
  for (const event of ["onStartup", "onInstalled", "onAlarm"]) {
    const w = await focusWorker();
    await start(w);
    if (event === "onAlarm") await w.consume(slot(w, 0)!);
    else w.listeners[event]();
    assert.equal((await w.send({ type: "status" })).active, null);
    assert.deepEqual(w.rules(), []);
  }
});

test("failed rule removal never confirms Stop, preserves expiry and permits retry", async () => {
  const w = await focusWorker();
  const active = await start(w);
  const expiry = slot(w, 0)!;
  w.failures.add("rulesUpdate");
  assert.equal((await w.send({ type: "stop" })).ok, false);
  assert.deepEqual(w.rules(), blockRules(active.domains, active.ruleBase));
  assert.equal(w.alarms.get(expiry)?.scheduledTime, active.endsAt);
  const status = await w.send({ type: "status" });
  assert.equal(status.ok, false, "live lease plus matching rules cannot hide failed Stop cleanup");
  assert.match(status.error, /disable or remove/);
  w.failures.delete("rulesUpdate");
  assert.deepEqual(await w.send({ type: "stop" }), { ok: true, active: null });
  assert.deepEqual(w.rules(), []);
  assert.equal(w.alarms.size, 0);
});

test("start storage failure installs no rules and a later explicit start still works", async () => {
  const w = await focusWorker();
  w.failures.add("write");
  assert.equal((await w.send({ type: "start", domains: "example.com", minutes: 1 })).ok, false);
  assert.deepEqual(w.rules(), []);
  assert.equal(w.alarms.size, 0);
  assert.equal(w.data.active, undefined);
  w.failures.delete("write");
  const active = await start(w);
  assert.deepEqual((await w.send({ type: "status" })).active, active);
  assert.equal(w.alarms.get(slot(w, 0)!)?.scheduledTime, active.endsAt);
});

test("storage read failure fails open and does not poison the next command", async () => {
  const w = await focusWorker();
  await start(w);
  w.failures.add("read");
  assert.equal((await w.send({ type: "status" })).ok, false);
  assert.deepEqual(w.rules(), []);
  w.failures.delete("read");
  const status = await w.send({ type: "status" });
  assert.equal(status.ok, true);
  assert.equal(status.active, null);
});

test("failed early retry preparation burns its durable intent; repeated Stop never repairs missing slots", async () => {
  const w = await focusWorker();
  await start(w, 180);
  w.failures.add("rulesUpdate");
  w.failures.add("alarmCreate");
  assert.equal((await w.send({ type: "stop" })).ok, false);
  const original = structuredClone(w.data.active.earlyStop);
  assert.ok(original);
  assert.equal(w.alarms.size, 6);
  w.failures.delete("alarmCreate");
  assert.equal((await w.send({ type: "stop" })).ok, false);
  assert.deepEqual(w.data.active.earlyStop, original);
  assert.equal(w.alarms.size, 6, "no repair/replenishment; expiry remains independent backstop");
});

test("stale and duplicate cleanup alarms cannot stop a same-domain same-deadline replacement lease", async () => {
  const w = await focusWorker();
  await start(w);
  const old = structuredClone(w.alarms.get(slot(w, 1)!));
  await w.send({ type: "stop" });
  const active = await start(w);
  assert.equal(active.endsAt + 30000, old.scheduledTime);
  w.failures.add("read");
  w.advance(old.scheduledTime);
  await w.dispatch(old, true);
  await w.dispatch(old, true);
  assert.deepEqual(w.rules(), blockRules(active.domains, active.ruleBase));
  assert.equal(w.data.active.generation, active.generation);
});

test("failed cleanup writes preserve finite alarm-driven progress without resetting the original end", async () => {
  const w = await focusWorker();
  const active = await start(w);
  const slots = [...w.alarms.keys()];
  w.failures.add("rulesUpdate");
  w.failures.add("write");
  await w.consume(slots[0]);
  await w.consume(slots[1]);
  assert.equal(w.data.active.phase, "running", "writes really failed");
  assert.equal(w.data.active.endsAt, active.endsAt);
  const creates = w.operations.filter((o) => o.op === "alarmCreate").length;
  await w.send({ type: "stop" });
  assert.equal(w.operations.filter((o) => o.op === "alarmCreate").length, creates);
  w.failures.delete("rulesUpdate");
  await w.consume(slots[2], true);
  assert.deepEqual(w.rules(), []);
});

test("worker restart accepts a higher delivered slot despite older persisted observations", async () => {
  const w = await focusWorker();
  await start(w);
  const slots = [...w.alarms.keys()];
  w.failures.add("rulesUpdate");
  await w.consume(slots[0]);
  const old = structuredClone(w.data.active);
  w.failures.add("write");
  await w.consume(slots[1]);
  assert.deepEqual(w.data.active, old);
  w.failures.delete("rulesUpdate");
  await w.consume(slots[2], true);
  assert.deepEqual(w.rules(), []);
  assert.equal(w.alarms.has(slots[0]), false);
});

test("exhausted and malformed legacy cleanup remain release-only without budget reset", async () => {
  for (const cleanup of [
    { attempt: 6, retryAt: 123, exhausted: true },
    { attempt: "bad", retryAt: null },
  ]) {
    const w = await focusWorker();
    w.data.active = lease();
    w.data.cleanup = structuredClone(cleanup);
    w.setRules(blockRules(["example.com"]));
    w.failures.add("rulesUpdate");
    w.boot();
    for (const type of ["stop", "status", "stop"]) {
      const result = await w.send({ type });
      assert.equal(result.ok, false);
      assert.match(result.error, /disable or remove/);
    }
    assert.deepEqual(w.data.cleanup, cleanup);
    assert.equal(w.alarms.size, 0);
    w.failures.delete("rulesUpdate");
    assert.equal((await w.send({ type: "stop" })).ok, true);
    assert.equal(w.data.cleanup, undefined);
  }
});

test("storage removal and alarm clearing failures never confirm Stop and permit explicit recovery", async () => {
  for (const failure of ["remove", "alarmClear"]) {
    const w = await focusWorker();
    await start(w);
    w.failures.add(failure);
    const result = await w.send({ type: "stop" });
    assert.equal(result.ok, false);
    assert.match(result.error, /disable or remove/);
    assert.equal((await w.send({ type: "stop" })).ok, false);
    assert.deepEqual(w.rules(), [], "off is distinct from housekeeping confirmed");
    w.failures.delete(failure);
    assert.equal((await w.send({ type: "stop" })).ok, true);
    assert.equal(w.data.active, undefined);
    assert.equal(w.data.cleanup, undefined);
    assert.equal(w.alarms.size, 0);
  }
});

test("stale legacy expiry cannot touch a v2 deadline and out-of-order slots never rearm", async () => {
  const w = await focusWorker();
  const active = await start(w, 3);
  await w.dispatch({ name: "focus-end", scheduledTime: w.now() });
  assert.deepEqual((await w.send({ type: "status" })).active, active);
  const events = [...w.alarms.values()].map((x) => structuredClone(x));
  w.failures.add("rulesUpdate");
  for (const i of [0, 2, 1, 2]) {
    w.advance(Math.max(w.now(), events[i].scheduledTime));
    await w.dispatch(events[i]);
  }
  assert.equal(w.data.active.observedSlot, 2);
  assert.equal(w.operations.filter((o) => o.op === "alarmCreate").length, 6);
  w.failures.add("read");
  w.failures.delete("rulesUpdate");
  await w.consume(events[3].name, true);
  assert.deepEqual(w.rules(), []);
});
