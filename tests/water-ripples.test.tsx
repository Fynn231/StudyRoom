import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { App } from "../src/App.js";
import { WaterRipples } from "../src/WaterRipples.js";

test("ripple lifecycle bounds frames and retains the exact pose through every pause and resume", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  let hidden = false,
    reduced = false,
    next = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const listeners = new Set<() => void>();
  Object.defineProperty(dom.window.document, "hidden", { configurable: true, get: () => hidden });
  dom.window.requestAnimationFrame = (cb) => {
    frames.set(++next, cb);
    return next;
  };
  dom.window.cancelAnimationFrame = (id) => {
    frames.delete(id);
  };
  dom.window.matchMedia = (() => ({
    get matches() {
      return reduced;
    },
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  })) as unknown as typeof window.matchMedia;
  const { render, act, cleanup } = await import("@testing-library/react");
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const view = render(<WaterRipples />);
  const pose = () =>
    [...view.container.querySelectorAll<SVGSVGElement>("svg")].map((e) => [
      e.style.transform,
      e.style.opacity,
    ]);
  const step = (time: number) =>
    act(() => {
      const batch = [...frames.values()];
      frames.clear();
      batch.forEach((cb) => cb(time));
    });
  assert.equal(view.container.querySelectorAll("svg").length, 15);
  assert.equal(frames.size, 1);
  step(100);
  const initial = pose();
  step(132);
  assert.notDeepEqual(pose(), initial);
  const movingPose = pose();
  view.rerender(<WaterRipples moving={false} />);
  assert.equal(frames.size, 0);
  assert.deepEqual(pose(), movingPose);
  view.rerender(<WaterRipples />);
  step(90000);
  assert.deepEqual(pose(), movingPose);
  step(90032);
  assert.notDeepEqual(pose(), movingPose);
  for (const pause of ["hidden", "reduced", "suspended"] as const) {
    const before = pose();
    act(() => {
      if (pause === "hidden") {
        hidden = true;
        document.dispatchEvent(new dom.window.Event("visibilitychange"));
      } else if (pause === "reduced") {
        reduced = true;
        listeners.forEach((cb) => cb());
      }
    });
    if (pause === "suspended") view.rerender(<WaterRipples suspended />);
    assert.equal(frames.size, 0);
    assert.deepEqual(pose(), before);
    act(() => {
      hidden = false;
      reduced = false;
      document.dispatchEvent(new dom.window.Event("visibilitychange"));
      listeners.forEach((cb) => cb());
    });
    view.rerender(<WaterRipples />);
    assert.equal(frames.size, 1);
    step(200000);
    assert.deepEqual(pose(), before);
  }
  view.unmount();
  assert.equal(frames.size, 0);
  assert.equal(listeners.size, 0);
  document.dispatchEvent(new dom.window.Event("visibilitychange"));
  assert.equal(frames.size, 0);
});

test("Blue Hour mounts its own water layer without replacing the running timer or intention", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { render, fireEvent, within, cleanup } = await import("@testing-library/react");
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const view = render(<App />),
    q = within(view.container);
  const timer = q.getByRole("timer"),
    draft = q.getByLabelText("Your session intention") as HTMLTextAreaElement;
  fireEvent.change(draft, { target: { value: "A quiet chapter by the water" } });
  fireEvent.click(q.getByLabelText("Enable focus chime"));
  fireEvent.click(q.getByRole("button", { name: "Start focus" }));
  fireEvent.click(q.getByText("Appearance", { selector: "summary" }));
  fireEvent.click(q.getByRole("button", { name: "Blue Hour" }));
  assert.ok(
    view.container.querySelector(".water-ripples"),
    "Blue Hour should own a distinct water ripple layer",
  );
  assert.equal(view.container.querySelector(".natural-flowers"), null);
  assert.equal(q.getByRole("timer"), timer);
  assert.equal(q.getByLabelText("Your session intention"), draft);
  assert.equal(draft.value, "A quiet chapter by the water");
  assert.ok(q.getByRole("button", { name: "Pause focus" }));
  fireEvent.click(q.getByLabelText("Water ripples"));
  assert.ok(view.container.querySelector(".water-ripples"));
  fireEvent.click(q.getByRole("button", { name: /^Sage$/ }));
  assert.equal(view.container.querySelector(".water-ripples"), null);
});
