import { normalizeDomains, blockRules } from "./rules.js";
let queue = Promise.resolve();
const cleanupLimit = 5;
let pendingCleanup;
async function readCleanup() {
  let stored, readError;
  try {
    stored = (await chrome.storage.local.get("cleanup")).cleanup;
  } catch (error) {
    readError = error;
  }
  // Keep the high-water mark through partial storage failures. On worker wake,
  // surviving alarms also carry the attempt and original retry deadline.
  let cleanup = pendingCleanup;
  if (stored && (!cleanup || stored.exhausted || stored.attempt > cleanup.attempt))
    cleanup = stored;
  if (!cleanup?.exhausted) {
    for (let attempt = 1; attempt <= cleanupLimit; attempt++) {
      const alarm = await chrome.alarms.get(`focus-cleanup-${attempt}`);
      if (alarm && Number.isFinite(alarm.scheduledTime) && (!cleanup || attempt > cleanup.attempt))
        cleanup = { attempt, retryAt: alarm.scheduledTime, exhausted: false };
    }
  }
  if (!cleanup && readError) throw readError;
  pendingCleanup = cleanup;
  return cleanup;
}
async function retryCleanup(consumedAttempt) {
  const previous = await readCleanup();
  if (consumedAttempt === 0 && previous) {
    try {
      await chrome.storage.local.set({ cleanup: previous });
    } catch {
      /* Retain the high-water mark in memory/alarm. */
    }
    if (
      !previous.exhausted &&
      Number.isInteger(previous.attempt) &&
      previous.attempt >= 1 &&
      previous.attempt <= cleanupLimit &&
      Number.isFinite(previous.retryAt)
    )
      await chrome.alarms.create(`focus-cleanup-${previous.attempt}`, { when: previous.retryAt });
    return;
  }
  const attempt = consumedAttempt + 1;
  const cleanup = {
    attempt,
    retryAt: Date.now() + 30000 * 2 ** (attempt - 1),
    exhausted: attempt > cleanupLimit,
  };
  pendingCleanup = cleanup;
  // Persist both intent and browser wake-up. Neither grants a new focus lease.
  try {
    await chrome.storage.local.set({ cleanup });
  } catch {
    /* Unknown state remains an error, never a success claim. */
  }
  if (!cleanup.exhausted)
    await chrome.alarms.create(`focus-cleanup-${attempt}`, { when: cleanup.retryAt });
}
async function stop(consumedAttempt = 0) {
  try {
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: rules.map((r) => r.id),
    });
    await chrome.alarms.clear("focus-end");
    await chrome.storage.local.remove("active");
    for (let attempt = 1; attempt <= cleanupLimit; attempt++)
      await chrome.alarms.clear(`focus-cleanup-${attempt}`);
    await chrome.storage.local.remove("cleanup");
    pendingCleanup = undefined;
  } catch (error) {
    await retryCleanup(consumedAttempt);
    throw error;
  }
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
  const { active, cleanup } = await chrome.storage.local.get(["active", "cleanup"]);
  if (cleanup || (await readCleanup())) throw Error("Cleanup unconfirmed");
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
      error:
        "Blocking state is unknown; cleanup was not confirmed. Use Stop to retry. If Stop is not confirmed, disable or remove the extension.",
    }),
  );
  return true;
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "focus-end") {
    queue = queue
      .then(async () => {
        const { active } = await chrome.storage.local.get("active");
        if (
          Number.isFinite(alarm.scheduledTime) &&
          active &&
          (alarm.scheduledTime !== active.endsAt || active.endsAt > Date.now())
        )
          return;
        await stop();
      })
      .catch(() => {});
  } else if (/^focus-cleanup-[1-5]$/.test(alarm.name)) {
    queue = queue
      .then(async () => {
        const cleanup = await readCleanup();
        const attempt = Number(alarm.name.split("-").at(-1));
        if (
          !cleanup ||
          cleanup.exhausted ||
          cleanup.attempt !== attempt ||
          (Number.isFinite(alarm.scheduledTime) && alarm.scheduledTime !== cleanup.retryAt)
        )
          return;
        await stop(attempt);
      })
      .catch(() => {});
  }
});
chrome.runtime.onStartup.addListener(() => {
  queue = queue.then(() => stop()).catch(() => {});
});
chrome.runtime.onInstalled.addListener(() => {
  queue = queue.then(() => stop()).catch(() => {});
});
// Recover an expired lease whenever the service worker wakes.
queue = queue
  .then(async () => {
    const cleanup = await readCleanup();
    if (cleanup) {
      if (
        !cleanup.exhausted &&
        Number.isInteger(cleanup.attempt) &&
        cleanup.attempt >= 1 &&
        cleanup.attempt <= cleanupLimit &&
        Number.isFinite(cleanup.retryAt)
      )
        await chrome.alarms.create(`focus-cleanup-${cleanup.attempt}`, { when: cleanup.retryAt });
      return;
    }
    await sync();
  })
  .catch(() => {});
