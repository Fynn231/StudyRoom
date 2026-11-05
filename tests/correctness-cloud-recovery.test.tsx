import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { HybridPlanner } from "../src/planning/HybridPlanner.js";
import { StorageAccountProvider } from "../src/privateStorage.js";

test("uncertain cloud save journals only owner-scoped identity and reconciles after an actual remount without a draft", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "https://study.example" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const rtl = await import("@testing-library/react");
  const originalFetch = globalThis.fetch;
  let attempted: any,
    posts = 0;
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "POST") {
      posts++;
      attempted = JSON.parse(String(init.body));
      return Response.json(
        {
          error: "Synthetic response lost.",
          category: "save_uncertain",
          attemptedId: attempted.id,
        },
        { status: 503 },
      );
    }
    return Response.json({ plans: [attempted] });
  };
  t.after(() => {
    rtl.cleanup();
    globalThis.fetch = originalFetch;
    dom.window.close();
  });
  const mount = (owner: string) => (
    <StorageAccountProvider account={owner}>
      <HybridPlanner key={owner} />
    </StorageAccountProvider>
  );
  const view = rtl.render(mount("a"));
  view.container.querySelector("details")!.open = true;
  rtl.fireEvent.change(view.getByLabelText("Task 1 title"), {
    target: { value: "PRIVATE JOURNAL MARKER" },
  });
  rtl.fireEvent.click(view.getByRole("button", { name: "Build baseline schedule" }));
  rtl.fireEvent.click(view.getByRole("button", { name: "Save as new copy to account" }));
  await rtl.waitFor(() => assert.equal(posts, 1));
  const key = "studyroom.account.a.studyroom.planning.pending-save.v1";
  const raw = dom.window.localStorage.getItem(key);
  assert.ok(raw, "pending attempt identity must survive remount before transport can be retried");
  const journal = JSON.parse(raw);
  assert.equal(journal.id, attempted.id);
  assert.match(journal.fingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(journal).sort(), ["fingerprint", "id", "version"]);
  assert.ok(!raw.includes("PRIVATE JOURNAL MARKER"), "no raw plan or draft is persisted");
  view.rerender(mount("b"));
  assert.equal(view.queryByRole("button", { name: "Check previous save" }), null);
  view.rerender(mount("a"));
  assert.equal(view.queryByRole("heading", { name: "Review your schedule" }), null);
  rtl.fireEvent.click(view.getByRole("button", { name: "Check previous save" }));
  await rtl.waitFor(() => assert.equal(dom.window.localStorage.getItem(key), null));
  assert.equal(posts, 1);
  assert.match(view.container.textContent ?? "", /confirmed saved/);
});

test("empty lookup retries the immutable original payload, not later edits, and delayed commit reconciles without duplication", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "https://study.example" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const rtl = await import("@testing-library/react"),
    originalFetch = globalThis.fetch;
  const posts: any[] = [];
  let row: any = null;
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "POST") {
      posts.push(JSON.parse(String(init.body)));
      if (posts.length === 2) row = posts[0]; // Original commits after the empty lookup.
      return Response.json(
        { error: "Synthetic uncertain transport/duplicate race.", category: "save_uncertain" },
        { status: 503 },
      );
    }
    return Response.json({ plans: row ? [row] : [] });
  };
  t.after(() => {
    rtl.cleanup();
    globalThis.fetch = originalFetch;
    dom.window.close();
  });
  const view = rtl.render(<HybridPlanner />);
  view.container.querySelector("details")!.open = true;
  rtl.fireEvent.change(view.getByLabelText("Task 1 title"), {
    target: { value: "Original version" },
  });
  rtl.fireEvent.click(view.getByRole("button", { name: "Build baseline schedule" }));
  rtl.fireEvent.click(view.getByRole("button", { name: "Save as new copy to account" }));
  await rtl.waitFor(() => assert.equal(posts.length, 1));
  await rtl.waitFor(() => assert.ok(view.getByRole("alert")));
  rtl.fireEvent.change(view.getByLabelText("Block 1 title"), {
    target: { value: "Newer unsaved edits" },
  });
  rtl.fireEvent.click(view.getByRole("button", { name: "Check previous save" }));
  await rtl.waitFor(() => assert.match(view.container.textContent ?? "", /not found yet/));
  assert.ok(
    view.queryByRole("button", { name: "Retry original save" }),
    "empty lookup must allow an explicit original-payload retry while retaining current edits",
  );
  rtl.fireEvent.click(view.getByRole("button", { name: "Retry original save" }));
  await rtl.waitFor(() => assert.equal(posts.length, 2));
  assert.deepEqual(posts[1], posts[0]);
  assert.equal(
    (view.getByLabelText("Block 1 title") as HTMLInputElement).value,
    "Newer unsaved edits",
  );
  await rtl.waitFor(() => assert.ok(view.getByRole("alert")));
  rtl.fireEvent.click(view.getByRole("button", { name: "Check previous save" }));
  await rtl.waitFor(() => assert.match(view.container.textContent ?? "", /confirmed saved/));
  assert.equal(posts.length, 2);
  assert.equal(dom.window.localStorage.getItem("studyroom.planning.pending-save.v1"), null);
});

