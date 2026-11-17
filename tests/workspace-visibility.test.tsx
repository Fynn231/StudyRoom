import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { assertVisibleControl, visibleFireEvent } from "./workspace-navigation-helpers.js";

function setup() {
  const dom = new JSDOM(
    '<!doctype html><body><div id="owner"><details><summary>Open</summary><details><summary>Custom</summary><button>Choose</button></details></details></div></body>',
    { url: "http://localhost" },
  );
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
  });
  return dom;
}

test("visibility guard rejects closed ancestors, hidden/inert owners and disconnected controls", (t) => {
  const dom = setup();
  t.after(() => dom.window.close());
  const owner = dom.window.document.querySelector<HTMLElement>("#owner")!;
  const [outer, inner] = [...owner.querySelectorAll("details")];
  const button = owner.querySelector("button")!;
  assert.throws(() => assertVisibleControl(button), /opening the enclosing disclosure/);
  outer.open = true;
  assert.throws(() => assertVisibleControl(button), /opening the enclosing disclosure/);
  inner.open = true;
  assert.doesNotThrow(() => assertVisibleControl(button));
  owner.hidden = true;
  assert.throws(() => assertVisibleControl(button), /hidden\/inert owner/);
  owner.hidden = false;
  owner.setAttribute("inert", "");
  assert.throws(() => assertVisibleControl(button), /hidden\/inert owner/);
  owner.removeAttribute("inert");
  button.remove();
  assert.throws(() => assertVisibleControl(button), /connected target/);
});

test("guarded events forward native disclosure clicks and window events without revealing hidden controls", async (t) => {
  const dom = setup();
  const rtl = await import("@testing-library/react");
  t.after(() => {
    rtl.cleanup();
    dom.window.close();
  });
  const events = visibleFireEvent(rtl.fireEvent);
  const [outer, inner] = [...dom.window.document.querySelectorAll("details")];
  const button = inner.querySelector("button")!;
  let clicks = 0,
    signals = 0;
  button.addEventListener("click", () => clicks++);
  dom.window.addEventListener("visibility-guard-test", () => signals++);
  assert.throws(() => events.click(button), /opening the enclosing disclosure/);
  assert.equal(outer.open, false);
  assert.equal(inner.open, false);
  assert.equal(clicks, 0);
  events.click(outer.querySelector(":scope > summary")!);
  assert.equal(outer.open, true);
  events.click(inner.querySelector(":scope > summary")!);
  assert.equal(inner.open, true);
  assert.equal(events.click(button), true);
  assert.equal(clicks, 1);
  assert.equal(events(window, new dom.window.Event("visibility-guard-test")), true);
  assert.equal(signals, 1);
});
