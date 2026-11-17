import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { App } from "../src/App.js";

test("optional walkthrough visits real setup controls and finishes ready, never started", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/?view=guide",
  });
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
  const q = within(render(<App />).container);
  fireEvent.click(q.getByRole("button", { name: "Start walkthrough" }));
  assert.ok(q.getByRole("complementary", { name: "Site walkthrough" }));
  const duration = q.getByLabelText("Focus length");
  fireEvent.change(duration, { target: { value: "37" } });
  assert.equal(q.getByRole("timer").textContent, "37:00");
  for (let i = 0; i < 5; i++) fireEvent.click(q.getByRole("button", { name: "Next step" }));
  fireEvent.click(q.getByRole("button", { name: "Finish walkthrough" }));
  assert.equal(q.queryByRole("complementary", { name: "Site walkthrough" }), null);
  assert.ok(q.getByRole("button", { name: "Start focus" }));
  assert.equal(q.getByRole("timer").textContent, "37:00");
});

for (const page of ["study", "plan"] as const) {
  for (const dismissal of ["Skip walkthrough", "Close walkthrough"]) {
    test(`keyboard ${dismissal} restores connected visible focus on ${page}`, async (t) => {
      const dom = new JSDOM("<!doctype html><html><body></body></html>", {
        url: "http://localhost/?view=guide",
      });
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
      const q = within(render(<App />).container);
      const start = q.getByRole("button", { name: "Start walkthrough" });
      start.focus();
      fireEvent.keyDown(start, { key: "Enter" });
      fireEvent.click(start, { detail: 0 });
      if (page === "plan") fireEvent.click(q.getByRole("button", { name: "Next step" }));
      const button = q.getByRole("button", { name: dismissal });
      button.focus();
      fireEvent.keyDown(button, { key: "Enter" });
      fireEvent.click(button, { detail: 0 });
      const heading = q.getByRole("heading", { level: 1 });
      assert.ok(
        document.activeElement === heading,
        `dismissal must focus the visible ${page} heading, got ${document.activeElement?.tagName}`,
      );
      assert.equal(heading.isConnected, true);
      assert.equal(heading.closest("[hidden],[inert]"), null);
      assert.equal(start.isConnected, false);
    });
  }
}
