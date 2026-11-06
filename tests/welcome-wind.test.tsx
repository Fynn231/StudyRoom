import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { WelcomeScene } from "../src/WelcomeScene.js";

test("Home owns one integrated wind producer, freezes reduced/hidden and resumes retained momentum", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
  Object.defineProperty(dom.window.document, "hidden", { configurable: true, value: false });
  let id = 0,
    reduced = false;
  const queue = new Map<number, FrameRequestCallback>(),
    listeners = new Set<() => void>();
  Object.assign(dom.window, {
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      queue.set(++id, cb);
      return id;
    },
    cancelAnimationFrame: (n: number) => queue.delete(n),
    matchMedia: () => ({
      get matches() {
        return reduced;
      },
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    }),
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { render, act, cleanup } = await import("@testing-library/react");
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const view = render(<WelcomeScene leaving={false} onEnter={() => {}} />);
  const bodies = [...view.container.querySelectorAll<HTMLElement>(".welcome-petals > i")];
  assert.equal(queue.size, 1, "Home must have a lifecycle-owned wind producer, not CSS tracks");
  const tick = (n: number) =>
    act(() => {
      const callbacks = [...queue.values()];
      queue.clear();
      callbacks.forEach((cb) => cb(n));
    });
  tick(0);
  const initial = bodies.map((e) => e.style.transform);
  for (let f = 1; f <= 1200; f++) tick((f * 1000) / 60);
  assert.ok(bodies.every((e, i) => e.style.transform !== initial[i]));
  const pose = bodies.map((e) => e.style.transform);
  act(() => {
    reduced = true;
    listeners.forEach((cb) => cb());
  });
  assert.equal(queue.size, 0);
  tick(60000);
  assert.deepEqual(
    bodies.map((e) => e.style.transform),
    pose,
  );
  act(() => {
    reduced = false;
    listeners.forEach((cb) => cb());
  });
  tick(90000);
  assert.deepEqual(
    bodies.map((e) => e.style.transform),
    pose,
  );
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new dom.window.Event("visibilitychange"));
  });
  assert.equal(queue.size, 0);
  view.unmount();
  assert.equal(queue.size, 0);
  assert.equal(listeners.size, 0);
});
