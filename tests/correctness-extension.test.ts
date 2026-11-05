import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { blockRules, normalizeDomains } from "../extension/rules.js";

test("consumed expiry alarm with failed DNR cleanup persists bounded backoff across worker restart without extending lease", async () => {
  let now = 100000,
    fail = true;
  const deadline = now + 60000;
  const data: Record<string, any> = { active: { domains: ["example.com"], endsAt: deadline } };
  let rules = blockRules(data.active.domains),
    removals = 0;
  const alarms = new Map<string, { scheduledTime: number }>();
  const source = (
    await readFile(new URL("../extension/background.js", import.meta.url), "utf8")
  ).replace(/^import .*;\n/, "");
  async function boot() {
    const listeners: Record<string, Function> = {};
    const context = vm.createContext({
      normalizeDomains,
      blockRules,
      Date: class extends Date {
        static now() {
          return now;
        }
      },
      chrome: {
        runtime: {
          id: "test",
          onMessage: { addListener: (fn: Function) => (listeners.message = fn) },
          onStartup: { addListener: (fn: Function) => (listeners.startup = fn) },
          onInstalled: { addListener: (fn: Function) => (listeners.installed = fn) },
        },
        storage: {
          local: {
            get: async (keys: string | string[]) =>
              Object.fromEntries(
                (Array.isArray(keys) ? keys : [keys])
                  .filter((key) => key in data)
                  .map((key) => [key, structuredClone(data[key])]),
              ),
            set: async (value: any) => Object.assign(data, structuredClone(value)),
            remove: async (key: string) => {
              delete data[key];
            },
          },
        },
        declarativeNetRequest: {
          getSessionRules: async () => structuredClone(rules),
          updateSessionRules: async ({ removeRuleIds = [] }: any) => {
            removals++;
            if (fail) throw Error("DNR temporarily unavailable");
            rules = rules.filter((r) => !removeRuleIds.includes(r.id));
          },
        },
        alarms: {
          get: async (name: string) => alarms.get(name),
          create: async (name: string, value: { when: number }) => {
            alarms.set(name, { scheduledTime: value.when });
          },
          clear: async (name: string) => alarms.delete(name),
          onAlarm: { addListener: (fn: Function) => (listeners.alarm = fn) },
        },
      },
    });
    vm.runInContext(source, context);
    await vm.runInContext("queue", context);
    return {
      listeners,
      drain: () => vm.runInContext("queue", context),
      send: (message: any) =>
        new Promise<any>((resolve) => listeners.message(message, { id: "test" }, resolve)),
    };
  }
  let worker = await boot();
  assert.equal(alarms.get("focus-end")!.scheduledTime, deadline);
  now = deadline;
  alarms.delete("focus-end");
  worker.listeners.alarm({ name: "focus-end" });
  await worker.drain();
  assert.equal(rules.length, 1, "failed removal cannot claim blocking is off");
  assert.equal(data.active.endsAt, deadline, "original lease is never extended");
  let retry = [...alarms].find(([name]) => name.startsWith("focus-cleanup"));
  assert.ok(retry, "consumed expiry failure must schedule a persistent cleanup retry");
  assert.ok(data.cleanup, "cleanup uncertainty survives service-worker suspension");
  const firstRetry = retry[1].scheduledTime;
  worker = await boot();
  assert.equal(
    alarms.get(retry[0])!.scheduledTime,
    firstRetry,
    "worker wake cannot restart backoff",
  );
  let fired = 0,
    previousDelay = 0;
  while ((retry = [...alarms].find(([name]) => name.startsWith("focus-cleanup")))) {
    const delay = retry[1].scheduledTime - now;
    assert.ok(delay >= previousDelay);
    previousDelay = delay;
    now = retry[1].scheduledTime;
    alarms.delete(retry[0]);
    worker.listeners.alarm({ name: retry[0] });
    await worker.drain();
    fired++;
    assert.ok(fired <= 5, "automatic cleanup retries are bounded");
    assert.equal(data.active.endsAt, deadline);
  }
  assert.ok(data.cleanup.exhausted, "exhaustion is durable and truthful, not active success");
  const status = await worker.send({ type: "status" });
  assert.equal(status.ok, false);
  assert.match(status.error, /disable|remove/i);
  fail = false;
  const result = await worker.send({ type: "stop" });
  assert.equal(result.ok, true);
  assert.equal(result.active, null);
  assert.equal(rules.length, 0);
  assert.equal(data.active, undefined);
  assert.equal(data.cleanup, undefined);
  assert.equal(alarms.size, 0);
  assert.ok(removals > 1);
});
