import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { HybridPlanner } from "../src/planning/HybridPlanner.js";
import { schedule } from "../src/planning/scheduler.js";
import { validatePlanningInput } from "../src/planning/schema.js";

const input = validatePlanningInput({
  tasks: [
    {
      id: "task",
      title: "Library task",
      deadline: null,
      priority: 2,
      difficulty: 2,
      estimatedMinutes: 25,
      completedMinutes: 0,
    },
  ],
  objectives: [],
  windows: [{ start: "2026-11-04T10:00:00.000Z", end: "2026-11-04T11:00:00.000Z" }],
  preferences: { focusMinutes: 25, breakMinutes: 5 },
});
const copies = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"].map(
  (id, i) => ({ id, title: `Saved ${i + 1}`, input, plan: schedule(input) }),
);
test("loading is not selecting; new copies use independent IDs and uncertain saves reconcile instead of duplicating", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "https://study.example" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const rtl = await import("@testing-library/react"),
    nativeFetch = globalThis.fetch;
  let posts = 0;
  const attempts: any[] = [];
  const lookups: string[] = [];
  globalThis.fetch = async (url, init) => {
    const query = new URL(String(url), "https://study.example");
    if (init?.method === "POST") {
      posts++;
      const p = JSON.parse(String(init.body));
      attempts.push(p);
      return Response.json(
        {
          error: "Reload to reconcile uncertain save.",
          category: "save_uncertain",
          attemptedId: p.id,
        },
        { status: 503 },
      );
    }
    if (query.searchParams.has("id")) {
      lookups.push(query.searchParams.get("id")!);
      return Response.json({ plans: [attempts[0]] });
    }
    return Response.json({ plans: copies });
  };
  t.after(() => {
    rtl.cleanup();
    globalThis.fetch = nativeFetch;
    dom.window.close();
  });
  const view = rtl.render(<HybridPlanner />),
    q = rtl.within(view.container);
  view.container.querySelector("details")!.open = true;
  rtl.fireEvent.change(q.getByLabelText("Task 1 title"), {
    target: { value: "Reviewed unsaved work" },
  });
  rtl.fireEvent.click(q.getByRole("button", { name: "Build baseline schedule" }));
  rtl.fireEvent.click(q.getByRole("button", { name: "Load account schedules" }));
  await rtl.findByRole(view.container, "button", { name: "Review saved schedule: Saved 2" });
  const save = q.getByRole("button", { name: "Save as new copy to account" });
  rtl.fireEvent.click(save);
  await rtl.waitFor(() => assert.ok(q.getByRole("alert")));
  assert.ok(
    !copies.some((p) => p.id === attempts[0].id),
    "loading must never attach the first library ID to an unrelated draft",
  );
  rtl.fireEvent.change(q.getByLabelText("Block 1 title"), {
    target: { value: "Edits after uncertain save" },
  });
  rtl.fireEvent.click(q.getByRole("button", { name: "Check previous save" }));
  await rtl.waitFor(() => assert.ok(q.getByText(/saved to your signed-in account/)));
  assert.equal(posts, 1, "second action must reconcile the attempted ID, not create a duplicate");
  assert.deepEqual(lookups, [attempts[0].id]);
  assert.equal(
    (q.getByLabelText("Block 1 title") as HTMLInputElement).value,
    "Edits after uncertain save",
  );
});

test("invalid reviewed wording reports a safe validation error without losing edits or contacting account transport", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "https://study.example" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const rtl = await import("@testing-library/react"),
    nativeFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ saved: true });
  };
  t.after(() => {
    rtl.cleanup();
    globalThis.fetch = nativeFetch;
    dom.window.close();
  });
  const view = rtl.render(<HybridPlanner />),
    q = rtl.within(view.container);
  view.container.querySelector("details")!.open = true;
  rtl.fireEvent.change(q.getByLabelText("Task 1 title"), { target: { value: "Keep my task" } });
  rtl.fireEvent.click(q.getByRole("button", { name: "Build baseline schedule" }));
  rtl.fireEvent.change(q.getByLabelText("Block 1 title"), { target: { value: "" } });
  rtl.fireEvent.click(q.getByRole("button", { name: "Save as new copy to account" }));
  await rtl.waitFor(() => assert.ok(q.getByRole("alert")));
  assert.equal(calls, 0);
  assert.equal((q.getByLabelText("Block 1 title") as HTMLInputElement).value, "");
  assert.equal((q.getByLabelText("Task 1 title") as HTMLInputElement).value, "Keep my task");
});

