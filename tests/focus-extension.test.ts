import { test } from "node:test";
import assert from "node:assert/strict";
import { blockRules, normalizeDomains } from "../extension/rules.js";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { JSDOM } from "jsdom";

// Exercise the real worker with an in-memory Chrome API boundary, not browser enforcement.
async function worker(
  active?: { domains: string[]; endsAt: number },
  initialRules = active ? blockRules(active.domains) : [],
) {
  const data: Record<string, any> = active ? { active: structuredClone(active) } : {};
  let rules = structuredClone(initialRules);
  const alarms = new Map<string, { scheduledTime: number }>();
  const failures = new Set<string>();
  const listeners: Record<string, Function> = {};
  const check = (name: string) => {
    if (failures.has(name)) throw Error(name);
  };
  const chrome = {
    runtime: {
      id: "test-extension",
      onMessage: {
        addListener: (fn: Function) => {
          listeners.message = fn;
        },
      },
      onStartup: {
        addListener: (fn: Function) => {
          listeners.startup = fn;
        },
      },
      onInstalled: {
        addListener: (fn: Function) => {
          listeners.installed = fn;
        },
      },
    },
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          check("read");
          return Object.fromEntries(
            (Array.isArray(keys) ? keys : [keys])
              .filter((key) => key in data)
              .map((key) => [key, structuredClone(data[key])]),
          );
        },
        set: async (value: any) => {
          check("write");
          Object.assign(data, structuredClone(value));
        },
        remove: async (key: string) => {
          check("remove");
          delete data[key];
        },
      },
    },
    alarms: {
      get: async (name: string) => {
        check("alarmGet");
        return alarms.get(name);
      },
      create: async (name: string, value: { when: number }) => {
        check("alarmCreate");
        alarms.set(name, { scheduledTime: value.when });
      },
      clear: async (name: string) => {
        check("alarmClear");
        alarms.delete(name);
        return true;
      },
      onAlarm: {
        addListener: (fn: Function) => {
          listeners.alarm = fn;
        },
      },
    },
    declarativeNetRequest: {
      getSessionRules: async () => {
        check("rulesRead");
        return structuredClone(rules);
      },
      updateSessionRules: async ({ removeRuleIds = [], addRules = [] }: any) => {
        check("rulesUpdate");
        rules = [
          ...rules.filter((rule) => !removeRuleIds.includes(rule.id)),
          ...structuredClone(addRules),
        ];
      },
    },
  };
  Object.assign(globalThis, { chrome });
  const source = (
    await readFile(new URL("../extension/background.js", import.meta.url), "utf8")
  ).replace(/^import .*;\n/, "");
  let now = Date.now();
  let context = vm.createContext({
    chrome,
    normalizeDomains,
    blockRules,
    Date: class extends Date {
      static now() {
        return now;
      }
    },
  });
  vm.runInContext(source, context);
  await vm.runInContext("queue", context);
  const send = (message: any): Promise<any> =>
    new Promise((resolve) =>
      listeners.message(message, { id: chrome.runtime.id }, (value: any) =>
        resolve(structuredClone(value)),
      ),
    );
  return {
    send,
    data,
    failures,
    listeners,
    rules: () => rules,
    alarm: () => alarms.get("focus-end"),
    alarms,
    reboot: async () => {
      context = vm.createContext({
        chrome,
        normalizeDomains,
        blockRules,
        Date: class extends Date {
          static now() {
            return now;
          }
        },
      });
      vm.runInContext(source, context);
      await vm.runInContext("queue", context);
    },
    fire: async (name: string, scheduledTime?: number) => {
      const when = scheduledTime ?? alarms.get(name)?.scheduledTime ?? now;
      now = Math.max(now, when);
      alarms.delete(name);
      listeners.alarm({ name, scheduledTime: when });
      await vm.runInContext("queue", context);
    },
  };
}

const lease = () => ({ domains: ["example.com"], endsAt: Date.now() + 60000 });

test("worker wake repairs a lost expiry alarm without extending the live lease", async () => {
  const active = lease();
  const w = await worker(active);
  const status = await w.send({ type: "status" });
  assert.equal(status.ok, true);
  assert.deepEqual(status.active, active);
  assert.equal(
    w.alarm()?.scheduledTime,
    active.endsAt,
    "live rules must have an expiry alarm after worker wake",
  );
  assert.deepEqual(w.rules(), blockRules(active.domains));
});

test("status clears a live lease with missing or altered session rules instead of claiming blocking", async () => {
  for (const rules of [[], blockRules(["other.example"])]) {
    const w = await worker(lease(), rules);
    const status = await w.send({ type: "status" });
    assert.equal(status.ok, true);
    assert.equal(status.active, null, "a durable lease alone is not browser enforcement");
    assert.deepEqual(w.rules(), []);
    assert.equal(w.data.active, undefined);
  }
});

