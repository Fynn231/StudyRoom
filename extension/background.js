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
