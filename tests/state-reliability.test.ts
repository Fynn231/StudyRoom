import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { JSDOM } from "jsdom";
import { SessionComplete } from "../src/SessionComplete.js";
import {
  SESSIONS_KEY,
  saveSession,
  rateSession,
  type SessionRecord,
} from "../src/sessionRecords.js";

const record: SessionRecord = {
  id: "synthetic-session",
  completedAt: "2026-11-03T10:00:00.000Z",
  focusedMs: 60000,
  plannedMs: 60000,
  stepsDone: 1,
  stepsTotal: 1,
  rating: null,
  focusRating: null,
};

test("feedback UI retains its draft and reports failure when storage silently ignores a write", async (t) => {
  const dom = new JSDOM("<html><body></body></html>", { url: "https://study.example" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const rtl = await import("@testing-library/react");
  const raw = JSON.stringify([record]);
  dom.window.localStorage.setItem(SESSIONS_KEY, raw);
  let ignoreWrites = true;
  const prototype = dom.window.Storage.prototype;
  const original = prototype.setItem;
  prototype.setItem = function (key: string, value: string) {
    if (!ignoreWrites) original.call(this, key, value);
  };
  t.after(() => {
    rtl.cleanup();
    prototype.setItem = original;
    dom.window.close();
  });
  const view = rtl.render(
    createElement(SessionComplete, {
      open: true,
      record,
      locked: false,
      firstVisit: false,
      onClose() {},
    }),
  );
  const q = rtl.within(view.container);
  const rating = q.getAllByRole("radio", { name: "5 out of 5" })[0] as HTMLInputElement;
  rtl.fireEvent.click(rating);
  assert.equal(dom.window.localStorage.getItem(SESSIONS_KEY), raw, "draft is not durable");
  rtl.fireEvent.click(q.getByRole("button", { name: "Save feedback" }));
  assert.ok(q.getByRole("alert"), "unconfirmed rating must not claim saved");
  assert.equal(q.queryByRole("status"), null);
  assert.equal(rating.checked, true, "draft remains available to retry");
  assert.equal(dom.window.localStorage.getItem(SESSIONS_KEY), raw);
  ignoreWrites = false;
  rtl.fireEvent.click(q.getByRole("button", { name: "Save feedback" }));
  assert.match(q.getByRole("status").textContent ?? "", /Saved on this device/);
  assert.equal(q.queryByRole("alert"), null);
  assert.equal(JSON.parse(dom.window.localStorage.getItem(SESSIONS_KEY)!)[0].rating, 5);
});

test("session and rating confirmation requires the complete intended records, not just the session ID", () => {
  const previous = JSON.stringify([{ ...record, id: "previous-session" }]);
  let raw = previous;
  const storage = {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      const rows = JSON.parse(value);
      rows[0].focusedMs = 0;
      raw = JSON.stringify(rows);
    },
  };
  assert.equal(saveSession(record, storage).ok, false);
  raw = JSON.stringify([record]);
  assert.equal(rateSession(record.id, 5, 4, storage).ok, false);
});
