import { normalizeDomains } from "./rules.js";
const domains = document.getElementById("domains"),
  minutes = document.getElementById("minutes"),
  status = document.getElementById("status");
const describe = (active) => {
  status.textContent = active
    ? `Blocking ${active.domains.length} selected sites until ${new Date(active.endsAt).toLocaleTimeString()}.`
    : "Blocking is off.";
};
const saved = await chrome.storage.local.get(["domains", "minutes"]);
domains.value = saved.domains ?? "";
minutes.value = String(saved.minutes ?? 25);
try {
  describe((await chrome.runtime.sendMessage({ type: "status" })).active);
} catch {
  status.textContent = "Status unavailable. Use Stop to clear blocking.";
}
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
