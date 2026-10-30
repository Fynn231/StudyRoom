import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { generateKeyPairSync, sign } from "node:crypto";
import { createMusicHandler } from "../server/music.js";
test("read-only Spotify connection fetches genuine bounded activity, shares only verified owner and rejects playback scope", async () => {
  const config = {
      supabaseUrl: "https://synthetic-presence.invalid",
      anonKey: "sb_publishable_synthetic",
      publicOrigin: "https://study.example",
    },
    keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }),
    encode = (v: unknown) =>
      Buffer.from(JSON.stringify(v)).toString("base64url");
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
  let responseStatus = 200,
    malformed = false;
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
            scope: "user-read-currently-playing",
          });
        assert.equal(
          input,
          "https://api.spotify.com/v1/me/player/currently-playing",
        );
        assert.equal(
          (init?.headers as any).Authorization,
          "Bearer SYNTHETIC_ONLY",
        );
        if (responseStatus !== 200)
          return new Response(null, { status: responseStatus });
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
  const server = createServer(
    (req, res) => void handler(req, res, { user, token }),
  );
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
    const begin = await call(
      "/api/music/spotify/begin?purpose=listening",
      "POST",
    );
    assert.equal(begin.status, 200, await begin.clone().text());
    cookie = begin.headers.get("set-cookie")!.split(";")[0];
    const auth = new URL((await begin.json()).url);
    assert.equal(auth.searchParams.get("scope"), "user-read-currently-playing");
    const callback = await call(
      "/api/music/spotify/callback?code=synthetic&state=" +
        auth.searchParams.get("state"),
    );
    assert.equal(callback.status, 303);
    cookie = callback.headers.get("set-cookie")!.split(";")[0];
    assert.equal((await call("/api/music/spotify/token", "POST")).status, 403);
    const listen = await call("/api/music/spotify/listening");
    assert.equal(listen.status, 200);
    const result = await listen.json();
    assert.equal(result.track.title, "Synthetic song");
    assert.equal(JSON.stringify(result).includes("SYNTHETIC_ONLY"), false);
    assert.equal(shared.length, 0);
    const target = { roomCode: "ABC123", participantId: "synthetic-peer" };
    assert.equal(
      (await call("/api/music/spotify/share-listening", "POST", target)).status,
      200,
    );
    assert.equal(shared.length, 1);
    assert.equal(shared[0][0].subject, "one");
    assert.equal(shared[0][0].sessionId, "session-one");
    assert.deepEqual(shared[0][2], target);
    malformed = true;
    assert.equal((await call("/api/music/spotify/listening")).status, 502);
    malformed = false;
    responseStatus = 429;
    assert.equal((await call("/api/music/spotify/listening")).status, 429);
    responseStatus = 204;
    assert.equal(
      (await (await call("/api/music/spotify/listening")).json()).track,
      null,
    );
    await call("/api/music/spotify/hide-listening", "POST", target);
    assert.equal(shared.at(-1)[1], null);
  } finally {
    handler.close();
    await new Promise<void>((r) => server.close(() => r()));
    globalThis.fetch = old;
  }
});
