import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { App } from "../src/App.js";
import { loadSessions } from "../src/sessionRecords.js";
import { visitWorkspace } from "./workspace-navigation-helpers.js";

for (const prior of ["completed", "partial"] as const) {
  test(`New private session starts an independent completion cycle after a ${prior} cycle`, async (t) => {
    const dom = new JSDOM("<!doctype html><body></body>", {
      url: "http://localhost/?view=study",
    });
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    const rtl = await import("@testing-library/react");
    const originalNow = performance.now;
    let now = 0;
    performance.now = () => now;
    t.after(() => {
      rtl.cleanup();
      performance.now = originalNow;
      dom.window.close();
    });
    const view = rtl.render(<App />);
    const q = rtl.within(view.container);
    rtl.fireEvent.change(q.getByLabelText("Focus length", { exact: true }), {
      target: { value: "1" },
    });
    rtl.fireEvent.click(q.getByRole("button", { name: "Start focus" }));
    now = prior === "completed" ? 60001 : 10000;
    rtl.fireEvent.click(q.getByRole("button", { name: "Pause focus" }));
    const before = loadSessions(dom.window.localStorage).sessions;
    assert.equal(before.length, prior === "completed" ? 1 : 0);
    if (prior === "completed") {
      rtl.fireEvent.click(rtl.within(q.getByRole("dialog")).getByRole("button", { name: "Skip" }));
    }
    visitWorkspace(q, "progress");
    rtl.fireEvent.click(q.getByRole("button", { name: "Finish privately" }));
    rtl.fireEvent.click(q.getByRole("button", { name: "Save private reflection" }));
    rtl.fireEvent.click(q.getByRole("button", { name: "New private session" }));
    assert.equal(q.queryByRole("dialog"), null, "the prior completion is not reopened");
    visitWorkspace(q, "study");
    assert.equal(q.getByRole("timer").textContent, "01:00");
    rtl.fireEvent.click(q.getByRole("button", { name: "Start focus" }));
    now += 60001;
    rtl.fireEvent.click(q.getByRole("button", { name: "Pause focus" }));
    const after = loadSessions(dom.window.localStorage).sessions;
    assert.equal(after.length, before.length + 1, "fresh cycle has its own completed record");
    const added = after.filter((record) => !before.some((old) => old.id === record.id));
    assert.equal(added.length, 1);
    assert.equal(added[0].focusedMs, 60000, "no focused time carried from the prior cycle");
    assert.equal(added[0].plannedMs, 60000);
    assert.ok(q.getByRole("dialog"), "the new completion report is displayed");
    for (const original of before) {
      assert.deepEqual(
        after.find((record) => record.id === original.id),
        original,
      );
    }
  });
}
