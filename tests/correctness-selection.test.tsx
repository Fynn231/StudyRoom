import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { App } from "../src/App.js";
import { StorageAccountProvider, privateStorage } from "../src/privateStorage.js";
import { snapshotPlan, writeSavedPlans, STUDY_PLANS_KEY } from "../src/savedStudyStore.js";
import { loadSessions } from "../src/sessionRecords.js";

test("real account A to B React remount cannot carry selected plan completion counts", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    localStorage: dom.window.localStorage,
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
  const aStorage = privateStorage("localStorage", "A"),
    bStorage = privateStorage("localStorage", "B");
  writeSavedPlans(aStorage, null, [
    snapshotPlan({
      title: "A private selected copy",
      kind: "deterministic",
      objectives: [],
      steps: [{ title: "Done A", instructions: "", minutes: 1, done: true }],
    }),
  ]);
  const mount = (owner: string) => (
    <StorageAccountProvider key={owner} account={owner}>
      <App />
    </StorageAccountProvider>
  );
  const view = rtl.render(mount("A"));
  let q = rtl.within(view.container);
  rtl.fireEvent.click(q.getByText("Saved study plans", { selector: "summary" }));
  rtl.fireEvent.click(q.getByRole("button", { name: "Resume plan" }));
  view.rerender(mount("B"));
  q = rtl.within(view.container);
  assert.equal(view.container.textContent?.includes("A private selected copy"), false);
  rtl.fireEvent.change(q.getByLabelText("Focus length"), { target: { value: "1" } });
  rtl.fireEvent.click(q.getByRole("button", { name: "Start focus" }));
  now = 60000;
  await rtl.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 280));
  });
  const record = loadSessions(bStorage).sessions[0];
  assert.ok(record);
  assert.equal(record.stepsTotal, 0, "B must not inherit A's selected metrics");
  assert.equal(record.stepsDone, 0);
  assert.equal(loadSessions(aStorage).sessions.length, 0);
});

for (const action of ["selected", "reload", "delete", "storage", "close", "remount"] as const) {
  test(`completion reads explicit selected copy, invalidated by ${action}`, async (t) => {
    const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      localStorage: dom.window.localStorage,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    const rtl = await import("@testing-library/react"),
      originalNow = performance.now;
    let now = 0;
    performance.now = () => now;
    t.after(() => {
      rtl.cleanup();
      performance.now = originalNow;
      dom.window.close();
    });
    const draft = (title: string, count: number) =>
      snapshotPlan({
        title,
        kind: "deterministic",
        objectives: [],
        steps: Array.from({ length: count }, (_, i) => ({
          title: `${title} ${i}`,
          instructions: "",
          minutes: 1,
          done: true,
        })),
      });
    writeSavedPlans(dom.window.localStorage, null, [
      draft("First unrelated", 1),
      draft("Explicit second", 3),
    ]);
    const view = rtl.render(<App key="first" />);
    let q = rtl.within(view.container);
    rtl.fireEvent.click(q.getByText("Saved study plans", { selector: "summary" }));
    rtl.fireEvent.click(q.getAllByRole("button", { name: "Resume plan" })[1]);
    if (action === "reload")
      rtl.fireEvent.click(q.getByRole("button", { name: "Reload saved library" }));
    if (action === "delete")
      rtl.fireEvent.click(q.getAllByRole("button", { name: "Delete saved plan" })[1]);
    if (action === "storage")
      rtl.fireEvent(window, new dom.window.StorageEvent("storage", { key: STUDY_PLANS_KEY }));
    if (action === "close")
      rtl.fireEvent.click(q.getByRole("button", { name: "Close resumed plan" }));
    if (action === "remount") {
      view.rerender(<App key="second" />);
      q = rtl.within(view.container);
    }
    rtl.fireEvent.change(q.getByLabelText("Focus length"), { target: { value: "1" } });
    rtl.fireEvent.click(q.getByRole("button", { name: "Start focus" }));
    now = 60000;
    await rtl.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 280));
    });
    const record = loadSessions(dom.window.localStorage).sessions[0];
    assert.ok(record);
    assert.equal(record.stepsTotal, action === "selected" ? 3 : 0);
    assert.equal(record.stepsDone, action === "selected" ? 3 : 0);
  });
}
