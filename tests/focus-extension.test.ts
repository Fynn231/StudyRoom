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
  let alarm: { scheduledTime: number } | undefined;
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
        get: async () => {
          check("read");
          return structuredClone(data);
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
      get: async () => {
        check("alarmGet");
        return alarm;
      },
      create: async (_name: string, value: { when: number }) => {
        check("alarmCreate");
        alarm = { scheduledTime: value.when };
      },
      clear: async () => {
        check("alarmClear");
        alarm = undefined;
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
  await import(`../extension/background.js?test=${crypto.randomUUID()}`);
  const send = (message: any): Promise<any> =>
    new Promise((resolve) => listeners.message(message, { id: chrome.runtime.id }, resolve));
  return { send, data, failures, listeners, rules: () => rules, alarm: () => alarm };
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
