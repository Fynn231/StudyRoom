import { normalizeDomains } from "./rules.js";
const domains = document.getElementById("domains"),
  minutes = document.getElementById("minutes"),
  status = document.getElementById("status");
const describe = (active) => {
  status.textContent = active
    ? `Blocking ${active.domains.length} selected sites until ${new Date(active.endsAt).toLocaleTimeString()}.`
    : "Blocking is off.";
};
document.getElementById("start").addEventListener("click", async () => {
  try {
    const values = normalizeDomains(domains.value);
    const length = Number(minutes.value);
    if (!Number.isInteger(length) || length < 1 || length > 180)
      throw Error("Choose 1–180 whole minutes.");
    const result = await chrome.runtime.sendMessage({
      type: "start",
      domains: values.join("\n"),
      minutes: length,
    });
    if (!result.ok) throw Error(result.error);
    describe(result.active);
  } catch (error) {
    status.textContent = error.message ?? "Blocking could not start.";
  }
});
document.getElementById("stop").addEventListener("click", async () => {
  try {
    const result = await chrome.runtime.sendMessage({ type: "stop" });
    if (!result.ok) throw Error();
    describe(null);
  } catch {
    status.textContent =
      "Stop was not confirmed. Disable the extension in browser settings if needed.";
  }
});

// Attach Stop before reading storage: a failed preference read must not disable recovery.
async function refreshStatus() {
  try {
    const result = await chrome.runtime.sendMessage({ type: "status" });
    if (!result?.ok) throw Error("Status unavailable");
    describe(result.active);
  } catch {
    status.textContent = "Status unavailable. Use Stop to clear blocking.";
  }
}
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
