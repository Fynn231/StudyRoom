import { useCopy } from "./lockInCopy.js";
import type { WorkspaceView } from "./WorkspaceNavigation.js";
const copy: Record<WorkspaceView, [string, string, string]> = {
  study: [
    "One thing at a time.",
    "Choose a focus length and a private intention. Start only when you’re ready.",
    "Your clock keeps running when you visit another page. Nothing is shared by navigating.",
  ],
  plan: [
    "Plan your next step.",
    "Turn an intention into a checklist, import Markdown notes, or arrange tasks around deadlines. Review the result before using or saving it.",
    "These are different tools: intention planning makes session steps; notes provide source material; tasks & deadlines make a schedule. AI receives only what you explicitly submit. Device saves and account saves are separate choices.",
  ],
  music: [
    "A soundtrack, on your terms.",
    "Use original room ambience, an official embedded player, or optional account-connected playback. Each has its own play and stop controls.",
    "Connecting a provider does not share listening status. Listening consent below is a separate, revocable choice. Visiting this page does not start playback.",
  ],
  together: [
    "Company without a shared notebook.",
    "Choose Party, enter your name, and explicitly create or join a room. Then choose your personal clock or the shared room cycle.",
    "Room membership, clock participation, profile sharing and listening sharing are separate choices. Everyone in a room can operate its shared clock; private notes and unshared intentions stay private.",
  ],
  progress: [
    "Look back, gently.",
    "Review completed cycles and reflect on what helped. A cycle is recorded once before any optional rating.",
    "History is private device data separated by account, not a public ranking or automatic cross-device sync. Reflections are not sent to room members.",
  ],
  guide: [
    "Find your way around.",
    "Study is your timer and current intention. Plan prepares work; Music sets the sound; Together is optional company; Progress is your private review.",
    "Revisit the short walkthrough any time. It never starts a timer, joins a room, submits AI requests or grants consent for you.",
  ],
};
export function FeaturePageIntro({ view }: { view: WorkspaceView }) {
  const c = useCopy();
  const [title, text, privacy] = copy[view];
  return (
    <header className={`feature-page-intro feature-page-intro-${view}`}>
      <p className="eyebrow">
        {view === "study" ? "A LITTLE SPACE TO BEGIN" : `YOUR STUDY ROOM / ${view.toUpperCase()}`}
      </p>
      <h1 tabIndex={-1} data-page-heading={view}>
        {view === "study" ? c("heroTitle", title) : title}
      </h1>
      <p>{text}</p>
      <p className="quiet-note">{privacy}</p>
    </header>
  );
}
