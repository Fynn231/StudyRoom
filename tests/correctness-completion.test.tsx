import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { App } from "../src/App.js";
import { createServer } from "node:http";
import { Server } from "socket.io";
import type { RoomState } from "../src/protocol.js";
import { CHECKPOINT_KEY } from "../src/sessionCheckpoint.js";
import { loadSessions } from "../src/sessionRecords.js";

test("restored paused timer credits only resumed remaining time once, preserving configured duration", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window,
    Event: dom.window.Event,
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
  dom.window.localStorage.setItem("studyroom.welcome.seen", "1");
  dom.window.localStorage.setItem(
    CHECKPOINT_KEY,
    JSON.stringify({ durationMs: 1500000, remainingMs: 60000, savedAt: Date.now() - 86400000 }),
  );
  const view = rtl.render(<App welcome />),
    q = rtl.within(view.container);
  rtl.fireEvent.click(q.getByRole("button", { name: /Continue last session/i }));
  assert.equal(q.getByRole("timer").textContent, "01:00");
  assert.equal(loadSessions(dom.window.localStorage).sessions.length, 0);
  rtl.fireEvent.click(q.getByRole("button", { name: "Resume focus" }));
  now = 10000;
  rtl.fireEvent.click(q.getByRole("button", { name: "Pause focus" }));
  now = 90000;
  rtl.fireEvent.click(q.getByRole("button", { name: "Resume focus" }));
  now = 140000;
  await rtl.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 280));
  });
  const records = loadSessions(dom.window.localStorage).sessions;
  assert.equal(records.length, 1, "resumed non-fresh timer needs its own completion identity");
  assert.equal(records[0].focusedMs, 60000, "paused/away/pre-checkpoint time is not credited");
  assert.equal(records[0].plannedMs, 1500000);
  await rtl.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 280));
  });
  assert.equal(loadSessions(dom.window.localStorage).sessions.length, 1);
});

test("personal completion is saved while room is displayed and peer-started room credit excludes pre-join time", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
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
  const server = createServer(),
    io = new Server(server, { cors: { origin: "*" } });
  const state: RoomState = {
    code: "ABC123",
    participants: [{ id: "self", name: "Test" }],
    serverNow: 0,
    timer: { durationMs: 180000, remainingMs: 120000, endsAt: 120000 },
  };
  io.on("connection", (socket) =>
    socket.on("room:join", (_data, ack) => ack({ ok: true, state, selfId: "self" })),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    rtl.cleanup();
    performance.now = originalNow;
    await new Promise<void>((resolve) => io.close(() => resolve()));
    dom.window.close();
  });
  const view = rtl.render(
      <App endpoint={`http://127.0.0.1:${(server.address() as { port: number }).port}`} />,
    ),
    q = rtl.within(view.container);
  rtl.fireEvent.change(q.getByLabelText("Focus length"), { target: { value: "1" } });
  rtl.fireEvent.click(q.getByRole("button", { name: "Start focus" }));
  rtl.fireEvent.click(q.getByRole("button", { name: "Party" }));
  await rtl.waitFor(() =>
    assert.equal(
      (q.getByRole("button", { name: "Join room" }) as HTMLButtonElement).disabled,
      false,
    ),
  );
  rtl.fireEvent.change(q.getByLabelText("Your name"), { target: { value: "Test" } });
  rtl.fireEvent.change(q.getByLabelText("Invite code"), { target: { value: "ABC123" } });
  rtl.fireEvent.click(q.getByRole("button", { name: "Join room" }));
  await rtl.waitFor(() => assert.ok(q.getByRole("button", { name: "Join room cycle" })));
  now = 30000;
  rtl.fireEvent.click(q.getByRole("button", { name: "Join room cycle" }));
  now = 60000;
  await rtl.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 280));
  });
  assert.equal(
    loadSessions(dom.window.localStorage).sessions.length,
    1,
    "hidden personal deadline still completes",
  );
  assert.equal(loadSessions(dom.window.localStorage).sessions[0].plannedMs, 60000);
  assert.equal(
    loadSessions(dom.window.localStorage).sessions[0].focusedMs,
    30000,
    "clock selection must not double-credit overlapping personal/room time",
  );
  rtl.fireEvent.keyDown(document, { key: "Escape" });
  now = 120000;
  await rtl.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 280));
  });
  const records = loadSessions(dom.window.localStorage).sessions;
  assert.equal(records.length, 2, "explicitly joined peer cycle gets an independent identity");
  const room = records.find((r) => r.plannedMs === 180000)!;
  assert.equal(room.focusedMs, 90000, "no full-cycle windfall for joining a running room");
  assert.equal(new Set(records.map((r) => r.id)).size, 2);
});

