import { test } from "node:test";
import assert from "node:assert/strict";
import { io } from "socket.io-client";
import { createStudyServer } from "../server/app.js";
import {
  validProfile,
  profileBadges,
  profileStats,
} from "../src/profileModel.js";
import { readCheckpoint, saveCheckpoint } from "../src/sessionCheckpoint.js";
import { normalizeDomains, blockRules } from "../extension/rules.js";
test("checkpoint is bounded and contains no draft; badges derive from recorded completions", () => {
  let raw: string | null = null;
  const storage = {
    getItem: () => raw,
    setItem: (_k: string, v: string) => {
      raw = v;
    },
  };
  assert.equal(readCheckpoint(storage), null);
  const value = {
    durationMs: 1500000,
    remainingMs: 1200000,
    savedAt: Date.now(),
  };
  assert.equal(saveCheckpoint(storage, value), true);
  assert.deepEqual(readCheckpoint(storage), value);
  raw = JSON.stringify({ ...value, intention: "private" });
  assert.equal(readCheckpoint(storage), null);
  raw = JSON.stringify({ ...value, remainingMs: -1 });
  assert.equal(readCheckpoint(storage), null);
  const records = [
    {
      id: "one",
      completedAt: new Date().toISOString(),
      focusedMs: 60000,
      plannedMs: 60000,
      stepsDone: 0,
      stepsTotal: 0,
      rating: null,
      focusRating: null,
    },
  ];
  assert.deepEqual(profileStats(records), { sessions: 1, minutes: 1 });
  assert.deepEqual(
    profileBadges({ sessions: 0, minutes: 0 }).map((b) => b.earned),
    [false, false, false],
  );
  assert.deepEqual(
    profileBadges({ sessions: 5, minutes: 300 }).map((b) => b.earned),
    [true, true, true],
  );
  assert.equal(
    validProfile({
      displayName: "Cedar",
      bio: "Reviewing quietly",
      accent: "sage",
      sessions: 1,
      minutes: 1,
    }),
    true,
  );
  assert.equal(
    validProfile({
      displayName: "Cedar",
      bio: "x",
      accent: "sage",
      sessions: 1,
      minutes: 1,
      notes: "private",
    }),
    false,
  );
});
test("optional blocker uses bounded exact domain rules and never collects page content", () => {
  assert.deepEqual(normalizeDomains("youtube.com\nreddit.com youtube.com"), [
    "youtube.com",
    "reddit.com",
  ]);
  for (const invalid of [
    "https://youtube.com/path",
    "*.com",
    "device.local",
    "host.localhost",
    "private.internal",
    "studyroom-xbro.onrender.com",
    "onrender.com",
    "127.0.0.1",
    "com",
    "",
  ])
    assert.throws(() => normalizeDomains(invalid));
  assert.deepEqual(blockRules(["youtube.com"]), [
    {
      id: 1,
      priority: 1,
      action: { type: "block" },
      condition: { urlFilter: "||youtube.com^", resourceTypes: ["main_frame"] },
    },
  ]);
});
test("real room peers receive explicit bounded profiles only in their room; withdraw/rejoin clear them", async (t) => {
  const app = createStudyServer();
  const base = await app.listen(0);
  const clients = [
    io(base, { forceNew: true }),
    io(base, { forceNew: true }),
    io(base, { forceNew: true }),
  ];
  t.after(async () => {
    clients.forEach((s) => s.disconnect());
    await app.close();
  });
  await Promise.all(
    clients.map((s) => new Promise<void>((r) => s.on("connect", () => r()))),
  );
  const [a, b, c] = clients;
  const send = (s: typeof a, event: string, data = {}) =>
    s.timeout(2000).emitWithAck(event, data);
  const first = await send(a, "room:create", { name: "Cedar" });
  await send(b, "room:join", { name: "Fern", code: first.state.code });
  const other = await send(c, "room:create", { name: "Other" });
  let peer: any, foreign: any;
  b.on("room:state", (state) => (peer = state));
  c.on("room:state", (state) => (foreign = state));
  const profile = {
    displayName: "Cedar profile",
    bio: "Quiet study",
    accent: "ocean",
    sessions: 1,
    minutes: 25,
  };
  const shared = await send(a, "profile:share", { profile });
  assert.equal(shared.ok, true);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(
    peer.participants.find((p: any) => p.id === a.id).profile,
    profile,
  );
  assert.equal(foreign, undefined);
  assert.equal(other.state.participants[0].profile, undefined);
  assert.equal(
    (
      await send(a, "profile:share", {
        profile: { ...profile, notes: "must reject" },
      })
    ).ok,
    false,
  );
  assert.equal(
    (
      await send(c, "profile:share", {
        profile: { ...profile, sessions: 999999 },
      })
    ).ok,
    false,
  );
  const withdrawn = await send(a, "profile:withdraw");
  assert.equal(
    withdrawn.state.participants.find((p: any) => p.id === a.id).profile,
    undefined,
  );
  await send(a, "profile:share", { profile });
  a.disconnect();
  await new Promise((r) => setTimeout(r, 40));
  a.connect();
  await new Promise<void>((r) => a.once("connect", () => r()));
  const rejoined = await send(a, "room:join", {
    name: "Cedar",
    code: first.state.code,
  });
  assert.equal(
    rejoined.state.participants.find((p: any) => p.id === a.id).profile,
    undefined,
  );
});
