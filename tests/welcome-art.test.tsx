import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { WelcomeScene } from "../src/WelcomeScene.js";

test("actual welcome restores the confirmed original translucent CSS flake without changing entry semantics", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { render, cleanup, fireEvent } = await import("@testing-library/react");
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  let entered = 0;
  const view = render(<WelcomeScene leaving={false} onEnter={() => entered++} />);
  const bodies = [...view.container.querySelectorAll(".welcome-petals > i > span.welcome-flake")];
  assert.equal(
    bodies.length,
    18,
    "the confirmed original single CSS flake, not a split SVG substitute",
  );
  assert.equal(
    view.container.querySelectorAll(".welcome-petals svg, .welcome-petals path").length,
    0,
  );
  assert.ok(view.getByText("Headphones recommended for the best experience"));
  assert.equal(view.queryByRole("button", { name: /skip|enter quietly/i }), null);
  fireEvent.click(view.getByRole("button", { name: "Continue to Study Room" }));
  assert.equal(entered, 1);
});