test("peer starts a differently configured room cycle without crediting the old ready duration", async (t) => {
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
  const server = createServer(),
    io = new Server(server, { cors: { origin: "*" } });
  const state: RoomState = {
    code: "ABC123",
    participants: [{ id: "self", name: "Test" }],
    serverNow: 0,
    timer: { durationMs: 180000, remainingMs: 180000, endsAt: null },
  };
  io.on("connection", (socket) =>
    socket.on("room:join", (_data, ack) => ack({ ok: true, state, selfId: "self" })),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    rtl.cleanup();
    performance.now = originalNow;
    await new Promise<void>((resolve) => io.close(() => resolve()));
    dom.window.close();
  });
  const view = rtl.render(
      <App endpoint={`http://127.0.0.1:${(server.address() as { port: number }).port}`} />,
    ),
    q = rtl.within(view.container);
  rtl.fireEvent.click(q.getByRole("button", { name: "Party" }));
  await rtl.waitFor(() =>
    assert.equal(
      (q.getByRole("button", { name: "Join room" }) as HTMLButtonElement).disabled,
      false,
    ),
  );
  rtl.fireEvent.change(q.getByLabelText("Your name"), { target: { value: "Test" } });
  rtl.fireEvent.change(q.getByLabelText("Invite code"), { target: { value: "ABC123" } });
  rtl.fireEvent.click(q.getByRole("button", { name: "Join room" }));
  await rtl.waitFor(() => assert.ok(q.getByRole("button", { name: "Join room cycle" })));
  rtl.fireEvent.click(q.getByRole("button", { name: "Join room cycle" }));
  await rtl.act(async () => {
    io.emit("room:state", {
      ...state,
      timer: { durationMs: 60000, remainingMs: 60000, endsAt: 60000 },
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  now = 60000;
  await rtl.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 280));
  });
  const records = loadSessions(dom.window.localStorage).sessions;
  assert.equal(records.length, 1);
  assert.equal(records[0].plannedMs, 60000);
  assert.equal(records[0].focusedMs, 60000, "a new duration is not elapsed participation");
});

test("completed checkpoint restores zero paused rather than silently starting a fresh full-duration cycle", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window,
    Event: dom.window.Event,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const rtl = await import("@testing-library/react");
  t.after(() => {
    rtl.cleanup();
    dom.window.close();
  });
  dom.window.localStorage.setItem("studyroom.welcome.seen", "1");
  dom.window.localStorage.setItem(
    CHECKPOINT_KEY,
    JSON.stringify({ durationMs: 1500000, remainingMs: 0, savedAt: Date.now() }),
  );
  const view = rtl.render(<App welcome />),
    q = rtl.within(view.container);
  rtl.fireEvent.click(q.getByRole("button", { name: /Continue last session/i }));
  assert.equal(q.getByRole("timer").textContent, "00:00");
  assert.equal(loadSessions(dom.window.localStorage).sessions.length, 0);
});

test("failed checkpoint write keeps prior checkpoint and gives honest unsaved timer feedback", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const rtl = await import("@testing-library/react");
  const prior = JSON.stringify({
    durationMs: 1500000,
    remainingMs: 120000,
    savedAt: Date.now() - 10000,
  });
  dom.window.localStorage.setItem(CHECKPOINT_KEY, prior);
  const original = dom.window.Storage.prototype.setItem;
  dom.window.Storage.prototype.setItem = function (key: string, value: string) {
    if (key !== CHECKPOINT_KEY) original.call(this, key, value);
  };
  t.after(() => {
    rtl.cleanup();
    dom.window.Storage.prototype.setItem = original;
    dom.window.close();
  });
  const view = rtl.render(<App welcome />),
    q = rtl.within(view.container);
  rtl.fireEvent.click(q.getByRole("button", { name: "Continue to Study Room" }));
  rtl.fireEvent.change(q.getByLabelText("Focus length"), { target: { value: "1" } });
  rtl.fireEvent.click(q.getByRole("button", { name: "Start focus" }));
  assert.equal(dom.window.localStorage.getItem(CHECKPOINT_KEY), prior);
  assert.match(view.container.textContent ?? "", /timer checkpoint could not be saved/i);
});