test("conflicting previous copy has informed non-destructive release without changing the current draft or posting automatically", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "https://study.example" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const rtl = await import("@testing-library/react"),
    originalFetch = globalThis.fetch;
  const posts: any[] = [];
  let row: any;
  let approved = false;
  let warning = "";
  dom.window.confirm = (text) => {
    warning = text ?? "";
    return approved;
  };
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "POST") {
      const payload = JSON.parse(String(init.body));
      posts.push(payload);
      if (posts.length === 1) {
        row = { ...payload, title: "Conflicting stored version" };
        return Response.json({ error: "Synthetic uncertain save." }, { status: 503 });
      }
      return Response.json({ saved: true, id: payload.id });
    }
    assert.notEqual(init?.method, "DELETE");
    return Response.json({ plans: [row] });
  };
  t.after(() => {
    rtl.cleanup();
    globalThis.fetch = originalFetch;
    dom.window.close();
  });
  const view = rtl.render(<HybridPlanner />);
  view.container.querySelector("details")!.open = true;
  rtl.fireEvent.change(view.getByLabelText("Task 1 title"), { target: { value: "Keep my draft" } });
  rtl.fireEvent.click(view.getByRole("button", { name: "Build baseline schedule" }));
  rtl.fireEvent.click(view.getByRole("button", { name: "Save as new copy to account" }));
  await rtl.waitFor(() => assert.ok(view.getByRole("alert")));
  rtl.fireEvent.click(view.getByRole("button", { name: "Check previous save" }));
  await rtl.waitFor(() =>
    assert.match(view.getByRole("alert").textContent ?? "", /different cloud copy/),
  );
  assert.ok(
    view.queryByRole("button", { name: "Stop tracking this attempt…" }),
    "conflict recovery must not require deleting a cloud row or losing drafts",
  );
  const release = view.getByRole("button", { name: "Stop tracking this attempt…" });
  rtl.fireEvent.click(release);
  assert.ok(dom.window.localStorage.getItem("studyroom.planning.pending-save.v1"));
  assert.match(warning, /duplicate/);
  approved = true;
  rtl.fireEvent.click(release);
  assert.equal(dom.window.localStorage.getItem("studyroom.planning.pending-save.v1"), null);
  assert.equal(posts.length, 1);
  assert.equal(row.title, "Conflicting stored version");
  assert.equal((view.getByLabelText("Task 1 title") as HTMLInputElement).value, "Keep my draft");
  rtl.fireEvent.click(view.getByRole("button", { name: "Save as new copy to account" }));
  await rtl.waitFor(() => assert.equal(posts.length, 2));
  assert.notEqual(posts[1].id, posts[0].id);
});

