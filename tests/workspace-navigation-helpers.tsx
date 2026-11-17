import { act } from "react";
import assert from "node:assert/strict";
import type { within } from "@testing-library/react";

type View = "study" | "plan" | "music" | "together" | "progress" | "guide";

export function assertWorkspaceView(q: ReturnType<typeof within>, view: View) {
  const navigation = q.getByRole("navigation", { name: "Workspace" });
  const link = q.getByRole("link", { name: view[0].toUpperCase() + view.slice(1) });
  assert.equal(link.closest("nav"), navigation);
  assert.equal(
    link.getAttribute("aria-current"),
    "page",
    `${view} must be the visible destination`,
  );
  const section = q
    .getByRole("main")
    .querySelector(`[data-workspace-view="${view}"]`) as HTMLElement | null;
  assert.ok(section);
  assert.equal(section.hidden, false, `${view} must not be hidden`);
  assert.equal(section.hasAttribute("inert"), false, `${view} must not be inert`);
}
export function assertVisibleControl(target: unknown) {
  if (!target || typeof target !== "object" || !("nodeType" in target) || target.nodeType !== 1)
    return;
  const element = target as Element;
  assert.ok(element.isConnected, "user interaction requires a connected target");
  assert.ok(
    !element.closest("[hidden], [inert]"),
    "user interaction cannot target a hidden/inert owner",
  );
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName !== "DETAILS" || parent.hasAttribute("open")) continue;
    const summary = Array.from(parent.children).find((child) => child.tagName === "SUMMARY");
    assert.ok(
      summary?.contains(element),
      "user interaction requires opening the enclosing disclosure",
    );
  }
}

export function visibleFireEvent(events: typeof import("@testing-library/react").fireEvent) {
  return new Proxy(events, {
    apply(target, receiver, args) {
      assertVisibleControl(args[0]);
      return Reflect.apply(target, receiver, args);
    },
    get(target, property, receiver) {
      const method = Reflect.get(target, property, receiver);
      if (typeof method !== "function") return method;
      return (...args: unknown[]) => {
        assertVisibleControl(args[0]);
        return Reflect.apply(method, target, args);
      };
    },
  });
}

export function openMusicControls(
  q: ReturnType<typeof within>,
  events: typeof import("@testing-library/react").fireEvent,
) {
  visitWorkspace(q, "music");
  const summary = q.getByText("Add a playlist or Spotify link", {
    selector: "summary",
  }) as HTMLElement;
  const custom = summary.closest("details") as HTMLDetailsElement | null;
  const panel = summary.closest(".music-panel") as HTMLDetailsElement | null;
  assert.ok(custom && panel);
  if (!panel.open) events.click(panel.querySelector(":scope > summary")!);
  assert.ok(panel.open, "the outer Music disclosure must be open");
  if (!custom.open) events.click(summary);
  assert.ok(custom.open, "the custom Spotify disclosure must be open");
  assertVisibleControl(q.getByLabelText("Spotify link"));
}

// Existing one-page scenarios explicitly visit the real destination before querying it.
// Keep RTL runtime imports in each test's post-JSDOM setup.
export function visitWorkspace(q: ReturnType<typeof within>, view: View) {
  if (!q.queryByRole("navigation", { name: "Workspace" })) return;
  const link = q.getByRole("link", { name: view[0].toUpperCase() + view.slice(1) });
  if (link.getAttribute("aria-current") !== "page")
    act(() => {
      link.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
  assertWorkspaceView(q, view);
}
