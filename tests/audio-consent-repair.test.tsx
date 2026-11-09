import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { SpotifyPresence } from "../src/SpotifyPresence.js";
import { Ambience } from "../src/Ambience.js";
import { useRoomAmbience } from "../src/useRoomAmbience.js";
import { createOwnerPlaybackSignal, holdSelectedProvider } from "../src/audioArbitration.js";
const target = { roomCode: "ABC123", participantId: "owner" };
const track = {
  title: "Synthetic",
  artist: "Fixture",
  url: "https://open.spotify.com/track/0123456789ABCDEFGHIJKL",
  positionMs: 0,
  durationMs: 10000,
  playing: true,
  observedAt: Date.now(),
};
async function setup(t: any) {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: "http://localhost",
    pretendToBeVisual: true,
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const rtl = await import("@testing-library/react");
  const old = globalThis.fetch;
  t.after(() => {
    rtl.cleanup();
    globalThis.fetch = old;
    dom.window.close();
  });
  return rtl;
}
test("delayed sharing refresh cannot restore consent after Stop or target change", async (t) => {
  const rtl = await setup(t);
  let delayed = false;
  let release!: (r: Response) => void;
  globalThis.fetch = async (url) =>
    String(url).includes("share-listening") && delayed
      ? new Promise((r) => (release = r))
      : Response.json({ track: null });
  // Capture only the real sharing interval; private monitoring remains independent.
  const oldInterval = globalThis.setInterval;
  let tick: (() => void) | undefined;
  globalThis.setInterval = ((fn: any, ms: number, ...args: any[]) => {
    if (ms === 30000) tick = fn;
    return oldInterval(fn, ms, ...args);
  }) as any;
  t.after(() => {
    globalThis.setInterval = oldInterval;
  });
  const w = rtl.render(<SpotifyPresence target={target} />),
    s = rtl.within(w.container);
  rtl.fireEvent.click(s.getByText("Share Spotify status with room"));
  await rtl.act(async () => {});
  globalThis.setInterval = oldInterval;
  delayed = true;
  await rtl.act(async () => tick!());
  rtl.fireEvent.click(s.getByText("Stop sharing Spotify with room"));
  await rtl.act(async () => {});
  await rtl.act(async () => release(Response.json({ track: null })));
  assert.ok(
    s.queryByText("Share Spotify status with room"),
    "late refresh must not resurrect sharing after Stop",
  );
  delayed = false;
  rtl.fireEvent.click(s.getByText("Share Spotify status with room"));
  await rtl.act(async () => {});
  delayed = true;
  await rtl.act(async () => tick!());
  w.rerender(<SpotifyPresence target={{ roomCode: "XYZ789", participantId: "new-owner" }} />);
  await rtl.act(async () => release(Response.json({ track: null })));
  assert.ok(
    s.queryByText("Share Spotify status with room"),
    "old target reply must not grant new target consent",
  );
});
for (const success of [true, false]) {
  test(`reconnect clears sharing UI when consent ${success ? "opens" : "fails"}`, async (t) => {
    const rtl = await setup(t);
    window.open = () => null;
    globalThis.fetch = async (url) =>
      String(url).includes("/begin")
        ? success
          ? Response.json({ url: "https://accounts.spotify.com/authorize" })
          : new Response(null, { status: 503 })
        : Response.json({ track: null });
    const view = rtl.render(<SpotifyPresence target={target} />);
    const q = rtl.within(view.container);
    rtl.fireEvent.click(q.getByRole("button", { name: "Share Spotify status with room" }));
    await rtl.act(async () => {});
    assert.equal(
      q
        .getByRole("button", { name: "Stop sharing Spotify with room" })
        .getAttribute("aria-pressed"),
      "true",
    );
    rtl.fireEvent.click(q.getByRole("button", { name: "Connect Spotify listening status" }));
    await rtl.act(async () => {});
    assert.equal(
      q
        .getByRole("button", { name: "Share Spotify status with room" })
        .getAttribute("aria-pressed"),
      "false",
    );
  });
}
test("uncertain observation recovery is explicit, retains preferences and cannot clear SDK or embed guards", async (t) => {
  const rtl = await setup(t);
  let item: any = track,
    fail = false;
  globalThis.fetch = async (url) =>
    String(url).includes("/begin")
      ? Response.json({ url: "https://accounts.spotify.com/authorize" })
      : fail
        ? new Response(null, { status: 502 })
        : Response.json({ track: item });
  window.open = () => null;
  function Host() {
    const room = useRoomAmbience(false);
    return (
      <>
        <SpotifyPresence />
        <Ambience room={room} onWelcome={() => {}} />
        <output>{JSON.stringify(room.preference)}</output>
      </>
    );
  }
  const v = rtl.render(<Host />),
    q = rtl.within(v.container);
  const click = async (name: string) => {
    rtl.fireEvent.click(q.getByText(name));
    await rtl.act(async () => {});
  };
  await click("Refresh listening status");
  assert.equal(
    q.queryByText("I paused Spotify — release uncertain status"),
    null,
    "confirmed playback has no recovery bypass",
  );
  await click("Disconnect Spotify connection");
  await click("Connect Spotify listening status");
  item = null;
  await click("Refresh listening status");
  await click("Refresh listening status");
  fail = true;
  await click("Refresh listening status");
  assert.equal((q.getByText("Play room audio") as HTMLButtonElement).disabled, true);
  const before = v.container.querySelector("output")!.textContent;
  assert.match(v.container.textContent!, /Pause Spotify in its app first/);
  const sdk = createOwnerPlaybackSignal();
  await rtl.act(async () => sdk.report("playing"));
  await click("I paused Spotify — release uncertain status");
  assert.equal(
    (q.getByText("Play room audio") as HTMLButtonElement).disabled,
    true,
    "SDK still blocks",
  );
  await rtl.act(async () => sdk.dispose());
  assert.equal((q.getByText("Play room audio") as HTMLButtonElement).disabled, false);
  assert.equal(
    v.container.querySelector("output")!.textContent,
    before,
    "recovery never autoplays or changes preferences",
  );
  let releaseEmbed!: () => void;
  await rtl.act(async () => {
    releaseEmbed = holdSelectedProvider();
  });
  assert.equal((q.getByText("Play room audio") as HTMLButtonElement).disabled, true);
  await rtl.act(async () => releaseEmbed());
  fail = false;
  item = { ...track, observedAt: Date.now() };
  await click("Refresh listening status");
  assert.equal(
    (q.getByText("Play room audio") as HTMLButtonElement).disabled,
    true,
    "fresh playback suppresses again",
  );
});
