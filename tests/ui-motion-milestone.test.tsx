import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { WelcomeScene } from "../src/WelcomeScene.js";
import { NormalGradient } from "../src/NormalGradient.js";

test("welcome distributes its static composition and pauses hidden with its own lifecycle producer", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
  Object.defineProperty(dom.window.document, "hidden", { configurable: true, value: false });
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
  const petals = [...view.container.querySelectorAll<HTMLElement>(".welcome-petals i")];
  assert.equal(petals.length, 18);
  assert.equal(new Set(petals.map((e) => e.style.transform)).size, 18);
  assert.equal(new Set(petals.map((e) => e.style.getPropertyValue("--leaf-size"))).size, 18);
  const dialog = view.container.querySelector("dialog")!;
  assert.equal(dialog.dataset.hidden, "false");
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new dom.window.Event("visibilitychange"));
  });
  assert.equal(dialog.dataset.hidden, "true");
  view.unmount();
});

test("gradient owns one frame producer and resumes without hidden-time catch-up", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
  Object.defineProperty(dom.window.document, "hidden", { configurable: true, value: false });
  let reduced = false,
    id = 0;
  const listeners = new Set<() => void>(),
    frames = new Map<number, FrameRequestCallback>();
  Object.assign(dom.window, {
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      frames.set(++id, cb);
      return id;
    },
    cancelAnimationFrame: (n: number) => frames.delete(n),
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
  const view = render(<NormalGradient colors={["#ffffff", "#80a879"]} suspended={false} />);
  const field = view.container.querySelector("i")!;
  const tick = (now: number) =>
    act(() => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((cb) => cb(now));
    });
  assert.equal(frames.size, 1);
  tick(10);
  tick(30);
  const pose = field.style.transform;
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new dom.window.Event("visibilitychange"));
  });
  assert.equal(frames.size, 0);
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new dom.window.Event("visibilitychange"));
  });
  tick(60000);
  assert.equal(field.style.transform, pose);
  assert.equal(frames.size, 1);
  act(() => {
    reduced = true;
    listeners.forEach((cb) => cb());
  });
  assert.equal(frames.size, 0);
  view.rerender(<NormalGradient colors={["#ffffff", "#80a879"]} suspended />);
  assert.equal(frames.size, 0);
  act(() => {
    reduced = false;
    listeners.forEach((cb) => cb());
  });
  assert.equal(frames.size, 0);
  view.rerender(<NormalGradient colors={["#ffffff", "#80a879"]} suspended={false} />);
  assert.equal(frames.size, 1);
  view.unmount();
  assert.equal(frames.size, 0);
  assert.equal(listeners.size, 0);
});
