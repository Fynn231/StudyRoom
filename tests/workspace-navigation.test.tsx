import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { App } from "../src/App.js";

test("real page navigation isolates tools while preserving the running timer and private draft", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/?room=AB%43DEF",
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
  const view = render(<App />),
    q = within(view.container);
  const nav = q.getByRole("navigation", { name: "Workspace" });
  const timer = q.getByRole("timer");
  const intention = q.getByLabelText("Your session intention") as HTMLTextAreaElement;
  fireEvent.change(intention, { target: { value: "Private draft stays here" } });
  fireEvent.click(q.getByRole("button", { name: "Start focus" }));
  fireEvent.click(within(nav).getByRole("link", { name: "Plan" }));
  assert.equal(window.location.search, "?room=AB%43DEF&view=plan");
  assert.equal(q.queryByRole("timer"), null);
  assert.ok(q.getByRole("heading", { name: "Plan your next step." }));
  assert.equal(view.container.querySelector('[role="timer"]'), timer);
  assert.equal(intention.value, "Private draft stays here");
  fireEvent.click(within(nav).getByRole("link", { name: "Study" }));
  assert.equal(q.getByRole("timer"), timer);
  assert.ok(q.getByRole("button", { name: "Pause focus" }));
  assert.equal(q.queryByLabelText("Quick session intention"), null);
});

test("literal room fallback is identical on initial load and browser history", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/?room=ABC123",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { render, fireEvent, within, cleanup, act } = await import("@testing-library/react");
  const { useWorkspaceNavigation } = await import("../src/WorkspaceNavigation.js");
  function Harness() {
    const { view, navigate } = useWorkspaceNavigation();
    return (
      <>
        <output>{view}</output>
        <button onClick={() => navigate("music")}>Music</button>
      </>
    );
  }
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const q = within(render(<Harness />).container);
  assert.equal(q.getByRole("status").textContent, "together");
  fireEvent.click(q.getByRole("button", { name: "Music" }));
  await act(async () => {
    await new Promise<void>((resolve) => {
      window.addEventListener("popstate", () => resolve(), { once: true });
      window.history.back();
    });
  });
  assert.equal(window.location.search, "?room=ABC123");
  assert.equal(q.getByRole("status").textContent, "together");
});

test("decoded duplicate room keys never select Together and raw query bytes survive navigation", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/?room=ABC123&r%6fom=DEF456&raw=AB%43DEF&&note=a+b#keep",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { render, fireEvent, within, cleanup } = await import("@testing-library/react");
  const { useWorkspaceNavigation } = await import("../src/WorkspaceNavigation.js");
  function Harness() {
    const { view, navigate } = useWorkspaceNavigation();
    return (
      <>
        <output>{view}</output>
        <button onClick={() => navigate("music")}>Music</button>
      </>
    );
  }
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const q = within(render(<Harness />).container);
  assert.equal(q.getByRole("status").textContent, "study");
  fireEvent.click(q.getByRole("button", { name: "Music" }));
  assert.equal(
    window.location.search,
    "?room=ABC123&r%6fom=DEF456&raw=AB%43DEF&&note=a+b&view=music",
  );
  assert.equal(window.location.hash, "#keep");
});
