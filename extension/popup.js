import { normalizeDomains } from "./rules.js";
const domains = document.getElementById("domains"),
  minutes = document.getElementById("minutes"),
  status = document.getElementById("status");
// Responses can arrive after a newer action. Only the latest intent may render;
// polling must not replace an in-progress Start/Stop or its recovery message.
let revision = 0;
let pendingActions = 0;
const describe = (active) => {
  status.textContent = active
    ? `Blocking ${active.domains.length} selected sites until ${new Date(active.endsAt).toLocaleTimeString()}.`
    : "Blocking is off.";
};
document.getElementById("start").addEventListener("click", async () => {
  const request = ++revision;
  pendingActions++;
  try {
    const values = normalizeDomains(domains.value);
    const length = Number(minutes.value);
    if (!Number.isInteger(length) || length < 1 || length > 180)
      throw Error("Choose 1–180 whole minutes.");
    status.textContent = "Starting blocking…";
    const result = await chrome.runtime.sendMessage({
      type: "start",
      domains: values.join("\n"),
      minutes: length,
    });
    if (!result?.ok)
      throw Error(result?.error ?? "Blocking could not start. Use Stop to clear rules.");
    if (request === revision) describe(result.active);
  } catch (error) {
    if (request === revision) status.textContent = error.message ?? "Blocking could not start.";
  } finally {
    pendingActions--;
  }
});
document.getElementById("stop").addEventListener("click", async () => {
  const request = ++revision;
  pendingActions++;
  status.textContent = "Stopping blocking…";
  try {
    const result = await chrome.runtime.sendMessage({ type: "stop" });
    if (!result?.ok) throw Error();
    if (request === revision) describe(null);
  } catch {
    if (request === revision)
      status.textContent =
        "Stop was not confirmed. Disable the extension in browser settings if needed.";
  } finally {
    pendingActions--;
  }
});

// Attach Stop before reading storage: a failed preference read must not disable recovery.
async function refreshStatus() {
  if (pendingActions) return;
  const request = ++revision;
  try {
    const result = await chrome.runtime.sendMessage({ type: "status" });
    if (!result?.ok) throw Error("Status unavailable");
    if (request === revision) describe(result.active);
  } catch {
    if (request === revision)
      status.textContent =
        "Status unavailable. Use Stop to clear blocking; if Stop is not confirmed, disable the extension in browser settings.";
  }
}
document.getElementById("refresh")?.addEventListener("click", refreshStatus);
try {
  const saved = await chrome.storage.local.get(["domains", "minutes"]);
  domains.value = typeof saved.domains === "string" ? saved.domains : "";
  minutes.value = Number.isInteger(saved.minutes) ? String(saved.minutes) : "25";
} catch {
  // Preferences are optional; explicit Start/Stop remain available.
}
await refreshStatus();
// A popup can remain open past expiry. Never leave a stale 'Blocking' claim on screen.
setInterval(refreshStatus, 5000);
