import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { createServer } from "node:http";
import { createHybridHandler } from "../server/hybridPlanning.js";
import { AiCapacity } from "../server/aiCapacity.js";
import { JSDOM } from "jsdom";
import { HybridPlanner } from "../src/planning/HybridPlanner.js";
import { StorageAccountProvider, privateKey } from "../src/privateStorage.js";

const preferenceKey = "studyroom.planning.preference.v1";

test("planning preference is a draft until confirmed; failed persistence preserves prior account preference", async (t) => {
  const dom = new JSDOM("<html><body></body></html>", { url: "https://study.example" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const rtl = await import("@testing-library/react");
  const storage = dom.window.localStorage;
  storage.setItem(privateKey(preferenceKey, "synthetic-A"), "deterministic");
  const original = dom.window.Storage.prototype.setItem;
  let ignoreWrites = true;
  dom.window.Storage.prototype.setItem = function (key: string, value: string) {
    if (!ignoreWrites) original.call(this, key, value);
  };
  t.after(() => {
    rtl.cleanup();
    dom.window.Storage.prototype.setItem = original;
    dom.window.close();
  });
  const mount = (owner: string) => {
    const view = rtl.render(
      createElement(StorageAccountProvider, {
        account: owner,
        children: createElement(HybridPlanner),
      }),
    );
    const details = view.container.querySelector("details")!;
    details.open = true;
    const q = rtl.within(view.container);
    rtl.fireEvent.change(q.getByLabelText("Task 1 title"), { target: { value: "Synthetic task" } });
    rtl.fireEvent.click(q.getByRole("button", { name: "Build baseline schedule" }));
    return { view, q };
  };
  const { view, q } = mount("synthetic-A");
  const reviewedTitle = (q.getByLabelText("Block 1 title") as HTMLInputElement).value;
  rtl.fireEvent.change(q.getByLabelText("Planning provider"), { target: { value: "cloud-qwen" } });
  assert.equal(storage.getItem(privateKey(preferenceKey, "synthetic-A")), "deterministic");
  const save = q.getByRole("button", { name: "Save planning preference on this device" });
  rtl.fireEvent.click(save);
  assert.match(q.getByRole("alert").textContent ?? "", /could not be saved/);
  assert.equal(q.queryByText(/Planning preference saved/), null);
  assert.equal((q.getByLabelText("Planning provider") as HTMLSelectElement).value, "cloud-qwen");
  assert.equal((q.getByLabelText("Block 1 title") as HTMLInputElement).value, reviewedTitle);
  assert.equal(storage.getItem(privateKey(preferenceKey, "synthetic-A")), "deterministic");
  ignoreWrites = false;
  rtl.fireEvent.click(save);
  assert.ok(q.getByText(/Planning preference saved/));
  assert.equal(q.queryByRole("alert"), null, "retry clears the previous failure");
  assert.equal(storage.getItem(privateKey(preferenceKey, "synthetic-A")), "cloud-qwen");
  const consent = q.getByRole("checkbox") as HTMLInputElement;
  rtl.fireEvent.click(consent);
  assert.equal(consent.checked, true);
  view.unmount();
  const a = mount("synthetic-A");
  assert.equal((a.q.getByLabelText("Planning provider") as HTMLSelectElement).value, "cloud-qwen");
  assert.equal(
    (a.q.getByRole("checkbox") as HTMLInputElement).checked,
    false,
    "consent is visit-only",
  );
  a.view.unmount();
  const b = mount("synthetic-B");
  assert.equal(
    (b.q.getByLabelText("Planning provider") as HTMLSelectElement).value,
    "deterministic",
  );
  assert.equal(storage.getItem(privateKey(preferenceKey, "synthetic-B")), null);
});

test("planner preserves reviewed edits through an unconfirmed committed account save, invalid load and provider failure", async (t) => {
  const dom = new JSDOM("<html><body></body></html>", { url: "https://study.example" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const rtl = await import("@testing-library/react");
  const nativeFetch = globalThis.fetch;
  const rows = new Map<string, { id: string; title: string; payload: unknown }>();
  let confirm = false,
    invalidLoad = false,
    posts = 0;
  const handler = createHybridHandler({
    hosted: true,
    origin: "https://study.example",
    capacity: new AiCapacity(),
    account: {
      supabaseUrl: "https://synthetic.invalid",
      anonKey: "synthetic-publishable",
      fetch: async (url, init) => {
        if (init?.method === "POST") {
          posts++;
          const row = JSON.parse(String(init.body));
          assert.equal(row.user_id, "synthetic-A");
          rows.set(row.id, { id: row.id, title: row.title, payload: row.payload });
          return new Response(null, { status: 201 });
        }
        const query = new URL(String(url)).searchParams;
        assert.equal(query.get("user_id"), "eq.synthetic-A");
        if (query.has("id")) {
          if (!rows.has(query.get("id")!.slice(3))) return Response.json([]);
          if (!confirm) return Response.json({}, { status: 503 });
          return Response.json([rows.get(query.get("id")!.slice(3))]);
        }
        return Response.json(invalidLoad ? [{ invalid: true }] : [...rows.values()]);
      },
    },
  });
  const server = createServer((req, res) => {
    void handler(req, res, { user: { id: "synthetic-A" }, token: "synthetic-token" });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  globalThis.fetch = (url, init) =>
    nativeFetch(origin + String(url), {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init?.headers)),
        Origin: "https://study.example",
      },
    });
  t.after(async () => {
    rtl.cleanup();
    globalThis.fetch = nativeFetch;
    dom.window.close();
    handler.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const view = rtl.render(
    createElement(StorageAccountProvider, {
      account: "synthetic-A",
      children: createElement(HybridPlanner),
    }),
  );
  view.container.querySelector("details")!.open = true;
  const q = rtl.within(view.container);
  rtl.fireEvent.change(q.getByLabelText("Task 1 title"), { target: { value: "Synthetic task" } });
  rtl.fireEvent.click(q.getByRole("button", { name: "Build baseline schedule" }));
  rtl.fireEvent.change(q.getByLabelText("Block 1 title"), {
    target: { value: "Reviewed wording" },
  });
  rtl.fireEvent.change(q.getByLabelText("Schedule title"), {
    target: { value: "Reviewed account plan" },
  });
  const save = q.getByRole("button", { name: "Save as new copy to account" });
  rtl.fireEvent.click(save);
  await rtl.waitFor(() => assert.ok(q.getByRole("alert")));
  assert.equal(q.queryByText(/saved to your signed-in account/), null);
  assert.equal((q.getByLabelText("Block 1 title") as HTMLInputElement).value, "Reviewed wording");
  assert.equal(posts, 1, "no automatic retry when write may already be committed");
  assert.equal(rows.size, 1);
  rtl.fireEvent.click(q.getByRole("button", { name: "Load account schedules" }));
  const review = await rtl.findByRole(view.container, "button", {
    name: "Review saved schedule: Reviewed account plan",
  });
  assert.equal((q.getByLabelText("Block 1 title") as HTMLInputElement).value, "Reviewed wording");
  invalidLoad = true;
  rtl.fireEvent.click(q.getByRole("button", { name: "Load account schedules" }));
  await rtl.waitFor(() => assert.ok(q.getByRole("alert")));
  assert.ok(review.isConnected, "failed load preserves the last validated library");
  assert.equal((q.getByLabelText("Block 1 title") as HTMLInputElement).value, "Reviewed wording");
  rtl.fireEvent.change(q.getByLabelText("Planning provider"), { target: { value: "cloud-qwen" } });
  rtl.fireEvent.click(q.getByRole("checkbox"));
  rtl.fireEvent.click(q.getByRole("button", { name: "Enhance with free Qwen" }));
  await rtl.waitFor(() => assert.match(q.getByRole("alert").textContent ?? "", /not configured/));
  assert.equal((q.getByLabelText("Block 1 title") as HTMLInputElement).value, "Reviewed wording");
  confirm = true;
  rtl.fireEvent.click(q.getByRole("button", { name: "Check previous save" }));
  await rtl.waitFor(() => assert.ok(q.getByText(/saved to your signed-in account/)));
  assert.equal(q.queryByRole("alert"), null);
});
