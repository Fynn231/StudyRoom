import { normalizeDomains, blockRules } from "./rules.js";

// Boot is inert: Chrome can deliver an already-consumed one-shot as the first
// event. Neither storage nor alarm rediscovery may veto that capability.
let queue = Promise.resolve();
let trusted;
let warning = false;
const observed = new Map();
const offsets = [0, 30000, 90000, 210000, 450000, 930000];
const maxGeneration = 1000000; // Maximum owned ID 50,000,050; no wrap/reuse.
const maxTime = 8640000000000000 - offsets[5];
const warningText =
  "Blocking safety could not be confirmed. Blocking was turned off where possible. Use Stop to retry; if Stop is not confirmed, disable or remove the extension.";
const legacyNames = ["focus-end", ...offsets.slice(1).map((_, i) => `focus-cleanup-${i + 1}`)];
const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
const ids = (lease) => Array.from({ length: 50 }, (_, i) => lease.ruleBase + i);
const same = (a, b) =>
  a?.v === 2 &&
  b?.v === 2 &&
  a.generation === b.generation &&
  a.endsAt === b.endsAt &&
  a.ruleBase === b.ruleBase &&
  a.ruleCount === b.ruleCount;
function identity(value) {
  return (
    value?.v === 2 &&
    integer(value.generation, 1, maxGeneration) &&
    integer(value.endsAt, 1, maxTime) &&
    value.ruleBase === value.generation * 50 + 1 &&
    integer(value.ruleCount, 1, 50)
  );
}
function leaseValid(value) {
  if (!identity(value) || !["prepared", "running", "releasing"].includes(value.phase)) return false;
  try {
    if (
      !Array.isArray(value.domains) ||
      value.domains.length !== value.ruleCount ||
      JSON.stringify(normalizeDomains(value.domains.join("\n"))) !== JSON.stringify(value.domains)
    )
      return false;
    if (value.earlyStop && !integer(value.earlyStop.anchor, 1, value.endsAt - 1)) return false;
    return true;
  } catch {
    return false;
  }
}
function envelope(lease, kind, anchor, slot) {
  return {
    name: `focus:v2:${lease.generation}:${lease.endsAt}:${lease.ruleBase}:${lease.ruleCount}:${kind}:${anchor}:${slot}`,
    scheduledTime: anchor + offsets[slot],
  };
}
function parse(alarm) {
  if (!alarm || typeof alarm.name !== "string" || alarm.periodInMinutes !== undefined) return null;
  const match =
    /^focus:v2:([1-9]\d*):([1-9]\d*):([1-9]\d*):([1-9]\d*):(expiry|earlyStop):([1-9]\d*):([0-5])$/.exec(
      alarm.name,
    );
  if (!match) return null;
  const [, g, end, base, count, kind, anchorText, slotText] = match;
  const lease = {
    v: 2,
    generation: Number(g),
    endsAt: Number(end),
    ruleBase: Number(base),
    ruleCount: Number(count),
  };
  const anchor = Number(anchorText),
    slot = Number(slotText);
  if (
    !identity(lease) ||
    !integer(anchor, 1, maxTime) ||
    (kind === "expiry" ? anchor !== lease.endsAt : anchor >= lease.endsAt || slot === 0) ||
    alarm.scheduledTime !== anchor + offsets[slot]
  )
    return null;
  return { ...lease, kind, anchor, slot };
}
const ownsId = (id) => integer(id, 1, maxGeneration * 50 + 50);
const ownsAlarm = (alarm) => legacyNames.includes(alarm.name) || !!parse(alarm);
async function badge(text) {
  try {
    await chrome.action.setBadgeText({ text });
  } catch {
    /* Cosmetic only. */
  }
}
async function warn() {
  warning = true;
  await badge("!");
  try {
    await chrome.storage.local.set({ focusWarning: true });
  } catch {
    /* Best effort. */
  }
}
async function clearWarning() {
  await chrome.storage.local.remove("focusWarning");
  if ((await chrome.storage.local.get("focusWarning")).focusWarning !== undefined)
    throw Error("Warning removal unconfirmed");
  warning = false;
  await badge("");
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
async function writeVerified(key, value) {
  await chrome.storage.local.set({ [key]: value });
  if (
    JSON.stringify(canonical((await chrome.storage.local.get(key))[key])) !==
    JSON.stringify(canonical(value))
  )
    throw Error("Persistence unconfirmed");
}
async function removeRules(removeRuleIds) {
  let updateError;
  try {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds });
  } catch (error) {
    updateError = error;
  }
  // A successful update with failed readback is not independently confirmed off.
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  if (rules.some((r) => removeRuleIds.includes(r.id)))
    throw updateError ?? Error("Removal unconfirmed");
}
async function clearNames(names) {
  let error;
  for (const name of names) {
    try {
      await chrome.alarms.clear(name);
      if (await chrome.alarms.get(name)) throw Error("Alarm removal unconfirmed");
    } catch (e) {
      error = e;
    }
  }
  if (error) throw error;
}
async function release(lease) {
  // No metadata/alarm/DNR-read prerequisite for this generation-scoped removal.
  await removeRules(ids(lease));
  // Keep remaining capabilities if control metadata cannot be read. Rules can
  // already be off, but housekeeping is not yet confirmed.
  const { active } = await chrome.storage.local.get("active");
  const alarms = await chrome.alarms.getAll();
  await clearNames(alarms.filter((a) => same(parse(a), lease)).map((a) => a.name));
  if ((await chrome.alarms.getAll()).some((a) => same(parse(a), lease)))
    throw Error("Alarm cleanup unconfirmed");
  if (same(active, lease)) {
    await chrome.storage.local.remove("active");
    if (same((await chrome.storage.local.get("active")).active, lease))
      throw Error("Metadata cleanup unconfirmed");
  }
  if (same(trusted, lease)) trusted = undefined;
  await badge("");
}
async function noteFailure(lease, delivered) {
  // Diagnostics only. An older persisted slot cannot veto a delivered envelope.
  try {
    const { active } = await chrome.storage.local.get("active");
    if (same(active, lease)) {
      const key = `${lease.generation}:${delivered?.kind ?? "manual"}`;
      const slot = Math.max(observed.get(key) ?? -1, delivered?.slot ?? -1);
      observed.set(key, slot);
      await chrome.storage.local.set({
        active: {
          ...active,
          phase: "releasing",
          observedSlot: Math.max(active.observedSlot ?? -1, slot),
        },
      });
    }
  } catch {
    /* Never a scheduling authority. */
  }
  await warn();
}
async function prepare(lease, kind, anchor) {
  const slots = kind === "expiry" ? [0, 1, 2, 3, 4, 5] : [1, 2, 3, 4, 5];
  for (const slot of slots) {
    const alarm = envelope(lease, kind, anchor, slot);
    await chrome.alarms.create(alarm.name, { when: alarm.scheduledTime });
  }
  for (const slot of slots) {
    const expected = envelope(lease, kind, anchor, slot);
    const actual = await chrome.alarms.get(expected.name);
    if (
      !same(parse(actual), lease) ||
      actual.scheduledTime !== expected.scheduledTime ||
      actual.name !== expected.name
    )
      throw Error("Alarm preparation unconfirmed");
  }
}
async function earlyStop(lease) {
  // This path is entered ONLY by an explicit failed Stop. Persist the one-time
  // intent BEFORE creating any quick slot. A crash/partial batch burns intent;
  // no later event fills holes or recreates consumed slots.
  const { active } = await chrome.storage.local.get("active");
  if (
    !leaseValid(active) ||
    !same(active, lease) ||
    active.earlyStop ||
    Date.now() >= active.endsAt
  )
    return;
  const intent = { ...active, phase: "releasing", earlyStop: { anchor: Date.now() } };
  await writeVerified("active", intent);
  trusted = intent;
  await prepare(intent, "earlyStop", intent.earlyStop.anchor);
}
async function releaseAll() {
  // Only explicit control/reconciliation events may discover all owned rules.
  // A delivered generation event NEVER calls this broad release routine.
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  if (rules.some((r) => !ownsId(r.id))) throw Error("Unknown rule identity");
  await removeRules(rules.map((r) => r.id));
  const alarms = await chrome.alarms.getAll();
  await clearNames(alarms.filter(ownsAlarm).map((a) => a.name));
  const { active } = await chrome.storage.local.get("active");
  if (active?.v === 2 && !identity(active)) throw Error("Unknown v2 identity");
  await chrome.storage.local.remove(["active", "cleanup"]);
  const after = await chrome.storage.local.get(["active", "cleanup"]);
  if (after.active !== undefined || after.cleanup !== undefined)
    throw Error("Metadata cleanup unconfirmed");
  trusted = undefined;
  await badge("");
}
async function stop(manual = false) {
  let lease = trusted;
  if (manual && !lease) {
    // A cold explicit Stop may have readable owned rules even while metadata is
    // slow/unavailable. Attempt removal first; metadata is for confirmation and
    // the optional one-time quick intent, never a gate on this best effort.
    try {
      const rules = await chrome.declarativeNetRequest.getSessionRules();
      if (rules.some((r) => !ownsId(r.id))) throw Error("Unknown rule identity");
      await removeRules(rules.map((r) => r.id));
    } catch {
      /* A subsequently readable trusted lease is another targeted route. */
    }
  }
  if (!lease) {
    try {
      const { active } = await chrome.storage.local.get("active");
      if (leaseValid(active)) lease = trusted = active;
    } catch {
      /* Readable actual rules remain an independent removal route. */
    }
  }
  try {
    if (lease) await release(lease);
    await releaseAll();
  } catch (error) {
    if (lease) {
      // Attempt quick allocation before diagnostics, but never let its failure
      // clear expiry capabilities or hide the immediate removal failure.
      if (manual) {
        try {
          await earlyStop(lease);
        } catch {
          /* Existing expiry slots retained. */
        }
      }
      await noteFailure(lease);
    } else await warn();
    throw error;
  }
}
function rulesMatch(rules, lease) {
  const expected = blockRules(lease.domains, lease.ruleBase);
  return (
    rules.length === expected.length &&
    expected.every((rule) => {
      const actual = rules.find((r) => r.id === rule.id);
      return (
        actual?.priority === rule.priority &&
        actual.action?.type === "block" &&
        actual.condition?.urlFilter === rule.condition.urlFilter &&
        actual.condition?.resourceTypes?.length === 1 &&
        actual.condition.resourceTypes[0] === "main_frame" &&
        Object.keys(actual.condition).every((key) => ["urlFilter", "resourceTypes"].includes(key))
      );
    })
  );
}
async function status() {
  try {
    const { active, cleanup, focusWarning } = await chrome.storage.local.get([
      "active",
      "cleanup",
      "focusWarning",
    ]);
    warning ||= focusWarning === true;
    if (!active) {
      const rules = await chrome.declarativeNetRequest.getSessionRules();
      const alarms = await chrome.alarms.getAll();
      if (rules.length || cleanup || alarms.some(ownsAlarm)) await stop();
      return { ok: true, active: null, ...(warning ? { warning: warningText } : {}) };
    }
    if (
      !leaseValid(active) ||
      active.phase !== "running" ||
      active.earlyStop ||
      cleanup ||
      active.endsAt <= Date.now() ||
      active.endsAt > Date.now() + 180 * 60000
    ) {
      await stop();
      return { ok: true, active: null, ...(warning ? { warning: warningText } : {}) };
    }
    trusted = active;
    if (!rulesMatch(await chrome.declarativeNetRequest.getSessionRules(), active)) {
      await stop();
      return { ok: true, active: null, ...(warning ? { warning: warningText } : {}) };
    }
    for (let slot = 0; slot <= 5; slot++) {
      const expected = envelope(active, "expiry", active.endsAt, slot);
      const alarm = await chrome.alarms.get(expected.name);
      if (!same(parse(alarm), active) || alarm.scheduledTime !== expected.scheduledTime) {
        await stop();
        await warn();
        return { ok: true, active: null, warning: warningText };
      }
    }
    return { ok: true, active, ...(warning ? { warning: warningText } : {}) };
  } catch (error) {
    try {
      await stop();
    } catch {
      /* Warning plus retained capabilities. */
    }
    await warn();
    throw error;
  }
}
async function start(message) {
  if (!Number.isInteger(message.minutes) || message.minutes < 1 || message.minutes > 180)
    throw Error("Choose 1–180 whole minutes.");
  const domains = normalizeDomains(message.domains);
  // Capture evidence BEFORE cleanup; missing/corrupt allocator is quarantine,
  // not permission to reset a previously used namespace.
  const prior = await chrome.storage.local.get(["active", "focusGeneration", "focusV2Evidence"]);
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const alarms = await chrome.alarms.getAll();
  const evidence =
    prior.active?.v === 2 ||
    prior.focusV2Evidence !== undefined ||
    rules.some((r) => r.id > 50) ||
    alarms.some((a) => a.name.startsWith("focus:v2:"));
  let generation = prior.focusGeneration;
  if (generation === undefined && !evidence) generation = 0;
  if (
    !integer(generation, 0, maxGeneration - 1) ||
    (evidence && generation === 0) ||
    (identity(prior.active) && generation < prior.active.generation) ||
    alarms.some((a) => parse(a)?.generation > generation) ||
    rules.some((r) => r.id > 50 && Math.floor((r.id - 1) / 50) > generation)
  )
    throw Error("Allocator unavailable/exhausted");
  await stop();
  generation++;
  await chrome.storage.local.set({ focusGeneration: generation, focusV2Evidence: true });
  const allocation = await chrome.storage.local.get(["focusGeneration", "focusV2Evidence"]);
  if (allocation.focusGeneration !== generation || allocation.focusV2Evidence !== true)
    throw Error("Allocation unconfirmed");
  const lease = {
    v: 2,
    generation,
    domains,
    endsAt: Date.now() + message.minutes * 60000,
    ruleBase: generation * 50 + 1,
    ruleCount: domains.length,
    phase: "prepared",
  };
  trusted = lease;
  try {
    await writeVerified("active", lease);
    await prepare(lease, "expiry", lease.endsAt);
    if (lease.endsAt <= Date.now()) throw Error("Preparation expired");
    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: blockRules(domains, lease.ruleBase),
    });
    if (!rulesMatch(await chrome.declarativeNetRequest.getSessionRules(), lease))
      throw Error("Enforcement unconfirmed");
    const active = { ...lease, phase: "running" };
    await writeVerified("active", active);
    trusted = active;
    await chrome.storage.local.set({ domains: domains.join("\n"), minutes: message.minutes });
    await clearWarning();
    return { ok: true, active };
  } catch (error) {
    try {
      await release(lease);
    } catch {
      await noteFailure(lease);
    }
    throw error;
  }
}
async function handle(message) {
  if (message?.type === "status") return status();
  if (message?.type === "stop") {
    await stop(true);
    await clearWarning();
    return { ok: true, active: null };
  }
  if (message?.type === "start") return start(message);
  throw Error("Unknown command");
}
const enqueue = (fn) => {
  const task = queue.then(fn);
  queue = task.catch(() => {});
  return task;
};
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return false;
  enqueue(() => handle(message)).then(reply, async () => {
    await warn();
    reply({ ok: false, error: warningText });
  });
  return true;
});
chrome.alarms.onAlarm.addListener((alarm) => {
  const delivered = parse(alarm); // Snapshot synchronously, before queued awaits.
  if (delivered && alarm.scheduledTime <= Date.now()) {
    enqueue(async () => {
      try {
        await release(delivered);
      } catch {
        await noteFailure(delivered, delivered);
      }
    });
  } else if (legacyNames.includes(alarm?.name)) {
    enqueue(async () => {
      // Release-only migration. Global legacy events never touch v2 IDs/state.
      try {
        await removeRules(Array.from({ length: 50 }, (_, i) => i + 1));
        await clearNames(legacyNames);
        const { active } = await chrome.storage.local.get("active");
        if (!active || active.v !== 2) await chrome.storage.local.remove(["active", "cleanup"]);
      } catch {
        await warn();
      }
    });
  }
});
for (const event of [chrome.runtime.onStartup, chrome.runtime.onInstalled])
  event.addListener(() => {
    enqueue(async () => {
      try {
        await stop();
      } catch {
        await warn();
      }
    });
  });
