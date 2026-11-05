import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { request, type IncomingHttpHeaders } from "node:http";
import { createStudyServer } from "../server/app.js";
import { siteHandler } from "../server/site.js";

const audio = "/audio/whimsical-study-loop.mp3";
const origin = "https://studyroom.example.test";
// Send the exact proxy Host, independent of fetch's forbidden-header behavior.
function readHttp(url: string, headers: Record<string, string>, method = "GET") {
  return new Promise<{ status: number | undefined; headers: IncomingHttpHeaders; body: Buffer }>(
    (resolve, reject) => {
      const req = request(url, { headers, method }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("error", reject);
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }),
        );
      });
      req.setTimeout(5000, () => req.destroy(new Error("Local HTTP fixture timed out")));
      req.on("error", reject);
      req.end();
    },
  );
}

test("hosted approved audio tolerates proxy Host rewriting without opening protected routes", async () => {
  const config = {
    STUDY_DEPLOYMENT_MODE: "hosted",
    STUDY_PROXY_POLICY: "render",
    STUDY_PUBLIC_ORIGIN: origin,
    SUPABASE_URL: "https://auth.fixture.invalid",
    SUPABASE_ANON_KEY: "sb_publishable_audiofixture",
  };
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(config)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  let app: ReturnType<typeof createStudyServer> | undefined;
  try {
    app = createStudyServer(siteHandler);
    const base = await app.listen(0);
    const expected = await readFile(
      new URL("../public/audio/whimsical-study-loop.mp3", import.meta.url),
    );
    for (const navigationOrigin of [origin, "https://different-origin.example.test"]) {
      const headers = { Host: "internal.proxy", Origin: navigationOrigin };
      const response = await readHttp(base + audio, headers);
      assert.equal(response.status, 200, "approved public music must survive proxy Host rewriting");
      assert.equal(response.headers["content-type"], "audio/mpeg");
      assert.equal(response.headers["access-control-allow-origin"], undefined);
      assert.deepEqual(response.body, expected);
      const head = await readHttp(base + audio, headers, "HEAD");
      assert.equal(head.status, 200);
      assert.equal(head.headers["content-type"], "audio/mpeg");
      assert.equal(head.body.byteLength, 0);
    }
    const headers = { Host: "internal.proxy", Origin: origin };
    assert.equal((await readHttp(base + "/audio/not-approved.mp3", headers)).status, 403);
    assert.equal((await readHttp(base + audio, headers, "POST")).status, 403);
    const protectedResponse = await readHttp(base + "/api/ai/hybrid/account-plans", {
      Host: "studyroom.example.test",
      Origin: origin,
    });
    assert.equal(
      protectedResponse.status,
      401,
      "public music does not bypass account authentication",
    );
  } finally {
    await app?.close();
    for (const key of Object.keys(config)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("local audio still rejects a non-loopback Host and foreign Origin", async () => {
  const app = createStudyServer(siteHandler);
  try {
    const base = await app.listen(0);
    const response = await readHttp(base + audio, { Host: "internal.proxy", Origin: origin });
    assert.equal(response.status, 403);
  } finally {
    await app.close();
  }
});
