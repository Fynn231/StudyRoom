import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transformSync } from "esbuild";
import * as realRules from "../../extension/rules.js";

// Browser-owned state survives worker death. Compile only module syntax; require
// links the actual rules module. No copied worker functions/reducer live here.
export async function focusWorker() {
  const source = transformSync(
    await readFile(new URL("../../extension/background.js", import.meta.url), "utf8"),
    { target: "es2022", format: "cjs" },
  ).code;
  const data: Record<string, any> = {};
  let rules: any[] = [];
  let now = 1_800_000_000_000;
  const alarms = new Map<string, any>();
  const failures = new Set<string>();
  const operations: { op: string; value?: any }[] = [];
  const listeners: Record<string, Function> = {};
  let hook: undefined | ((op: string, value: any) => void);
  function check(op: string, value?: any) {
    operations.push({ op, value: structuredClone(value) });
    hook?.(op, value);
    if (failures.has(op)) throw Error(op);
  }
  const chrome = {
    runtime: {
      id: "test-extension",
      ...Object.fromEntries(
        ["onMessage", "onStartup", "onInstalled"].map((key) => [
          key,
          {
            addListener: (fn: Function) => {
              listeners[key] = fn;
            },
          },
        ]),
      ),
    },
    action: {
      setBadgeText: async (value: any) => check("badge", value),
      setTitle: async (value: any) => check("title", value),
    },
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          check("read", keys);
          return Object.fromEntries(
            (Array.isArray(keys) ? keys : [keys])
              .filter((k) => k in data)
              .map((k) => [k, structuredClone(data[k])]),
          );
        },
        set: async (value: any) => {
          check("write", value);
          Object.assign(data, structuredClone(value));
        },
        remove: async (keys: string | string[]) => {
          check("remove", keys);
          for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
        },
      },
    },
    alarms: {
      get: async (name: string) => {
        check("alarmGet", name);
        return structuredClone(alarms.get(name));
      },
      getAll: async () => {
        check("alarmGetAll");
        return structuredClone([...alarms.values()]);
      },
      create: async (name: string, options: any) => {
        check("alarmCreate", { name, ...options });
        alarms.set(name, {
          name,
          scheduledTime: options.when,
          periodInMinutes: options.periodInMinutes,
        });
      },
      clear: async (name: string) => {
        check("alarmClear", name);
        return alarms.delete(name);
      },
      onAlarm: {
        addListener: (fn: Function) => {
          listeners.onAlarm = fn;
        },
      },
    },
    declarativeNetRequest: {
      getSessionRules: async () => {
        check("rulesRead");
        return structuredClone(rules);
      },
      updateSessionRules: async ({ removeRuleIds = [], addRules = [] }: any) => {
        check("rulesUpdate", { removeRuleIds, addRules });
        rules = [
          ...rules.filter((r) => !removeRuleIds.includes(r.id)),
          ...structuredClone(addRules),
        ];
      },
    },
  };
  let context: vm.Context;
  function boot() {
    for (const key of Object.keys(listeners)) delete listeners[key];
    context = vm.createContext({
      chrome,
      exports: {},
      require: (name: string) => {
        if (name !== "./rules.js") throw Error(`Unexpected import ${name}`);
        return realRules;
      },
      Date: class extends Date {
        static now() {
          return now;
        }
      },
    });
    vm.runInContext(source, context);
  }
  const drain = async () => {
    await vm.runInContext("queue", context);
  };
  boot();
  return {
    data,
    alarms,
    failures,
    operations,
    listeners,
    chrome,
    rules: () => structuredClone(rules),
    setRules: (value: any[]) => {
      rules = structuredClone(value);
    },
    setHook: (value: typeof hook) => {
      hook = value;
    },
    now: () => now,
    advance: (value: number) => {
      now = value;
    },
    boot,
    drain,
    send: (message: any): Promise<any> =>
      new Promise((resolve) => {
        listeners.onMessage(message, { id: chrome.runtime.id }, (result: any) =>
          resolve(structuredClone(result)),
        );
      }),
    dispatch: async (event: any, cold = false, gap = false) => {
      if (cold) boot();
      if (gap) await Promise.resolve();
      listeners.onAlarm(structuredClone(event));
      await drain();
    },
    consume: async (name: string, cold = false, gap = false) => {
      const event = structuredClone(alarms.get(name));
      if (!event) throw Error(`No retained alarm: ${name}`);
      alarms.delete(name); // Crucially BEFORE evaluating a fresh worker.
      now = Math.max(now, event.scheduledTime);
      if (cold) boot();
      if (gap) await Promise.resolve();
      listeners.onAlarm(event);
      await drain();
      return event;
    },
  };
}
export type FocusWorker = Awaited<ReturnType<typeof focusWorker>>;
export async function start(w: FocusWorker, minutes = 1) {
  const result = await w.send({ type: "start", domains: "example.com", minutes });
  if (!result.ok) throw Error(`Start failed: ${JSON.stringify(result)}`);
  return result.active;
}
export function slot(w: FocusWorker, index: number, kind = "expiry") {
  const entries = [...w.alarms.values()].filter(
    (a) =>
      a.name.includes(`:${kind}:`) || (kind === "expiry" && /^focus-(end|cleanup-)/.test(a.name)),
  );
  entries.sort((a, b) => a.scheduledTime - b.scheduledTime);
  return entries[index]?.name;
}
