import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { Flowers } from "../src/Flowers.js";

test("Juliette integrates curved wind/gravity motion, freezes off/reduced/hidden/locked and resumes without a jump", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  Object.defineProperty(dom.window.document, "hidden", { configurable: true, value: false });
  let reduced = false,
    n = 0;
  const mediaListeners = new Set<() => void>();
  const queue = new Map<number, FrameRequestCallback>();
  Object.assign(dom.window, {
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      queue.set(++n, cb);
      return n;
    },
    cancelAnimationFrame: (id: number) => queue.delete(id),
    matchMedia: () => ({
      get matches() {
        return reduced;
      },
      addEventListener: (_: string, cb: () => void) => mediaListeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => mediaListeners.delete(cb),
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
  const view = render(<Flowers effect="falling" />);
  const flower = view.container.querySelector<SVGElement>("svg")!;
  const tick = (now: number) =>
    act(() => {
      const callbacks = [...queue.values()];
      queue.clear();
      callbacks.forEach((cb) => cb(now));
    });
  const all = [...view.container.querySelectorAll<SVGElement>(":scope .flower")];
  assert.equal(all.length, 48);
  assert.equal(
    all.filter((el) => el.style.transform).length,
    48,
    "every decoration gets a managed pose",
  );
  const starts = all.map((el) => el.style.transform);
  const start = flower.style.transform;
  tick(100);
  tick(116.67);
  tick(133.34);
  assert.equal(
    all.filter((el, i) => el.style.transform !== starts[i]).length,
    48,
    "every decoration moves, including the second half",
  );

  assert.notEqual(
    flower.style.transform,
    start,
    "the real rendered flower moves on animation frames, not a CSS path",
  );
  assert.ok(
    flower.querySelectorAll("path").length >= 5,
    "cupped shaded petal faces, not flat ellipse stamps",
  );
  const pose = flower.style.transform;
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new dom.window.Event("visibilitychange"));
  });
  assert.equal(queue.size, 0, "hidden cancels producer");
  tick(5000);
  assert.equal(flower.style.transform, pose);
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new dom.window.Event("visibilitychange"));
  });
  tick(9000);
  assert.equal(
    flower.style.transform,
    pose,
    "resume resets timestamp, never integrates hidden time",
  );
  tick(9017);
  assert.notEqual(flower.style.transform, pose);
  act(() => {
    reduced = true;
    mediaListeners.forEach((cb) => cb());
  });
  assert.equal(queue.size, 0);
  const still = flower.style.transform;
  tick(10000);
  assert.equal(flower.style.transform, still);
  act(() => {
    reduced = false;
    mediaListeners.forEach((cb) => cb());
  });
  assert.equal(queue.size, 1);
  const retained = all.map((el) => el.style.transform);
  view.rerender(<Flowers effect="static" />);
  assert.equal(queue.size, 0);
  assert.deepEqual(
    all.map((el) => el.style.transform),
    retained,
    "Off retains positions, not a new composition",
  );
  const off = flower.style.transform;
  tick(12000);
  assert.equal(flower.style.transform, off);
  view.rerender(<Flowers effect="falling" suspended />);
  assert.equal(queue.size, 0);
  view.rerender(<Flowers effect="falling" suspended={false} />);
  assert.equal(queue.size, 1);
  view.unmount();
  assert.equal(queue.size, 0);
  assert.equal(mediaListeners.size, 0);
});
