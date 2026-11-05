import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { WelcomeScene } from "../src/WelcomeScene.js";
test("welcome has one Continue entry, no Skip or quiet copy, and Escape enters", async () => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { render, fireEvent, cleanup } = await import("@testing-library/react");
  let entered = 0;
  const view = render(<WelcomeScene leaving={false} onEnter={() => entered++} />);
  try {
    assert.ok(
      !view.queryByRole("button", { name: "Skip welcome" }),
      "obsolete Skip button must be absent",
    );
    assert.ok(view.getByRole("button", { name: "Continue to Study Room" }));
    assert.equal(view.queryByText(/Enter quietly/), null);
    fireEvent(
      view.container.querySelector("dialog")!,
      new dom.window.Event("cancel", { cancelable: true }),
    );
    assert.equal(entered, 1);
  } finally {
    cleanup();
    dom.window.close();
  }
});
