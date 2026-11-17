import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { useToolNavigation } from "../src/useToolNavigation.js";
import { useWorkspaceNavigation } from "../src/WorkspaceNavigation.js";

for (const destination of ["workspace", "history"] as const) {
  test(`a second hook owner cancels pending guide activation before ${destination} navigation`, async (t) => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://localhost/?view=study",
      pretendToBeVisual: true,
    });
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    const { render, fireEvent, within, cleanup, act } = await import("@testing-library/react");
    let nextFrame = 0,
      time = 0,
      activations = 0;
    const frames = new Map<number, FrameRequestCallback>();
    const scrolls: string[] = [];
    window.requestAnimationFrame = (callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    };
    window.cancelAnimationFrame = (id) => {
      frames.delete(id);
    };
    window.scrollTo = () => {
      scrolls.push("stop");
    };
    window.HTMLElement.prototype.scrollIntoView = function () {
      scrolls.push(this.id);
    };
    function frame() {
      time += 50;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(time));
    }
    function Guide() {
      const open = useToolNavigation();
      return <button onClick={() => open("#profile")}>Your profile</button>;
    }
    function Harness() {
      const { view, navigate } = useWorkspaceNavigation();
      return (
        <>
          <Guide />
          <button id="profile" data-guide-activate="true" onClick={() => activations++}>
            Profile
          </button>
          <button onClick={() => navigate("music")}>Music</button>
          <h1 id={view} data-page-heading={view}>
            {view}
          </h1>
        </>
      );
    }
    t.after(() => {
      cleanup();
      dom.window.close();
    });
    const q = within(render(<Harness />).container);
    if (destination === "history") window.history.pushState(null, "", "?view=guide");
    fireEvent.click(q.getByRole("button", { name: "Your profile" }));
    act(frame);
    assert.deepEqual(scrolls, ["profile"]);
    if (destination === "workspace") fireEvent.click(q.getByRole("button", { name: "Music" }));
    else
      await act(async () => {
        await new Promise<void>((resolve) => {
          window.addEventListener("popstate", () => resolve(), { once: true });
          window.history.back();
        });
      });
    for (let i = 0; i < 12; i++) act(frame);
    assert.equal(
      activations,
      0,
      "obsolete guide must never focus/click the connected profile target",
    );
    const target = destination === "workspace" ? "music" : "study";
    assert.equal(document.activeElement, document.getElementById(target));
    assert.deepEqual(
      scrolls,
      ["profile", "stop", target, "stop"],
      "old scroll cancellation precedes the new scroll, never interrupts it",
    );
    assert.equal(frames.size, 0);
  });
}

test("a removed destination completes navigation cleanup without later input", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { render, fireEvent, within, cleanup, act } = await import("@testing-library/react");
  let nextFrame = 0,
    time = 0,
    stops = 0,
    activations = 0;
  const frames = new Map<number, FrameRequestCallback>();
  window.requestAnimationFrame = (callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  };
  window.cancelAnimationFrame = (id) => {
    frames.delete(id);
  };
  window.scrollTo = () => {
    stops++;
  };
  window.HTMLElement.prototype.scrollIntoView = () => {};
  function Harness({ show }: { show: boolean }) {
    const open = useToolNavigation();
    return (
      <>
        <button onClick={() => open("#removed-target")}>Navigate</button>
        {show && (
          <button id="removed-target" data-guide-activate="true" onClick={() => activations++}>
            Target
          </button>
        )}
      </>
    );
  }
  const view = render(<Harness show />);
  const events = new Set(["pointerdown", "wheel", "touchstart", "keydown", "visibilitychange"]);
  const installed = new Set<string>();
  const add = document.addEventListener.bind(document);
  const remove = document.removeEventListener.bind(document);
  document.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => {
    if (events.has(type) && options === true) installed.add(type);
    add(type, listener, options);
  }) as typeof document.addEventListener;
  document.removeEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ) => {
    if (events.has(type) && options === true) installed.delete(type);
    remove(type, listener, options);
  }) as typeof document.removeEventListener;
  t.after(() => {
    cleanup();
    document.addEventListener = add;
    document.removeEventListener = remove;
    dom.window.close();
  });
  function frame() {
    time += 50;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(time));
  }
  fireEvent.click(within(view.container).getByRole("button", { name: "Navigate" }));
  act(frame);
  assert.equal(installed.size, 5, "exercise an active smooth-scroll operation");
  view.rerender(<Harness show={false} />);
  for (let i = 0; i < 12; i++) act(frame);
  assert.equal(frames.size, 0);
  assert.equal(activations, 0, "a detached destination is never activated");
  assert.equal(installed.size, 0, "terminal cleanup must not await later input or unmount");
  assert.equal(stops, 1, "the obsolete native scroll receives terminal cancellation");
});
