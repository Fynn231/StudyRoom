import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { generateKeyPairSync, sign } from "node:crypto";
import { createMusicHandler } from "../server/music.js";
test("synthetic backend delayed shares cannot publish after hide, target changes or session replacement", async (t) => {
  const config = {
      supabaseUrl: "https://synthetic-presence.invalid",
      anonKey: "sb_publishable_synthetic",
      publicOrigin: "https://study.example",
    },
    keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }),
    encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600,
    raw = `${encode({ alg: "ES256", kid: "presence" })}.${encode({ sub: "one", aud: "authenticated", iss: config.supabaseUrl + "/auth/v1", exp, session_id: "session-one" })}`,
    token = `${raw}.${sign("sha256", Buffer.from(raw), { key: keys.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  const user = {
    id: "one",
    sessionId: "session-one",
    expiresAt: exp * 1000,
    email: "",
    name: "",
  };
  const old = globalThis.fetch;
  globalThis.fetch = async (input) =>
    String(input).endsWith("jwks.json")
      ? Response.json({
          keys: [
            {
              ...keys.publicKey.export({ format: "jwk" }),
              kid: "presence",
              alg: "ES256",
            },
          ],
        })
      : Response.json(true);
  const shared: any[] = [];
  let grantedScope = "user-read-currently-playing";
  let responseStatus = 200,
    malformed = false;
  let delay: (() => Promise<Response>) | undefined;
  const handler = createMusicHandler(
    { clientId: "a".repeat(32), origin: config.publicOrigin },
    {
      auth: config,
      onListening: (...args) => shared.push(args),
      fetch: async (input, init) => {
        if (String(input) === "https://accounts.spotify.com/api/token")
          return Response.json({
            access_token: "SYNTHETIC_ONLY",
            token_type: "Bearer",
            expires_in: 3600,
            scope: grantedScope,
          });
        if (delay) return delay();
        assert.equal(input, "https://api.spotify.com/v1/me/player/currently-playing");
        assert.equal((init?.headers as any).Authorization, "Bearer SYNTHETIC_ONLY");
        if (responseStatus !== 200) return new Response(null, { status: responseStatus });
        return Response.json({
          currently_playing_type: "track",
          is_playing: true,
          progress_ms: 30000,
          item: {
            name: "Synthetic song",
            duration_ms: 180000,
            artists: [{ name: "Synthetic artist" }],
            external_urls: {
              spotify: malformed
                ? "https://evil.invalid"
                : "https://open.spotify.com/track/2KpZZ1cyChx3REhma5nOv6",
            },
            album: {
              images: [{ url: "https://i.scdn.co/image/" + "a".repeat(40) }],
            },
          },
        });
      },
    },
  );
  const server = createServer((req, res) => void handler(req, res, { user, token }));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + (server.address() as any).port;
  let cookie = "";
  const call = (path: string, method = "GET", body?: unknown) =>
    new Promise<Response>((resolve, reject) => {
      const request = httpRequest(
        base + path,
        {
          method,
          headers: {
            Host: "study.example",
            Origin: config.publicOrigin,
            Cookie: cookie,
            "Content-Type": "application/json",
          },
        },
        (response) => {
          const parts: Buffer[] = [];
          response.on("data", (p) => parts.push(p));
          response.on("end", () =>
            resolve(
              new Response(Buffer.concat(parts), {
                status: response.statusCode,
                headers: response.headers as Record<string, string>,
              }),
            ),
          );
        },
      );
      request.on("error", reject);
      request.end(body ? JSON.stringify(body) : undefined);
    });

  try {
    const begin = await call("/api/music/spotify/begin?purpose=listening", "POST");
    assert.equal(begin.status, 200, await begin.clone().text());
    cookie = begin.headers.get("set-cookie")!.split(";")[0];
    const auth = new URL((await begin.json()).url);
    assert.equal(auth.searchParams.get("scope"), "user-read-currently-playing");
    const callback = await call(
      "/api/music/spotify/callback?code=synthetic&state=" + auth.searchParams.get("state"),
    );
    assert.equal(callback.status, 303);
    cookie = callback.headers.get("set-cookie")!.split(";")[0];
    const target = { roomCode: "ABC123", participantId: "owner" };
    const other = { roomCode: "XYZ789", participantId: "owner-2" };
    // Existing public endpoint: a delayed upstream response crosses an acknowledged hide.
    let legacyRelease!: (v: Response) => void, legacyEntered!: () => void;
    const legacyStarted = new Promise<void>((r) => (legacyEntered = r));
    delay = () => {
      legacyEntered();
      return new Promise((r) => (legacyRelease = r));
    };
    const legacyPending = call("/api/music/spotify/share-listening", "POST", target);
    await legacyStarted;
    await call("/api/music/spotify/hide-listening", "POST", target);
    const legacyCount = shared.length;
    legacyRelease(new Response(null, { status: 204 }));
    await legacyPending;
    assert.equal(
      shared.length,
      legacyCount,
      "in-flight share cannot publish after acknowledged hide",
    );
    const payload = (id: string, start = true, where = target) => ({
      ...where,
      consentId: id,
      start,
    });
    const beginShare = async (id: string, where = target) => {
      delay = undefined;
      assert.equal(
        (await call("/api/music/spotify/share-listening", "POST", payload(id, true, where))).status,
        200,
      );
    };
    for (const status of [200, 204, 429]) {
      const id = "a".repeat(31) + String(status);
      await beginShare(id);
      let release!: (v: Response) => void;
      let entered!: () => void;
      const started = new Promise<void>((r) => (entered = r));
      delay = () => {
        entered();
        return new Promise((r) => (release = r));
      };
      const pending = call("/api/music/spotify/share-listening", "POST", payload(id, false));
      await started;
      await call("/api/music/spotify/hide-listening", "POST", target);
      const count = shared.length;
      // Even 204/error completion must not clear a later target publication.
      const secondId = "b".repeat(31) + String(status);
      await beginShare(secondId, other);
      const afterNew = shared.length;
      release(
        status === 200
          ? Response.json({
              currently_playing_type: "track",
              is_playing: true,
              progress_ms: 0,
              item: {
                name: "Delayed",
                duration_ms: 10000,
                artists: [{ name: "Fixture" }],
                external_urls: { spotify: "https://open.spotify.com/track/0123456789ABCDEFGHIJKL" },
              },
            })
          : new Response(null, { status }),
      );
      await pending;
      assert.equal(
        shared.length,
        afterNew,
        `old ${status} completion cannot publish after acknowledged hide/new target`,
      );
      assert.ok(afterNew > count);
      // A refresh arriving after hide cannot manufacture a new consent lifetime.
      await call("/api/music/spotify/hide-listening", "POST", other);
      const hidden = shared.length;
      await call("/api/music/spotify/share-listening", "POST", payload(secondId, false, other));
      assert.equal(shared.length, hidden, "refresh cannot restart revoked consent");
    }
    // Stop may arrive before the original start request reaches the server.
    const neverStarted = "d".repeat(32);
    await call("/api/music/spotify/hide-listening", "POST", { ...target, consentId: neverStarted });
    const hiddenBeforeStart = shared.length;
    assert.equal(
      (await call("/api/music/spotify/share-listening", "POST", payload(neverStarted))).status,
      409,
    );
    assert.equal(
      shared.length,
      hiddenBeforeStart,
      "delayed first start cannot override its acknowledged hide",
    );
    // An old hide must not revoke a newer explicit choice for the same room.
    const newest = "e".repeat(32);
    await beginShare(newest);
    await call("/api/music/spotify/hide-listening", "POST", { ...target, consentId: neverStarted });
    const beforeCurrentRefresh = shared.length;
    assert.equal(
      (await call("/api/music/spotify/share-listening", "POST", payload(newest, false))).status,
      200,
    );
    assert.equal(
      shared.length,
      beforeCurrentRefresh + 1,
      "new explicit consent survives an old hide",
    );
    await t.test("older hide cannot cancel newer share waiting for upstream", async () => {
      const older = "f".repeat(32),
        newer = "g".repeat(32);
      await beginShare(older);
      let release!: (r: Response) => void, entered!: () => void;
      const started = new Promise<void>((r) => (entered = r));
      delay = () => {
        entered();
        return new Promise((r) => (release = r));
      };
      const pending = call("/api/music/spotify/share-listening", "POST", payload(newer));
      await started;
      await call("/api/music/spotify/hide-listening", "POST", { ...target, consentId: older });
      release(new Response(null, { status: 204 }));
      assert.equal(
        (await pending).status,
        200,
        "old hide must not invalidate newer in-flight consent",
      );
      delay = undefined;
    });
    await t.test("older hide cannot cancel newer share waiting for its request body", async () => {
      delay = undefined;
      const older = "h".repeat(32),
        newer = "i".repeat(32);
      await beginShare(older);
      const entered = new Promise<void>((resolve) => server.once("request", () => resolve()));
      const text = JSON.stringify(payload(newer));
      let pendingRequest!: ReturnType<typeof httpRequest>;
      const pending = new Promise<Response>((resolve, reject) => {
        pendingRequest = httpRequest(
          base + "/api/music/spotify/share-listening",
          {
            method: "POST",
            headers: {
              Host: "study.example",
              Origin: config.publicOrigin,
              Cookie: cookie,
              "Content-Type": "application/json",
            },
          },
          (response) => {
            const chunks: Buffer[] = [];
            response.on("data", (part) => chunks.push(part));
            response.on("end", () =>
              resolve(new Response(Buffer.concat(chunks), { status: response.statusCode })),
            );
          },
        );
        pendingRequest.on("error", reject);
        pendingRequest.write(text.slice(0, 1));
      });
      await entered;
      await call("/api/music/spotify/hide-listening", "POST", { ...target, consentId: older });
      pendingRequest.end(text.slice(1));
      assert.equal((await pending).status, 200, "newer body must survive the old consent's hide");
      assert.equal(
        (await call("/api/music/spotify/share-listening", "POST", payload(newer, false))).status,
        200,
      );
    });
    for (const endpoint of [
      "/api/music/disconnect",
      "/api/music/spotify/begin?purpose=listening",
    ]) {
      await beginShare("c".repeat(32));
      let release!: (v: Response) => void, entered!: () => void;
      const started = new Promise<void>((r) => (entered = r));
      delay = () => {
        entered();
        return new Promise((r) => (release = r));
      };
      const pending = call(
        "/api/music/spotify/share-listening",
        "POST",
        payload("c".repeat(32), false),
      );
      await started;
      await call(endpoint, "POST");
      const count = shared.length;
      release(new Response(null, { status: 204 }));
      await pending;
      assert.equal(shared.length, count, "removed session cannot publish");
      // Restore a fresh synthetic session for the next case.
      delay = undefined;
      const begin = await call("/api/music/spotify/begin?purpose=listening", "POST");
      cookie = begin.headers.get("set-cookie")!.split(";")[0];
      const url = new URL((await begin.json()).url);
      const callback = await call(
        "/api/music/spotify/callback?code=fixture&state=" + url.searchParams.get("state"),
      );
      cookie = callback.headers.get("set-cookie")!.split(";")[0];
    }
  } finally {
    handler.close();
    await new Promise<void>((r) => server.close(() => r()));
    globalThis.fetch = old;
  }
});
