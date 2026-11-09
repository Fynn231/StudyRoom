import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { Ambience } from "../src/Ambience.js";
import { useRoomAmbience } from "../src/useRoomAmbience.js";
import { SpotifyPresence, ListeningCard } from "../src/SpotifyPresence.js";
const fixture = (playing = true, observedAt = Date.now()) => ({
  title: "Chosen track",
  artist: "Chosen artist",
  url: "https://open.spotify.com/track/0123456789ABCDEFGHIJKL",
  positionMs: 1000,
  durationMs: 180000,
  playing,
  observedAt,
});
test("only fresh owner playback stops room output; pause never resumes and old account replies cannot suppress", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    AudioContext: class {
      constructor() {
        throw Error("Synthetic device unavailable");
      }
    },
  });
  const rtl = await import("@testing-library/react");
  const oldFetch = globalThis.fetch;
  let track: any = null;
  let release: ((value: Response) => void) | undefined;
  globalThis.fetch = async (url) =>
    String(url).endsWith("/disconnect")
      ? Response.json({ ok: true })
      : release === undefined
        ? Response.json({ track })
        : new Promise((resolve) => {
            release = resolve;
          });
  t.after(() => {
    rtl.cleanup();
    globalThis.fetch = oldFetch;
    dom.window.close();
  });
  function Host({ locked = false }: { locked?: boolean }) {
    const room = useRoomAmbience(locked);
    return (
      <>
        <output data-testid="stopped">{String(room.preference.stopped)}</output>
        <output data-testid="choices">{JSON.stringify(room.preference)}</output>
        <button onClick={room.prepare}>Continue</button>
        <button onClick={room.play}>Play room</button>
        <button onClick={() => room.change({ volume: 0.17, rain: true, rainVolume: 0.23 })}>
          Choose rain
        </button>
        <Ambience room={room} onWelcome={() => {}} />
        <SpotifyPresence />
        <ListeningCard track={fixture()} />
      </>
    );
  }
  const v = rtl.render(<Host />);
  const q = rtl.within(v.container);
  const refresh = async () => {
    rtl.fireEvent.click(q.getByText("Refresh listening status"));
    await rtl.act(async () => {});
  };
  assert.equal(
    q.getByTestId("stopped").textContent,
    "false",
    "remote peer activity is not owner playback",
  );
  await refresh();
  assert.equal(
    q.getByTestId("stopped").textContent,
    "false",
    "null track does not confirm playback",
  );
  track = fixture(true, Date.now() - 100000);
  await refresh();
  assert.equal(
    q.getByTestId("stopped").textContent,
    "false",
    "stale track does not confirm playback",
  );
  rtl.fireEvent.click(q.getByText("Choose rain"));
  track = fixture();
  // Hidden tabs still need owner status while room audio is running.
  await rtl.act(async () => dom.window.dispatchEvent(new dom.window.Event("focus")));
  assert.equal(
    q.getByTestId("stopped").textContent,
    "true",
    "owner playback must stop the original soundtrack AND rain",
  );
  assert.match(v.container.textContent!, /Pause Spotify or unload the selected provider/);
  assert.equal((q.getByText("Play room audio") as HTMLButtonElement).disabled, true);
  for (const name of ["Continue", "Play room", "Choose rain"])
    rtl.fireEvent.click(q.getByText(name));
  v.rerender(<Host locked />);
  assert.equal(
    q.getByTestId("stopped").textContent,
    "true",
    "gestures, Play and modes cannot bypass active Spotify",
  );
  const choices = JSON.parse(q.getByTestId("choices").textContent!);
  assert.equal(choices.volume, 0.17);
  assert.equal(choices.rain, true);
  assert.equal(choices.rainVolume, 0.23);
  track = null;
  await refresh();
  rtl.fireEvent.click(q.getByText("Play room"));
  assert.equal(
    q.getByTestId("stopped").textContent,
    "true",
    "unknown state is not proof Spotify paused",
  );
  track = fixture(false);
  await refresh();
  assert.equal(q.getByTestId("stopped").textContent, "true", "no auto-resume on pause");
  rtl.fireEvent.click(q.getByText("Continue"));
  assert.equal(q.getByTestId("stopped").textContent, "true");
  rtl.fireEvent.click(q.getByText("Play room"));
  assert.equal(
    q.getByTestId("stopped").textContent,
    "false",
    "explicit Play after confirmed pause",
  );
  track = fixture();
  await refresh();
  rtl.fireEvent.click(q.getByText("Disconnect Spotify connection"));
  await rtl.act(async () => {});
  rtl.fireEvent.click(q.getByText("Play room"));
  assert.equal(
    q.getByTestId("stopped").textContent,
    "true",
    "disconnecting status access does not prove external Spotify stopped",
  );
  track = fixture(false);
  await refresh();
  rtl.fireEvent.click(q.getByText("Play room"));
  assert.equal(q.getByTestId("stopped").textContent, "false");
  release = () => {};
  rtl.fireEvent.click(q.getByText("Refresh listening status"));
  rtl.fireEvent.click(q.getByText("Disconnect Spotify connection"));
  await rtl.act(async () => {});
  await rtl.act(async () => release!(Response.json({ track: fixture() })));
  assert.equal(
    q.getByTestId("stopped").textContent,
    "false",
    "late response from disconnected account ignored",
  );
});

test("out-of-order owner refresh cannot replace newer playback with an older pause", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const rtl = await import("@testing-library/react"),
    oldFetch = globalThis.fetch;
  const replies: Array<(v: Response) => void> = [];
  globalThis.fetch = async () => new Promise((resolve) => replies.push(resolve));
  t.after(() => {
    rtl.cleanup();
    globalThis.fetch = oldFetch;
    dom.window.close();
  });
  function Host() {
    const room = useRoomAmbience(false);
    return (
      <>
        <output data-testid="stopped">{String(room.preference.stopped)}</output>
        <button onClick={room.play}>Room Play</button>
        <SpotifyPresence />
      </>
    );
  }
  const v = rtl.render(<Host />),
    q = rtl.within(v.container);
  rtl.fireEvent.click(q.getByText("Refresh listening status"));
  rtl.fireEvent.click(q.getByText("Refresh listening status"));
  await rtl.act(async () => replies[1](Response.json({ track: fixture() })));
  await rtl.act(async () => replies[0](Response.json({ track: fixture(false) })));
  rtl.fireEvent.click(q.getByText("Room Play"));
  assert.equal(
    q.getByTestId("stopped").textContent,
    "true",
    "an old paused response must not unlock room Play over known current playback",
  );
});
