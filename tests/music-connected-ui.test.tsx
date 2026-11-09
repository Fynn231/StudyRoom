import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { useRoomAmbience } from "../src/useRoomAmbience.js";
import { Music } from "../src/Music.js";

test("synthetic SDK events, not connect or Play responses, determine playback; Silent tears down device", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: "http://127.0.0.1:4173",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const listeners = new Map<string, (event: any) => void>();
  let disconnected = 0;
  let paused = 0;
  let played = false;
  const playedUrls: string[] = [];
  let connected = 0;
  let sought = -1;
  let volume = -1;
  class Player {
    constructor(private options: any) {}
    addListener(name: string, fn: (event: any) => void) {
      listeners.set(name, fn);
    }
    async connect() {
      connected++;
      this.options.getOAuthToken((token: string) =>
        assert.equal(token, "SYNTHETIC_ACCESS"),
      );
      return true;
    }
    async activateElement() {}
    async pause() {
      paused++;
    }
    async togglePlay() {}
    async seek(position: number) {
      sought = position;
    }
    async setVolume(value: number) {
      volume = value;
    }
    disconnect() {
      disconnected++;
    }
  }
  Object.assign(dom.window, { Spotify: { Player } });
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/status"))
      return Response.json({
        spotify: { ready: true, authorized: true, blocker: null },
        apple: { ready: false, blocker: "disabled" },
      });
    if (String(url).endsWith("/token"))
      return Response.json({
        access_token: "SYNTHETIC_ACCESS",
        expiresAt: Date.now() + 60_000,
      });
    if (String(url).endsWith("/play")) {
      played = true;
      playedUrls.push(JSON.parse(init?.body as string).url);
      assert.equal(
        JSON.parse(init?.body as string).deviceId,
        "synthetic-device",
      );
      return Response.json({ requested: true });
    }
    return Response.json({ disconnected: true });
  };
  const rtl = await import("@testing-library/react");
  t.after(() => {
    rtl.cleanup();
    globalThis.fetch = original;
    dom.window.close();
  });
  function Host() {
    const room = useRoomAmbience(false);
    return <><output data-testid="stopped">{String(room.preference.stopped)}</output><button onClick={room.play}>Play room</button><Music /></>;
  }
  const view = rtl.render(<Host />);
  const q = rtl.within(view.container);
  rtl.fireEvent.change(q.getByLabelText("Spotify link"), {target:{value:"https://open.spotify.com/track/0123456789ABCDEFGHIJKL"}});
  rtl.fireEvent.click(q.getByRole("button",{name:"Select music link",hidden:true}));
  rtl.fireEvent.click(
    q.getByRole("button", { name: "Refresh connection", hidden: true }),
  );
  await rtl.waitFor(() =>
    assert.ok(q.getByRole("button", { name: "Play Spotify", hidden: true })),
  );
  rtl.fireEvent.click(
    q.getByRole("button", { name: "Play Spotify", hidden: true }),
  );
  await rtl.waitFor(() => assert.ok(listeners.has("ready")));
  await rtl.act(async () =>
    listeners.get("ready")!({ device_id: "synthetic-device" }),
  );
  assert.equal(
    view.container.textContent!.includes("Playing on this Spotify device."),
    false,
  );
  await rtl.waitFor(() => assert.equal(played, true));
  assert.equal(q.getByTestId("stopped").textContent, "false", "connecting and Play HTTP success do not confirm audio");
  await rtl.act(async () => listeners.get("player_state_changed")!(null));
  assert.equal(q.getByTestId("stopped").textContent, "false", "null SDK state is not playback");
  assert.equal(
    view.container.textContent!.includes("Playing on this Spotify device."),
    false,
  );
  await rtl.act(async () =>
    listeners.get("player_state_changed")!({
      paused: false,
      position: 10000,
      duration: 180000,
      track_window: {
        current_track: {
          name: "Synthetic study track",
          artists: [{ name: "Synthetic artist" }],
        },
      },
    }),
  );
  assert.ok(
    view.container.textContent!.includes("Playing on this Spotify device."),
  );
  assert.equal(q.getByTestId("stopped").textContent, "true", "confirmed owner SDK playback suppresses room audio");
  rtl.fireEvent.click(q.getByText("Play room"));
  assert.equal(q.getByTestId("stopped").textContent, "true");
  assert.ok(q.getByText("Synthetic study track"));
  rtl.fireEvent.change(q.getByLabelText("Track position"), {
    target: { value: "30000" },
  });
  rtl.fireEvent.change(q.getByLabelText("Spotify volume"), {
    target: { value: "0.25" },
  });
  assert.equal(sought, 30000);
  assert.equal(volume, 0.25);
  rtl.fireEvent.click(
    q.getByRole("button", {
      name: "Load selected Spotify player",
      hidden: true,
    }),
  );
  await rtl.waitFor(() =>
    assert.ok(
      disconnected > 0,
      "loading an embed tears down the connected device",
    ),
  );
  const beforeSilent = disconnected;
  const obsoleteState = listeners.get("player_state_changed")!;
  const playlist = "https://open.spotify.com/playlist/37i9dQZF1DX8NTLI2TtZa6";
  rtl.fireEvent.change(q.getByLabelText("Spotify link"), {
    target: { value: playlist },
  });
  rtl.fireEvent.click(
    q.getByRole("button", { name: "Select music link", hidden: true }),
  );
  assert.equal(
    playedUrls.length,
    1,
    "selecting a playlist alone never starts music",
  );
  rtl.fireEvent.click(
    q.getByRole("button", { name: "Play Spotify", hidden: true }),
  );
  await rtl.waitFor(() =>
    assert.equal(
      view.container.querySelector("iframe"),
      null,
      "enabling SDK unloads the embed",
    ),
  );
  await rtl.waitFor(() => assert.equal(connected, 2));
  await rtl.act(async () =>
    listeners.get("ready")!({ device_id: "synthetic-device" }),
  );
  await rtl.waitFor(() => assert.equal(playedUrls.at(-1), playlist));
  rtl.fireEvent.click(q.getByLabelText("Silent mode"));
  assert.ok(
    disconnected > beforeSilent,
    "Silent tears down an active SDK device",
  );
  assert.ok(paused > 0);
  rtl.fireEvent.click(q.getByText("Play room"));
  assert.equal(q.getByTestId("stopped").textContent, "false");
  await rtl.act(async () => obsoleteState({paused:false,position:1,duration:1000,track_window:{current_track:{name:"Old account",artists:[]}}}));
  assert.equal(q.getByTestId("stopped").textContent, "false", "old SDK generation cannot suppress audio");
  assert.equal(
    JSON.stringify(
      [...Array(dom.window.localStorage.length)].map((_, i) =>
        dom.window.localStorage.getItem(dom.window.localStorage.key(i)!),
      ),
    ).includes("SYNTHETIC_ACCESS"),
    false,
  );
});

