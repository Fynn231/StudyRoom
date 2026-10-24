import { useCopy } from './lockInCopy.js';

export function HowStudyRoomWorks() {
  const c = useCopy();
  return <details className="help-panel">
    <summary>{c('helpSummary', 'How to use')}</summary>
    <div className="help-inner">
      <p>Start small: write an intention, optionally press <strong>Plan session</strong>, then choose <strong>Start focus</strong> when ready. Or turn a Markdown task list into a plan below. No setup required.</p>
      <ol className="help-steps">
        <li><strong>Import.</strong> Open <em>Goals / notes</em> → <em>Choose Markdown notes</em>. Pick UTF-8 .md / .markdown files (up to 5). Imports stay in tab memory; clearing or refreshing removes them.</li>
        <li><strong>Build, or use optional AI.</strong> <em>Build session roadmap</em> makes a local checklist from explicit unfinished tasks (or a labelled review scaffold for context-only notes). For AI, open <em>Choose excerpts for AI</em>, select text, set its time budget, then press <em>Generate AI study plan</em>. Review suggestions; optional answers are sent only when you press Refine.</li>
        <li><strong>Choose one thing.</strong> Press <em>Use this step as private intention</em> (or the AI step action). If you already have an intention, the button says Replace. You can also type directly in <em>Your session intention</em>. Typing an intention does not build a plan, start the timer or share it. Enter or <em>Plan session</em> opens optional <em>Steps</em>, <em>Benchmarks</em>, <em>Time allocation</em> and <em>Skip</em> choices. These work without imports or AI: a generic, editable starting structure, not subject understanding. Time allocation uses your current focus length; edit titles, checkpoints, order and minutes under Edit step. Skip preserves your plan and leaves Start focus explicit.</li>
        <li><strong>Focus.</strong> Set <em>Focus length</em> to 1–180 whole minutes, then <em>Start focus</em>. Pause / Resume continues that cycle; Reset lets you edit its length. Check off plan steps yourself; this does not edit your files. In Party, choose your personal clock or the room cycle. Only <em>Share with room</em> publishes your intention.</li>
        <li><strong>Save / Resume.</strong> Under a built plan, <em>Saved copy title</em> names a copy, not a generation prompt. Press <em>Save on this device</em>, then open <em>Saved study plans</em> → <em>Resume plan</em> on a later visit. Resume the saved copy to keep its completion updated; source-plan edits do not update that copy. <em>Edit saved plan</em> stages text, checkpoints, order and minutes until you explicitly save those edits, or cancel. Delete a copy or clear the saved library explicitly.</li>
      </ol>
      <p><strong>Privacy boundaries.</strong> Import and Build do not send document text to a model. Only Generate / Refine sends selected excerpts and any refinement answers through the local server to the configured AI provider; provider policies apply. Saved derived-plan copies can contain document information in localStorage on this device, same browser and site address only. They are not encrypted or cloud-synced; original files are not saved. Browser clearing may remove them.</p>
      <p className="quiet-note">Keyboard: Tab to a control, Enter or Space to toggle this guide or activate a button. Enter in an intention opens optional planning help; Shift+Enter adds a line. Neither starts focus. Up / Down buttons reorder steps without dragging. Opening this guide never saves, shares or calls AI. Close it whenever you like; How to use stays here near the header.</p>
    </div>
  </details>;
}
