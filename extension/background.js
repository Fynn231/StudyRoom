import { normalizeDomains, blockRules } from "./rules.js";
let queue = Promise.resolve();
async function stop() {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: rules.map((r) => r.id),
  });
  await chrome.alarms.clear("focus-end");
  await chrome.storage.local.remove("active");
}
async function sync() {
  try {
    return await reconcile();
  } catch (error) {
    // A lease/rule/alarm read or repair failure cannot establish bounded
    // enforcement. Attempt to fail open; if rule removal also fails, preserve
    // the existing alarm and report failure so Stop/disable remain explicit.
    await stop();
    throw error;
  }
}
async function reconcile() {
  const { active } = await chrome.storage.local.get("active");
  if (
    !active ||
    !Array.isArray(active.domains) ||
    !Number.isFinite(active.endsAt) ||
    active.endsAt <= Date.now() ||
    active.endsAt > Date.now() + 180 * 60000
  ) {
    await stop();
    return null;
  }
  // Storage is untrusted: reject malformed leases before the popup reports success.
  try {
    const canonical = normalizeDomains(active.domains.join("\n"));
    if (JSON.stringify(canonical) !== JSON.stringify(active.domains)) throw Error("Invalid lease");
  } catch {
    await stop();
    return null;
  }
  // A stored lease is intent, not proof of live browser enforcement. Do not
  // recreate lost rules: a browser restart or manual removal must stay off.
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const expected = blockRules(active.domains);
  const matches =
    rules.length === expected.length &&
    expected.every((rule) => {
      const actual = rules.find((candidate) => candidate.id === rule.id);
      return (
        actual?.priority === rule.priority &&
        actual.action?.type === "block" &&
        actual.condition?.urlFilter === rule.condition.urlFilter &&
        actual.condition?.resourceTypes?.length === 1 &&
        actual.condition.resourceTypes[0] === "main_frame" &&
        Object.keys(actual.condition).every((key) => ["urlFilter", "resourceTypes"].includes(key))
      );
    });
  if (!matches) {
    await stop();
    return null;
  }
  // Alarms can be lost independently of session rules. Restore the original
  // deadline on worker wake; never grant a fresh duration during recovery.
  const alarm = await chrome.alarms.get("focus-end");
  if (!alarm || alarm.scheduledTime !== active.endsAt || alarm.periodInMinutes) {
    await chrome.alarms.create("focus-end", { when: active.endsAt });
  }
  return active;
}
async function handle(message) {
  if (message?.type === "status") {
    const active = await sync();
    return { ok: true, active };
  }
  if (message?.type === "stop") {
    await stop();
    return { ok: true, active: null };
  }
  if (
    message?.type !== "start" ||
    !Number.isInteger(message.minutes) ||
    message.minutes < 1 ||
    message.minutes > 180
  )
    throw Error("Choose 1–180 whole minutes.");
  const domains = normalizeDomains(message.domains),
    endsAt = Date.now() + message.minutes * 60000;
  await stop();
  await chrome.alarms.create("focus-end", { when: endsAt });
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: blockRules(domains),
    });
    const active = { domains, endsAt };
    await chrome.storage.local.set({ active });
    await chrome.storage.local.set({
      domains: domains.join("\n"),
      minutes: message.minutes,
    });
    return { ok: true, active };
  } catch (error) {
    await stop();
    throw error;
  }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return false;
  const task = queue.then(() => handle(message));
  queue = task.catch(() => {});
  task.then(reply, () =>
    reply({
      ok: false,
      error: "Could not update blocking. Check domains and try again; use Stop to clear rules.",
    }),
  );
  return true;
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "focus-end") {
    queue = queue.then(stop).catch(() => {});
  }
});
chrome.runtime.onStartup.addListener(() => {
  queue = queue.then(stop).catch(() => {});
});
chrome.runtime.onInstalled.addListener(() => {
  queue = queue.then(stop).catch(() => {});
});
// Recover an expired lease whenever the service worker wakes.
queue = queue.then(sync).catch(() => {});