test("remounted empty recovery never reconstructs a missing payload from a newer draft", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "https://study.example" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const rtl = await import("@testing-library/react"),
    originalFetch = globalThis.fetch;
  let posts = 0;
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "POST") {
      posts++;
      return Response.json({ error: "Uncertain" }, { status: 503 });
    }
    return Response.json({ plans: [] });
  };
  t.after(() => {
    rtl.cleanup();
    globalThis.fetch = originalFetch;
    dom.window.close();
  });
  let view = rtl.render(<HybridPlanner />);
  view.container.querySelector("details")!.open = true;
  rtl.fireEvent.change(view.getByLabelText("Task 1 title"), { target: { value: "Original" } });
  rtl.fireEvent.click(view.getByRole("button", { name: "Build baseline schedule" }));
  rtl.fireEvent.click(view.getByRole("button", { name: "Save as new copy to account" }));
  await rtl.waitFor(() => assert.ok(view.getByRole("alert")));
  const raw = dom.window.localStorage.getItem("studyroom.planning.pending-save.v1");
  view.unmount();
  view = rtl.render(<HybridPlanner />);
  view.container.querySelector("details")!.open = true;
  rtl.fireEvent.click(view.getByRole("button", { name: "Check previous save" }));
  await rtl.waitFor(() => assert.match(view.container.textContent ?? "", /not found yet/));
  assert.equal(view.queryByRole("button", { name: "Retry original save" }), null);
  rtl.fireEvent.change(view.getByLabelText("Task 1 title"), {
    target: { value: "Different unsaved draft" },
  });
  rtl.fireEvent.click(view.getByRole("button", { name: "Build baseline schedule" }));
  const save = view.getByRole("button", {
    name: "Save as new copy to account",
  }) as HTMLButtonElement;
  assert.equal(
    save.disabled,
    true,
    "unresolved identity must block misleading new-copy actions after remount",
  );
  rtl.fireEvent.click(save);
  assert.equal(posts, 1);
  assert.equal(dom.window.localStorage.getItem("studyroom.planning.pending-save.v1"), raw);
});

for (const mode of ["write", "readback", "corrupt", "cleanup"] as const)
  test(`save recovery ${mode} failure preserves drafts and never silently loses pending identity`, async (t) => {
    const dom = new JSDOM("<!doctype html><body></body>", { url: "https://study.example" });
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      localStorage: dom.window.localStorage,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    const rtl = await import("@testing-library/react"),
      originalFetch = globalThis.fetch;
    let posts = 0;
    const key = "studyroom.planning.pending-save.v1";
    const originalSet = dom.window.Storage.prototype.setItem,
      originalRemove = dom.window.Storage.prototype.removeItem;
    if (mode === "corrupt") dom.window.localStorage.setItem(key, "invalid existing recovery");
    if (mode === "write" || mode === "readback")
      dom.window.Storage.prototype.setItem = function (k, v) {
        if (k === key) {
          if (mode === "write") throw Error("Storage unavailable");
          return;
        }
        originalSet.call(this, k, v);
      };
    if (mode === "cleanup")
      dom.window.Storage.prototype.removeItem = function (k) {
        if (k === key) throw Error("Cannot clear journal");
        originalRemove.call(this, k);
      };
    globalThis.fetch = async (_url, init) => {
      posts++;
      const body = JSON.parse(String(init?.body));
      return Response.json({ saved: true, id: body.id });
    };
    t.after(() => {
      rtl.cleanup();
      globalThis.fetch = originalFetch;
      dom.window.Storage.prototype.setItem = originalSet;
      dom.window.Storage.prototype.removeItem = originalRemove;
      dom.window.close();
    });
    const view = rtl.render(<HybridPlanner />);
    view.container.querySelector("details")!.open = true;
    rtl.fireEvent.change(view.getByLabelText("Task 1 title"), {
      target: { value: "Preserve private work" },
    });
    rtl.fireEvent.click(view.getByRole("button", { name: "Build baseline schedule" }));
    rtl.fireEvent.click(view.getByRole("button", { name: "Save as new copy to account" }));
    await rtl.waitFor(() => assert.ok(view.queryAllByRole("alert").length));
    assert.equal(posts, mode === "cleanup" ? 1 : 0);
    assert.equal(
      (view.getByLabelText("Task 1 title") as HTMLInputElement).value,
      "Preserve private work",
    );
    if (mode === "cleanup" || mode === "corrupt") assert.ok(dom.window.localStorage.getItem(key));
  });