test("account connection is explicit and fails closed without touching official embeds or storage", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: "http://127.0.0.1:4173",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return Response.json({
      spotify: {
        ready: false,
        authorized: false,
        blocker: "Missing SPOTIFY_CLIENT_ID and MUSIC_ORIGIN",
      },
      apple: { ready: false, blocker: "MusicKit registration missing" },
    });
  };
  const rtl = await import("@testing-library/react");
  t.after(() => {
    rtl.cleanup();
    globalThis.fetch = original;
    dom.window.close();
  });
  const view = rtl.render(<Music />);
  const q = rtl.within(view.container);
  assert.equal(requests, 0);
  rtl.fireEvent.click(
    q.getByRole("button", { name: "Refresh connection", hidden: true }),
  );
  await rtl.waitFor(() =>
    assert.match(view.container.textContent!, /Missing SPOTIFY_CLIENT_ID/),
  );
  assert.equal(
    (
      q.getByRole("button", {
        name: "Connect Spotify",
        hidden: true,
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  assert.equal(document.querySelector('script[src*="sdk.scdn.co"]'), null);
  rtl.fireEvent.change(q.getByLabelText("Spotify link"), {target:{value:"https://open.spotify.com/track/0123456789ABCDEFGHIJKL"}});
  rtl.fireEvent.click(q.getByRole("button",{name:"Select music link",hidden:true}));
  rtl.fireEvent.click(
    q.getByRole("button", {
      name: "Load selected Spotify player",
      hidden: true,
    }),
  );
  assert.match(
    view.container.querySelector("iframe")!.src,
    /^https:\/\/open.spotify.com\/embed\//,
  );
  rtl.fireEvent.click(q.getByLabelText("Silent mode"));
  assert.equal(view.container.querySelector("iframe"), null);
  assert.equal(
    view.container.textContent!.includes("Refresh connection"),
    false,
  );
  assert.equal(
    dom.window.localStorage
      .getItem("studyroom.musicPrefs.v1")!
      .includes("token"),
    false,
  );
});

test("blocked Spotify popup offers a deliberate link without replacing the active page", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: "http://127.0.0.1:4173",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.assign(dom.window, { open: () => null });
  const original = globalThis.fetch;
  globalThis.fetch = async (url) =>
    String(url).endsWith("/status")
      ? Response.json({
          spotify: { ready: true, authorized: false, blocker: null },
          apple: { ready: false, blocker: "disabled" },
        })
      : Response.json({
          url: "https://accounts.spotify.com/authorize?state=synthetic",
        });
  const rtl = await import("@testing-library/react");
  t.after(() => {
    rtl.cleanup();
    globalThis.fetch = original;
    dom.window.close();
  });
  const view = rtl.render(<Music />),
    q = rtl.within(view.container);
  rtl.fireEvent.click(
    q.getByRole("button", { name: "Refresh connection", hidden: true }),
  );
  await rtl.waitFor(() =>
    assert.equal(
      (
        q.getByRole("button", {
          name: "Connect Spotify",
          hidden: true,
        }) as HTMLButtonElement
      ).disabled,
      false,
    ),
  );
  rtl.fireEvent.click(
    q.getByRole("button", { name: "Connect Spotify", hidden: true }),
  );
  const link = await q.findByRole("link", {
    name: "Continue in Spotify",
    hidden: true,
  });
  assert.equal(link.getAttribute("target"), "_blank");
  assert.equal(link.getAttribute("rel"), "noopener noreferrer");
  assert.equal(dom.window.location.href, "http://127.0.0.1:4173/");
  assert.match(view.container.textContent!, /Your timer and drafts stay here/);
  assert.equal(
    dom.window.localStorage.length,
    0,
    "OAuth URL and state are never persisted",
  );
});
