import { useId, useRef, useState } from "react";
const sections = [
  {
    name: "Start",
    title: "One small goal, then a little focus.",
    text: "Write your intention. Plan session can suggest a checklist; review it before using it. Start focus is always your choice.",
    actions: [
      ["Write an intention", ".intention-surface textarea"],
      ["Read the full guide", ".help-panel"],
    ],
  },
  {
    name: "Planning",
    title: "Plan your next step.",
    text: "Use your intention, paste a plan, or import Markdown notes. AI receives only what you explicitly submit. Save a reviewed copy if you want to continue it later.",
    actions: [
      ["Plan an intention", ".intention-surface textarea"],
      ["Import notes", ".goal-panel"],
      ["Saved plans", ".saved-study-plans"],
    ],
  },
  {
    name: "Music",
    title: "Bring your own soundtrack.",
    text: "Add a Spotify playlist link, use an official player, or connect Spotify for full playback with Premium. Sharing your listening status with a room is a separate choice.",
    actions: [
      ["Open music", ".music-panel"],
      ["Listening status", ".spotify-listening-setup"],
    ],
  },
  {
    name: "Focus",
    title: "Make a little space for concentration.",
    text: "Focus view hides secondary tools while keeping your timer and plan. Fullscreen is optional. Device notification settings stay under your control; optional website blocking needs the separate desktop extension.",
    actions: [
      ["Focus options", ".focus-setup"],
      ["Room ambience", ".ambience-panel"],
    ],
  },
  {
    name: "Profile",
    title: "Your room, your choice of what to share.",
    text: "Join a Party room to see others. Profiles and Spotify activity stay private until you share them. Study badges use completed sessions saved on this device, not verified rankings.",
    actions: [
      ["Your profile", ".study-profile"],
      ["Listening status", ".spotify-listening-setup"],
    ],
  },
  {
    name: "Privacy",
    title: "Keep private work private.",
    text: "Room members do not receive your notes, unshared drafts or account tokens. AI sends your submitted intention or selected excerpts to the provider. Saved plans stay in this browser and are not encrypted or cloud-synced.",
    actions: [["Privacy and full instructions", ".help-panel"]],
  },
] as const;
function openTool(selector: string) {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) return;
  for (let node: HTMLElement | null = target; node; node = node.parentElement)
    if (node.tagName === "DETAILS") (node as HTMLDetailsElement).open = true;
  const focus =
    target.tagName === "DETAILS" ? target.querySelector<HTMLElement>("summary") : target;
  focus?.focus();
  target.scrollIntoView?.({ block: "start", behavior: "auto" });
}
export function QuickGuide() {
  const id = useId(),
    buttons = useRef<(HTMLButtonElement | null)[]>([]),
    [active, setActive] = useState(0),
    section = sections[active];
  return (
    <details className="quick-guide" open>
      <summary>Quick guide &amp; tools</summary>
      <div role="tablist" aria-label="Study Room quick guide">
        {sections.map((s, i) => (
          <button
            type="button"
            role="tab"
            key={s.name}
            id={`${id}-tab-${i}`}
            aria-controls={`${id}-panel`}
            aria-selected={active === i}
            tabIndex={active === i ? 0 : -1}
            ref={(node) => {
              buttons.current[i] = node;
            }}
            onClick={() => setActive(i)}
            onKeyDown={(e) => {
              let next = i;
              if (e.key === "ArrowRight") next = (i + 1) % sections.length;
              else if (e.key === "ArrowLeft") next = (i - 1 + sections.length) % sections.length;
              else if (e.key === "Home") next = 0;
              else if (e.key === "End") next = sections.length - 1;
              else return;
              e.preventDefault();
              setActive(next);
              buttons.current[next]?.focus();
            }}
          >
            {s.name}
          </button>
        ))}
      </div>
      <section
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${active}`}
        tabIndex={0}
      >
        <h2>{section.title}</h2>
        <p>{section.text}</p>
        <div className="quick-guide-actions">
          {section.actions.map(([label, selector]) => (
            <button key={label} type="button" onClick={() => openTool(selector)}>
              {label}
            </button>
          ))}
        </div>
      </section>
    </details>
  );
}
