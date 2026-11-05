import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { useRoomAmbience } from "../src/useRoomAmbience.js";
import { Ambience } from "../src/Ambience.js";
test("failed audio stays unavailable across automatic preparation until explicit Play retries", async () => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
  let attempts = 0;
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    AudioContext: class {
      constructor() {
        attempts++;
        throw Error("Synthetic unavailable audio");
      }
    },
  });
  function PrepareHost() {
    const room = useRoomAmbience(false);
    return (
      <>
        <button onClick={room.prepare}>Continue preparation</button>
        <Ambience room={room} onWelcome={() => {}} />
      </>
    );
  }
  const { render, fireEvent, cleanup } = await import("@testing-library/react");
  try {
    const q = render(<PrepareHost />);
    assert.equal(attempts, 1);
    for (let i = 0; i < 3; i++)
      fireEvent.click(q.getByRole("button", { name: "Continue preparation" }));
    assert.equal(
      attempts,
      1,
      "ordinary interaction must not retry failed audio and churn the layout",
    );
    fireEvent.click(q.getByRole("button", { name: "Play room audio" }));
    assert.equal(attempts, 2, "explicit Play remains a recovery action");
  } finally {
    cleanup();
    dom.window.close();
  }
});

function Host() {
  const room = useRoomAmbience(false);
  return <Ambience room={room} onWelcome={() => {}} />;
}
test("room audio attempts default autoplay on mount without a manual Play", async () => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
  let attempts = 0;
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    AudioContext: class {
      constructor() {
        attempts++;
        throw Error("Synthetic unsupported audio");
      }
    },
  });
  const { render, waitFor, cleanup } = await import("@testing-library/react");
  try {
    const view = render(<Host />);
    assert.ok(
      view.queryByRole("heading", { name: "Wind over the Reading Terrace" }),
      "display the new orchestral composition, not the rejected candidate",
    );
    await waitFor(() => assert.equal(attempts, 1, "default original music must attempt playback"));
  } finally {
    cleanup();
    dom.window.close();
  }
});

test("saved v1 mute migrates, v2 stop persists, and account remount never inherits preferences", async () => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
  let attempts = 0;
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    AudioContext: class {
      constructor() {
        attempts++;
        throw Error("Synthetic unsupported");
      }
    },
  });
  const { StorageAccountProvider } = await import("../src/privateStorage.js");
  const { readRoomAudioPreference } = await import("../src/useRoomAmbience.js");
  const { render, fireEvent, cleanup, waitFor } = await import("@testing-library/react");
  const key = "studyroom.account.a.studyroom.ambience.v1";
  dom.window.localStorage.setItem(key, JSON.stringify({ volume: 0.17, muted: true }));
  const mount = (id: string) => (
    <StorageAccountProvider account={id}>
      <Host key={id} />
    </StorageAccountProvider>
  );
  try {
    const q = render(mount("a"));
    assert.equal(attempts, 0);
    assert.equal((q.getByLabelText("Music volume") as HTMLInputElement).value, "0.17");
    fireEvent.click(q.getByRole("button", { name: "Stop room audio" }));
    const saved = JSON.parse(
      dom.window.localStorage.getItem("studyroom.account.a.studyroom.ambience.v2")!,
    );
    assert.equal(saved.stopped, true);
    assert.equal(saved.muted, true);
    q.rerender(mount("b"));
    await waitFor(() => assert.equal(attempts, 1));
    assert.equal((q.getByLabelText("Music volume") as HTMLInputElement).value, "0.3");
    q.rerender(mount("a"));
    assert.equal(attempts, 1);
    assert.ok(q.getByRole("button", { name: "Unmute room audio" }));
    assert.equal(readRoomAudioPreference({ getItem: () => "not json" }).volume, 0.3);
  } finally {
    cleanup();
    dom.window.close();
  }
});

test("enabling rain at zero music volume prepares audio without overriding saved stop", async () => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
  let attempts = 0;
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    AudioContext: class {
      constructor() {
        attempts++;
        throw Error("Synthetic unsupported");
      }
    },
  });
  dom.window.localStorage.setItem(
    "studyroom.ambience.v2",
    JSON.stringify({ volume: 0, muted: false, stopped: false, rain: false, rainVolume: 0.2 }),
  );
  const { render, fireEvent, cleanup, waitFor } = await import("@testing-library/react");
  try {
    const q = render(<Host />);
    assert.equal(attempts, 0);
    fireEvent.click(q.getByLabelText("Optional rain"));
    await waitFor(() => assert.equal(attempts, 1));
    fireEvent.click(q.getByRole("button", { name: "Stop room audio" }));
    fireEvent.click(q.getByLabelText("Optional rain"));
    fireEvent.click(q.getByLabelText("Optional rain"));
    assert.equal(attempts, 1);
  } finally {
    cleanup();
    dom.window.close();
  }
});