test("failed alarm recovery removes live rules instead of leaving unbounded blocking", async () => {
  const w = await worker(lease());
  await w.send({ type: "status" });
  // Simulate an alarm lost while the worker is still running.
  await (globalThis as any).chrome.alarms.clear("focus-end");
  w.failures.add("alarmCreate");
  const status = await w.send({ type: "status" });
  assert.equal(status.ok, false);
  assert.deepEqual(w.rules(), [], "without a working expiry mechanism, fail open");
  assert.equal(w.data.active, undefined);
});

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
  for (const active of [
    { ...lease(), endsAt: Date.now() - 1 },
    { ...lease(), domains: ["bad.local"] },
    { ...lease(), endsAt: Date.now() + 181 * 60000 },
  ]) {
    const w = await worker(active);
    assert.equal((await w.send({ type: "status" })).active, null);
    assert.deepEqual(w.rules(), []);
    assert.equal(w.data.active, undefined);
  }
  for (const event of ["startup", "installed", "alarm"]) {
    const w = await worker(lease());
    await w.send({ type: "status" });
    w.listeners[event]({ name: "focus-end" });
    assert.equal((await w.send({ type: "status" })).active, null);
    assert.deepEqual(w.rules(), []);
  }
});

test("failed rule removal never confirms Stop, preserves expiry and permits retry", async () => {
  const active = lease();
  const w = await worker(active);
  await w.send({ type: "status" });
  w.failures.add("rulesUpdate");
  assert.equal((await w.send({ type: "stop" })).ok, false);
  assert.deepEqual(w.rules(), blockRules(active.domains));
  assert.equal(w.alarm()?.scheduledTime, active.endsAt);
  const status = await w.send({ type: "status" });
  assert.equal(status.ok, false, "live lease plus matching rules cannot hide failed Stop cleanup");
  assert.match(status.error, /disable or remove/);
  w.failures.delete("rulesUpdate");
  assert.deepEqual(await w.send({ type: "stop" }), { ok: true, active: null });
  assert.deepEqual(w.rules(), []);
  assert.equal(w.alarm(), undefined);
});

test("start storage failure rolls back installed rules and a later start still works", async () => {
  const w = await worker();
  await w.send({ type: "status" });
  w.failures.add("write");
  assert.equal((await w.send({ type: "start", domains: "example.com", minutes: 1 })).ok, false);
  assert.deepEqual(w.rules(), []);
  assert.equal(w.alarm(), undefined);
  assert.equal(w.data.active, undefined);
  w.failures.delete("write");
  const result = await w.send({ type: "start", domains: "example.com", minutes: 1 });
  assert.equal(result.ok, true);
  assert.deepEqual((await w.send({ type: "status" })).active, result.active);
  assert.equal(w.alarm()?.scheduledTime, result.active.endsAt);
});

test("storage read failure fails open and does not poison the next command", async () => {
  const w = await worker(lease());
  await w.send({ type: "status" });
  w.failures.add("read");
  assert.equal((await w.send({ type: "status" })).ok, false);
  assert.deepEqual(w.rules(), []);
  w.failures.delete("read");
  assert.deepEqual(await w.send({ type: "status" }), { ok: true, active: null });
});

test("failed retry alarm creation is repaired by manual Stop without resetting bounded intent", async () => {
  const active = lease();
  const w = await worker(active);
  w.failures.add("rulesUpdate");
  w.failures.add("alarmCreate");
  assert.equal((await w.send({ type: "stop" })).ok, false);
  const original = structuredClone(w.data.cleanup);
  assert.equal(original.attempt, 1);
  assert.equal(w.alarms.has("focus-cleanup-1"), false);
  w.failures.delete("alarmCreate");
  assert.equal((await w.send({ type: "stop" })).ok, false);
  assert.deepEqual(w.data.cleanup, original);
  assert.equal(w.alarm()?.scheduledTime, active.endsAt);
  assert.equal(
    w.alarms.get("focus-cleanup-1")?.scheduledTime,
    original.retryAt,
    "manual Stop must repair the missing wake-up at its original retry time",
  );
});

test("stale and duplicate cleanup alarms cannot rewind attempts or stop a replacement lease", async () => {
  const w = await worker(lease());
  w.failures.add("rulesUpdate");
  await w.send({ type: "stop" });
  const first = structuredClone(w.data.cleanup);
  await w.fire("focus-cleanup-1", first.retryAt);
  const second = structuredClone(w.data.cleanup);
  assert.equal(second.attempt, 2);
  await w.fire("focus-cleanup-1", first.retryAt);
  assert.deepEqual(
    w.data.cleanup,
    second,
    "duplicate delivery must not reset attempt or retry deadline",
  );
  w.failures.delete("rulesUpdate");
  assert.equal((await w.send({ type: "stop" })).ok, true);
  const started = await w.send({ type: "start", domains: "example.com", minutes: 3 });
  assert.equal(started.ok, true);
  await w.fire("focus-cleanup-2", second.retryAt);
  const status = await w.send({ type: "status" });
  assert.deepEqual(status.active, started.active, "old cleanup cannot remove a newer lease");
});

