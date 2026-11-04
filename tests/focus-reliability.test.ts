import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { FocusSetup } from "../src/FocusSetup.js";

// DOM interaction only: this does not detect device DND or an installed blocker.
test("Focus setup separates live view state, unverified blocking and actionable recovery", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "https://study.example/" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const rtl = await import("@testing-library/react");
  t.after(() => {
    rtl.cleanup();
    dom.window.close();
  });
  let entered = 0;
  const view = rtl.render(
    React.createElement<NonNullable<Parameters<typeof FocusSetup>[0]>>(FocusSetup, {
      onEnter: () => {
        entered++;
      },
    }),
  );
  const panel = view.container.querySelector("details")!;
  panel.open = true;
  const q = rtl.within(view.container);
  assert.ok(q.getByText("Focus view is off."));
  rtl.fireEvent.click(q.getByRole("button", { name: "Enter focus view" }));
  assert.equal(entered, 1);
  view.rerender(
    React.createElement<NonNullable<Parameters<typeof FocusSetup>[0]>>(FocusSetup, {
      onEnter: () => {
        entered++;
      },
      active: true,
    }),
  );
  assert.ok(q.getByText("Focus view is on. Your timer is unchanged."));
  const recovery = q.getByText("Check or stop website blocking");
  rtl.fireEvent.click(recovery);
  assert.match(view.container.textContent ?? "", /Check status in its popup/);
  assert.match(
    view.container.textContent ?? "",
    /If Stop is not confirmed, disable or remove the extension/,
  );
  assert.match(
    view.container.textContent ?? "",
    /Ending your study timer or leaving Focus view does not stop the blocker/,
  );
  assert.equal((q.getByRole("checkbox") as HTMLInputElement).checked, false);
  rtl.fireEvent.click(q.getByRole("checkbox"));
  assert.equal((q.getByRole("checkbox") as HTMLInputElement).checked, true);
  assert.match(view.container.textContent ?? "", /did not verify/);
});
