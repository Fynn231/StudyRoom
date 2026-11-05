export function normalizeDomains(text) {
  if (typeof text !== "string" || text.length > 4000) throw Error("Use up to 50 website domains.");
  const domains = [
    ...new Set(
      text
        .split(/[\n,\s]+/)
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (!domains.length || domains.length > 50)
    throw Error("Choose 1–50 domains, such as youtube.com.");
  for (const host of domains)
    if (
      host.length > 253 ||
      /(?:^|\.)(?:localhost|local|internal)$/.test(host) ||
      !host.includes(".") ||
      !host.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
      /^[\d.]+$/.test(host) ||
      host === "studyroom-xbro.onrender.com" ||
      "studyroom-xbro.onrender.com".endsWith("." + host)
    )
      throw Error(
        "Use domain names only, without paths or wildcards. Study Room and local addresses cannot be blocked.",
      );
  return domains;
}
export function blockRules(domains, base = 1) {
  // A bounded positive signed-integer range is accepted by target Chromium.
  // Default IDs remain the reserved legacy range for existing callers.
  if (!Number.isSafeInteger(base) || base < 1 || base + domains.length - 1 > 50000050)
    throw Error("Invalid rule range");
  return domains.map((host, index) => ({
    id: base + index,
    priority: 1,
    action: { type: "block" },
    condition: { urlFilter: `||${host}^`, resourceTypes: ["main_frame"] },
  }));
}