test("explicit new-copy save and confirmed cloud deletion recover a full library without losing reviewed edits", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "https://study.example" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const rtl = await import("@testing-library/react"),
    nativeFetch = globalThis.fetch;
  const rows = Array.from({ length: 20 }, (_, i) => ({
    ...copies[0],
    id: `${String(i + 1).padStart(8, "0")}-1111-4111-8111-111111111111`,
    title: `Library ${i + 1}`,
  }));
  let approved = false,
    deletes = 0,
    failDelete = true,
    posts = 0;
  dom.window.confirm = () => approved;
  globalThis.fetch = async (url, init) => {
    const query = new URL(String(url), "https://study.example");
    if (init?.method === "DELETE") {
      deletes++;
      if (failDelete)
        return Response.json(
          { error: "Deletion not confirmed; reload before retrying." },
          { status: 503 },
        );
      const id = query.searchParams.get("id");
      const index = rows.findIndex((p) => p.id === id);
      rows.splice(index, 1);
      return Response.json({ deleted: true, id });
    }
    if (init?.method === "POST") {
      posts++;
      if (rows.length === 20)
        return Response.json(
          { error: "Library full. Delete a copy and retry.", category: "save_rejected" },
          { status: 503 },
        );
      const p = JSON.parse(String(init.body));
      rows.push(p);
      return Response.json({ saved: true, id: p.id });
    }
    return Response.json({
      plans: query.searchParams.has("id")
        ? rows.filter((p) => p.id === query.searchParams.get("id"))
        : rows,
    });
  };
  t.after(() => {
    rtl.cleanup();
    globalThis.fetch = nativeFetch;
    dom.window.close();
  });
  const view = rtl.render(<HybridPlanner />),
    q = rtl.within(view.container);
  view.container.querySelector("details")!.open = true;
  rtl.fireEvent.change(q.getByLabelText("Task 1 title"), {
    target: { value: "Preserve this draft" },
  });
  rtl.fireEvent.click(q.getByRole("button", { name: "Build baseline schedule" }));
  rtl.fireEvent.change(q.getByLabelText("Block 1 title"), {
    target: { value: "Reviewed cap recovery edits" },
  });
  const save = q.getByRole("button", { name: "Save as new copy to account" });
  rtl.fireEvent.click(save);
  await rtl.waitFor(() => assert.ok(q.getByRole("alert")));
  rtl.fireEvent.click(q.getByRole("button", { name: "Load account schedules" }));
  const remove = await rtl.findByRole(view.container, "button", {
    name: "Delete cloud schedule: Library 2",
  });
  rtl.fireEvent.click(remove);
  assert.equal(deletes, 0, "confirmation is mandatory");
  approved = true;
  rtl.fireEvent.click(remove);
  await rtl.waitFor(() => assert.ok(q.getByRole("alert")));
  assert.ok(remove.isConnected);
  assert.equal(rows.length, 20);
  failDelete = false;
  rtl.fireEvent.click(remove);
  await rtl.waitFor(() => assert.equal(remove.isConnected, false));
  assert.equal(rows.length, 19);
  assert.equal(
    (q.getByLabelText("Block 1 title") as HTMLInputElement).value,
    "Reviewed cap recovery edits",
  );
  rtl.fireEvent.click(q.getByRole("button", { name: "Retry original save" }));
  await rtl.waitFor(() => assert.ok(q.getByText(/saved to your signed-in account/)));
  assert.equal(posts, 2);
  assert.equal(rows.length, 20);
  assert.equal(rows.at(-1)!.plan.blocks[0].title, "Reviewed cap recovery edits");
});
