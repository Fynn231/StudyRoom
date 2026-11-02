import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const origin = process.env.STUDY_VERIFY_ORIGIN ?? "https://studyroom-xbro.onrender.com";
assert.match(
  origin,
  /^https:\/\/[a-z0-9.-]+$/i,
  "Use an exact HTTPS origin, without path or credentials",
);
const revision = process.env.STUDY_EXPECTED_REVISION;
assert.match(
  revision ?? "",
  /^[a-f0-9]{40}$/,
  "Set STUDY_EXPECTED_REVISION to the reviewed full commit",
);
const results = {};
async function get(path, status) {
  const response = await fetch(new URL(path, origin), {
    redirect: "error",
    signal: AbortSignal.timeout(25000),
    // Never attach account cookies or authorization to this public-shell check.
  });
  assert.equal(response.status, status, `${path}: HTTP status`);
  const headers = response.headers;
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("referrer-policy"), "no-referrer");
  assert.match(headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.match(headers.get("strict-transport-security") ?? "", /max-age=31536000/);
  results[path] = { status, securityHeadersVerified: true };
  return response;
}
const health = await (await get("/healthz", 200)).json();
assert.equal(health.revision, revision, "Live revision differs from reviewed commit");
results["/healthz"].revision = health.revision;
const html = await (await get("/", 200)).text();
const assets = [
  ...new Set(
    [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)].map((m) => m[1]),
  ),
];
assert.ok(
  assets.some((a) => a.endsWith(".js")) && assets.some((a) => a.endsWith(".css")),
  "Missing built assets",
);
for (const asset of assets) {
  const bytes = Buffer.from(await (await get(asset, 200)).arrayBuffer());
  assert.deepEqual(
    bytes,
    readFileSync(resolve("dist", "." + asset)),
    `${asset}: differs from tested build`,
  );
  results[asset].sha256 = createHash("sha256").update(bytes).digest("hex");
}
await get("/api/config", 200);
await get("/missing-release-check", 404);
for (const path of ["/api/session", "/api/music/status", "/api/ai/status"]) await get(path, 401);
console.log(JSON.stringify(results, null, 2));