test("failed cleanup storage write cannot reset attempts on repeated Stop or lose alarm-driven progress", async () => {
  const active = lease();
  const w = await worker(active);
  w.failures.add("rulesUpdate");
  w.failures.add("write");
  assert.equal((await w.send({ type: "stop" })).ok, false);
  const first = w.alarms.get("focus-cleanup-1")!.scheduledTime;
  assert.equal(w.data.cleanup, undefined);
  await w.fire("focus-cleanup-1", first);
  assert.ok(
    w.alarms.has("focus-cleanup-2"),
    "alarm-persisted/state-failed cleanup must advance rather than silently disappear",
  );
  const second = w.alarms.get("focus-cleanup-2")!.scheduledTime;
  w.failures.delete("write");
  assert.equal((await w.send({ type: "stop" })).ok, false);
  const cleanup = Reflect.get(w.data, "cleanup");
  assert.ok(cleanup);
  assert.equal(
    cleanup.attempt,
    2,
    "manual retry must repair persistence without resetting attempt",
  );
  assert.equal(cleanup.retryAt, second);
  assert.equal(w.data.active.endsAt, active.endsAt);
});

test("worker restart prefers surviving later alarm over an older persisted cleanup attempt", async () => {
  const w = await worker(lease());
  w.failures.add("rulesUpdate");
  await w.send({ type: "stop" });
  w.failures.add("write");
  await w.fire("focus-cleanup-1");
  assert.equal(w.data.cleanup.attempt, 1);
  const second = w.alarms.get("focus-cleanup-2")!.scheduledTime;
  await w.reboot();
  w.failures.delete("write");
  assert.equal((await w.send({ type: "stop" })).ok, false);
  assert.equal(w.data.cleanup.attempt, 2, "restart must not reset to stale persisted attempt");
  assert.equal(w.data.cleanup.retryAt, second);
});

test("exhausted and malformed cleanup remain errors without automatic budget reset", async () => {
  for (const cleanup of [
    { attempt: 6, retryAt: 123, exhausted: true },
    { attempt: "bad", retryAt: null },
  ]) {
    const w = await worker(lease());
    w.data.cleanup = structuredClone(cleanup);
    w.failures.add("rulesUpdate");
    await w.reboot();
    for (const type of ["stop", "status", "stop"]) {
      const result = await w.send({ type });
      assert.equal(result.ok, false);
      assert.match(result.error, /disable or remove/);
    }
    assert.deepEqual(w.data.cleanup, cleanup);
    assert.equal([...w.alarms.keys()].filter((name) => name.startsWith("focus-cleanup")).length, 0);
    w.failures.delete("rulesUpdate");
    assert.equal((await w.send({ type: "stop" })).ok, true);
    assert.equal(w.data.cleanup, undefined);
  }
});

test("storage removal and alarm clearing failures never confirm Stop and permit explicit recovery", async () => {
  for (const failure of ["remove", "alarmClear"]) {
    const w = await worker(lease());
    w.failures.add(failure);
    const result = await w.send({ type: "stop" });
    assert.equal(result.ok, false);
    assert.match(result.error, /disable or remove/);
    const cleanup = structuredClone(w.data.cleanup);
    assert.equal((await w.send({ type: "stop" })).ok, false);
    assert.deepEqual(w.data.cleanup, cleanup);
    w.failures.delete(failure);
    assert.equal((await w.send({ type: "stop" })).ok, true);
    assert.equal(w.data.active, undefined);
    assert.equal(w.data.cleanup, undefined);
    assert.equal(w.alarms.size, 0);
  }
});

test("stale expiry and out-of-order cleanup delivery preserve the newer deadline and high-water mark", async () => {
  const w = await worker(lease());
  const oldDeadline = w.data.active.endsAt;
  const started = await w.send({ type: "start", domains: "example.com", minutes: 3 });
  await w.fire("focus-end", oldDeadline);
  assert.deepEqual((await w.send({ type: "status" })).active, started.active);
  w.failures.add("rulesUpdate");
  await w.send({ type: "stop" });
  const first = structuredClone(w.data.cleanup);
  await w.fire("focus-cleanup-1");
  await w.fire("focus-cleanup-2");
  const third = structuredClone(w.data.cleanup);
  await w.fire("focus-cleanup-1", first.retryAt);
  assert.deepEqual(w.data.cleanup, third);
  w.failures.add("read");
  await w.fire("focus-cleanup-3");
  w.failures.delete("read");
  assert.equal(w.data.cleanup.attempt, 4);
});
