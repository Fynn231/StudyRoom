import { useEffect, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { inviteCode } from "./invite.js";
import { useToolNavigation } from "./useToolNavigation.js";

export const workspaceViews = ["study", "plan", "music", "together", "progress", "guide"] as const;
export type WorkspaceView = (typeof workspaceViews)[number];
export function readWorkspaceView(search: string): WorkspaceView {
  const values = new URLSearchParams(search).getAll("view");
  return values.length === 1 && workspaceViews.includes(values[0] as WorkspaceView)
    ? (values[0] as WorkspaceView)
    : "study";
}
function resolveWorkspaceView(search: string): WorkspaceView {
  const url = new URL(window.location.href);
  url.search = search;
  return !url.searchParams.has("view") && inviteCode(url) ? "together" : readWorkspaceView(search);
}
// Never serialize unrelated parameters: invalid literal room tokens must stay invalid.
export function workspaceURL(view: WorkspaceView) {
  const parts = (window.location.search ? window.location.search.slice(1).split("&") : []).filter(
    (part) => {
      try {
        return decodeURIComponent(part.split("=")[0].replace(/\+/g, " ")) !== "view";
      } catch {
        return true;
      }
    },
  );
  parts.push(`view=${view}`);
  return `${window.location.pathname}?${parts.join("&")}${window.location.hash}`;
}
export function useWorkspaceNavigation() {
  const [view, setView] = useState(() => resolveWorkspaceView(window.location.search));
  const openTool = useToolNavigation();
  function navigate(next: WorkspaceView, push = true) {
    if (push && (next !== view || readWorkspaceView(window.location.search) !== next))
      window.history.pushState(null, "", workspaceURL(next));
    flushSync(() => setView(next));
    openTool(`[data-page-heading="${next}"]`);
  }
  useEffect(() => {
    const pop = () => navigate(resolveWorkspaceView(window.location.search), false);
    const reveal = (event: Event) => {
      const target = document.querySelector<HTMLElement>((event as CustomEvent<string>).detail);
      const next = target?.closest<HTMLElement>("[data-workspace-view]")?.dataset.workspaceView;
      if (next && workspaceViews.includes(next as WorkspaceView)) {
        if (readWorkspaceView(window.location.search) !== next)
          window.history.pushState(null, "", workspaceURL(next as WorkspaceView));
        flushSync(() => setView(next as WorkspaceView));
      }
    };
    window.addEventListener("popstate", pop);
    window.addEventListener("studyroom:reveal-tool", reveal);
    return () => {
      window.removeEventListener("popstate", pop);
      window.removeEventListener("studyroom:reveal-tool", reveal);
    };
  }, [view]);
  return { view, navigate };
}
export function WorkspaceNavigation({
  view,
  onNavigate,
}: {
  view: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
}) {
  return (
    <nav className="workspace-navigation" aria-label="Workspace">
      {workspaceViews.map((id) => (
        <a
          key={id}
          href={workspaceURL(id)}
          aria-current={view === id ? "page" : undefined}
          onClick={(event) => {
            if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
              return;
            event.preventDefault();
            onNavigate(id);
          }}
        >
          {id[0].toUpperCase() + id.slice(1)}
        </a>
      ))}
    </nav>
  );
}
export function WorkspaceSection({
  active,
  view,
  children,
  className = "",
}: {
  active: WorkspaceView;
  view: WorkspaceView;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`workspace-section ${className}`}
      data-workspace-view={view}
      hidden={active !== view}
      inert={active !== view ? true : undefined}
    >
      {children}
    </div>
  );
}
