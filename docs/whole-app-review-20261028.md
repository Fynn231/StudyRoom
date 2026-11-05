# Study Room whole-app candidate — October 28, 2026

## Baseline and source custody

- Base: `Fynn231/StudyRoom`, `review/render-release-20261026`, commit `afe4f7311526e9fd93a0d766c728c5076689b5cf`. **Historical privacy correction (November 4): the earlier report called this private; authenticated API inspection established that the repository and its review branches are PUBLIC.**
- Verified live in the existing free Render service dashboard; built JS and CSS names also match the public deployment.
- New implementation used a separate checkout. Original local `StudyRoom` prototype was unchanged; it was not a Git repository. This is a historical October 28 report, not current candidate validation; see `PROJECT_STATE.md`.
- Local source backup: 169 selected source/config/test files, tar round-trip hashes verified. Release Git archive: 162 files restored and hashed identically in a private backup directory. Dependencies, credentials, personal imports and browser evidence are excluded from publication.
- The Obsidian overview was readable. It describes an older local prototype; the current explicit handoff authorizes this review branch and the existing free service deployment.
- Local source differs from the release in server trust checks and OAuth callback origin. Those older local changes were not applied: the deployed release's canonical origin, session validation and account separation remain intact. Personal AI runners remain excluded.

## Feature inventory and candidate changes

| Surface | Treatment / regression boundary |
| --- | --- |
| Google / email sign-in | Existing Supabase project and callback maintained. Loading, unavailable and sign-in surfaces restyled; configuration failure now has a retry action. No credential changes. |
| Solo | Timer-first desktop/tablet/phone composition; personal timer and private intention remain independent of rooms. |
| Party | Explicit create/join, invite, shared/personal clock choice, presence, reconnect, admission and host controls preserved. |
| Timer | Start/pause/resume/reset/completion remain authoritative in Party and personal in Solo. No theme/motion action resets clocks. |
| Planning | Existing intention-first offline steps, benchmarks, allocations, edit/reorder/add/remove/check, pasted brief replacement review, and saved copies retained. |
| Imports | Existing explicit Markdown boundary and limits retained. No automatic sync or uploads. Errors remain visible; clearing imports is separate from plans. |
| Appearance | Ten preset identities retained, Juliette capitalized; consistent controls and readable opaque surfaces over the white/sage/green page gradient. |
| Falling art | Browser reproduced 24 moving and 24 unmanaged decorations. All 48 now have initialized positions and motion; sibling moon stars are excluded. Nonuniform seeds, bounded gravity/wind, wide-screen gutter placement, cupped flower shading and folded leaf highlights. |
| Motion lifecycle | One bounded producer per layer, cancellation on unmount, effects-off, reduced motion, hidden handler and mode suspension. No hidden-time catch-up. |
| Hidden LOCKED IN | Five brand taps / five L keys outside editors and reversible exit retained. Whole-app dark styling, default Obsidian Static and chime preference retained. |
| Twelve atmospheres | All original names and effect geometries retained. Theme-specific edge compositions replace shared amber wash; static previews added to picker. No extra particle producer. |
| Music | Official Spotify/Apple embeds and manual controls retained, Silent stops/unloads. Spotify consent now opens through an explicit new-tab link so the active study tab retains timer/drafts. Link expires locally; confirmed account setup removes it. No autoplay claim or simulated connection. |
| AI | Existing server-side/local operator bridge remains optional, bounded and disabled when hosted. Manual and pasted-plan paths stay usable. No new paid provider or fallback. |
| Completion | Save-before-feedback retained; same-record parent renders no longer reset unsaved ratings/focus. Background app is inert while the modal is open. New read-only completed-session history makes saved cycles/ratings visible after closing the prompt. |
| Reflection / progress | Existing separate private reflection/history and saved-plan workflows retained and restyled. No data migration or automatic upload. |
| Device focus / Discord | Existing honest OS Focus instructions retained. No Discord integration exists in source; no connection is claimed. |
| Release diagnosis | Health endpoint reports only a validated Render commit SHA, or null when unavailable; no environment dump. |

## Verification scope

Automated coverage includes auth/session expiry and revocation, hostile origins, protected APIs/sockets, account-scoped storage, room isolation, independent socket clients, timer synchronization, imports, planning, provider errors and duplicate-free completion. Browser tests use real Chrome with separate disposable contexts and synthetic study content. Local contexts do **not** prove independent hosted user-account isolation.

The browser matrix covers 1440×1000, 820×1180 and 390×844; all ten normal presets and twelve dark atmospheres; WCAG A/AA checks through axe; actual 48-body movement, static sibling stars, off/reduced motion, injected hidden/resume handler, repeated mode transitions, preserved plans/timer, completion focus/drafts, manual music surfaces and unavailable AI fallback. Injected visibility events are handler tests, not proof of OS tab suspension. Screenshots and motion recordings remain local evidence.

## External verification limits

- Supabase public settings confirm Google and email enabled on the existing project. A signed-in Safari visit loads the protected hosted app before release. This does not alone verify a fresh OAuth callback or independent-user isolation.
- Hosted AI is deliberately disabled and no approved free hosted provider is configured in this candidate. No personal Codex runner or credentials are shipped.
- Spotify account playback needs genuine provider consent/app configuration and eligible account/DRM; Apple connected playback lacks MusicKit setup. Embeds and load controls do not prove audible or subscriber playback.
- No physical iPhone acceptance, real independent-account room test, or OS suspension proof is claimed.
- Final test exits, branch SHA, deployment outcome and artifact paths are recorded in the accompanying delivery report.

## Candidate verification results

- `npm test`: exit 0; 157 tests passed, 0 failed/skipped/cancelled.
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0. Existing large-client-chunk warning remains; no build error.
- `npm run test:browser`: exit 0; 7 scenarios passed. 39 axe scans cover normal plus twelve atmospheres at three sizes.
- A separate real-browser spot check verifies animated gradient transforms, reduced-motion freeze, effects-off, continuing timer/draft, and no console or local-network errors.
- Test harness uses a 10-second eventual UI observation budget and 30-second process-start budget on busy workstations. No data/security assertions were removed and no runtime deadline was changed. Old failures are retained in private evidence.
- 151 source/config/test hashes match after final unit/typecheck/build validation. Browser application source is unchanged from the tested candidate.
