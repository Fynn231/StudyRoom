import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { request } from "node:http";
import { io, type Socket } from "socket.io-client";
import { createStudyServer } from "../server/app.js";
// Synthetic identity/provider responses; actual authenticated HTTP and room sockets.
test("listening is room-scoped, independent of profiles, and bound to the current verified socket owner", async () => {
  const env = {
    STUDY_PROXY_POLICY: "render",
    STUDY_DEPLOYMENT_MODE: "hosted",
    STUDY_PUBLIC_ORIGIN: "https://room-listening.example",
    SUPABASE_URL: "https://room-listening-provider.invalid",
    SUPABASE_ANON_KEY: "sb_publishable_fixture",
    SPOTIFY_CLIENT_ID: "a".repeat(32),
  };
  const before = Object.fromEntries(
    Object.keys(env).map((k) => [k, process.env[k]]),
  );
  Object.assign(process.env, env);
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }),
    enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const jwt = (sub: string) => {
    const body = `${enc({ alg: "ES256", kid: "room-listening" })}.${enc({ sub, aud: "authenticated", iss: env.SUPABASE_URL + "/auth/v1", session_id: "session-" + sub, exp: Math.floor(Date.now() / 1000) + 300 })}`;
    return (
      body +
      "." +
      sign("sha256", Buffer.from(body), {
        key: keys.privateKey,
        dsaEncoding: "ieee-p1363",
      }).toString("base64url")
    );
  };
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("jwks.json"))
      return Response.json({
        keys: [
          {
            ...keys.publicKey.export({ format: "jwk" }),
            kid: "room-listening",
            alg: "ES256",
          },
        ],
      });
    if (url.endsWith("studyroom_session_active")) return Response.json(true);
    if (url === "https://accounts.spotify.com/api/token")
      return Response.json({
        access_token: "SYNTHETIC_ONLY",
        token_type: "Bearer",
        expires_in: 300,
        scope: "user-read-currently-playing",
      });
    if (url === "https://api.spotify.com/v1/me/player/currently-playing")
      return Response.json({
        currently_playing_type: "track",
        is_playing: true,
        progress_ms: 1000,
        item: {
          name: "Fixture track",
          artists: [{ name: "Fixture artist" }],
          duration_ms: 120000,
          external_urls: {
            spotify: "https://open.spotify.com/track/2KpZZ1cyChx3REhma5nOv6",
          },
        },
      });
    throw Error("Unexpected fixture upstream");
  };
  const app = createStudyServer(),
    sockets: Socket[] = [];
  try {
    const base = await app.listen(0),
      ownerToken = jwt("owner");
    async function connect(sub: string) {
      const s = io(base, {
        transports: ["websocket"],
        autoConnect: false,
        reconnection: false,
        extraHeaders: {
          Host: "room-listening.example",
          Origin: env.STUDY_PUBLIC_ORIGIN,
        },
        auth: { token: sub === "owner" ? ownerToken : jwt(sub) },
      });
      sockets.push(s);
      await new Promise<void>((resolve, reject) => {
        s.once("connect", resolve);
        s.once("connect_error", reject);
        s.connect();
      });
      return s;
    }
    const [owner, peer, stranger] = await Promise.all([
      connect("owner"),
      connect("peer"),
      connect("stranger"),
    ]);
    const send = (s: Socket, event: string, data = {}) =>
      s.timeout(2000).emitWithAck(event, data);
    const created = await send(owner, "room:create", { name: "Owner" });
    await send(peer, "room:join", { code: created.state.code, name: "Peer" });
    await send(stranger, "room:create", { name: "Other room" });
    let peerState: any,
      foreignUpdates = 0;
    peer.on("room:state", (s) => (peerState = s));
    stranger.on("room:state", () => foreignUpdates++);
    let cookie = "";
    const call = (path: string, method = "GET", body?: unknown) =>
      new Promise<{ status: number; headers: any; value: any }>(
        (resolve, reject) => {
          const req = request(
            base + path,
            {
              method,
              headers: {
                Host: "room-listening.example",
                Origin: env.STUDY_PUBLIC_ORIGIN,
                Authorization: "Bearer " + ownerToken,
                Cookie: cookie,
                "Content-Type": "application/json",
              },
            },
            (res) => {
              const parts: Buffer[] = [];
              res.on("data", (p) => parts.push(p));
              res.on("end", () => {
                const raw = Buffer.concat(parts).toString();
                resolve({
                  status: res.statusCode!,
                  headers: res.headers,
                  value: raw ? JSON.parse(raw) : null,
                });
              });
            },
          );
          req.on("error", reject);
          req.end(body ? JSON.stringify(body) : undefined);
        },
      );
    const begin = await call(
      "/api/music/spotify/begin?purpose=listening",
      "POST",
    );
    assert.equal(begin.status, 200);
    cookie = begin.headers["set-cookie"][0].split(";")[0];
    const state = new URL(begin.value.url).searchParams.get("state");
    const callback = await call(
      "/api/music/spotify/callback?code=fixture&state=" + state,
    );
    assert.equal(callback.status, 303);
    cookie = callback.headers["set-cookie"][0].split(";")[0];
    const target = { roomCode: created.state.code, participantId: owner.id };
    assert.equal(
      (await call("/api/music/spotify/share-listening", "POST", target)).status,
      200,
    );
    await new Promise((r) => setTimeout(r, 40));
    let person = peerState.participants.find((p: any) => p.id === owner.id);
    assert.equal(person.listening.title, "Fixture track");
    assert.equal(person.profile, undefined);
    assert.equal(foreignUpdates, 0);
    assert.equal(JSON.stringify(peerState).includes("SYNTHETIC_ONLY"), false);
    assert.equal(
      (
        await call("/api/music/spotify/share-listening", "POST", {
          ...target,
          participantId: peer.id,
        })
      ).status,
      502,
    );
    await send(owner, "profile:share", {
      profile: {
        displayName: "Owner profile",
        bio: "",
        accent: "sage",
        sessions: 0,
        minutes: 0,
      },
    });
    await send(owner, "profile:withdraw");
    await new Promise((r) => setTimeout(r, 30));
    person = peerState.participants.find((p: any) => p.id === owner.id);
    assert.equal(person.profile, undefined);
    assert.equal(person.listening.title, "Fixture track");
    assert.equal(
      (await call("/api/music/spotify/hide-listening", "POST", target)).status,
      200,
    );
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(
      peerState.participants.find((p: any) => p.id === owner.id).listening,
      undefined,
    );
  } finally {
    sockets.forEach((s) => s.disconnect());
    await app.close();
    globalThis.fetch = original;
    for (const key of Object.keys(env)) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
});
