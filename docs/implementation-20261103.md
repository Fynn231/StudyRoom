# Study Room — integrated implementation milestone

Verified locally: November 3, 2026, America/New_York.

## Delivery level

**IMPLEMENTED, TESTED and INTEGRATED LOCALLY. Not deployed or user-accepted.**

Active checkout: `/Users/duality/Developer/StudyRoom-review-20261028`, branch `review/hybrid-planning-20261102`, HEAD `f6fb7c5a8a92ac5d0baa49f6866b5a27f20bbf48`. HEAD did not change: this milestone is uncommitted. The older non-Git `/Users/duality/Developer/StudyRoom` prototype was not edited. Existing unfinished hybrid-planning changes were preserved.

## Implemented

### Desktop extension and Focus view
- Reconcile stored blocking intent with actual declarativeNetRequest session rules and the expiry alarm. Restore a missing/wrong alarm to the original deadline; do not silently recreate lost rules or grant more time.
- Attempt cleanup when recovery cannot establish bounded enforcement; preserve retry/recovery guidance when cleanup itself fails.
- Prevent stale popup responses from overwriting a newer Start/Stop result; provide Check status.
- Add visible Focus view state and explicit blocker stop/recovery instructions. Timer, view, OS DND self-report and optional blocker remain separate controls. Leaving the website timer does **not** automatically stop the independent blocker.
- Rebuilt the downloadable Chrome/Edge package and compared all eight ZIP entries to their actual extension sources.

### UI and motion
- More compact laptop guide layout keeps the primary timer action above the fold; consistent disclosure targets, keyboard focus and selected-state styling.
- Larger cupped/shaded welcome leaves and scattered reduced-motion placements; natural presets retain their identity.
- Main normal field now uses independently seeded wind, flutter and instantaneous descent variation rather than exact mirrored pairs. A shared mean and bounded stratified rows preserve equal side populations/weight and prevent bunching. This is bounded decorative choreography, not a claim of physically simulated gravity.
- All 48 managed bodies move. Existing lifecycle cancellation on effects-off, reduced motion, hidden state and LOCKED IN remains intact.
- Whole-document dark canvas now matches LOCKED IN. Exit controls occupy an in-flow row instead of overlapping timer/intention content.
- Ten normal appearances and twelve dark atmospheres preserved; no new flags or theme-induced timer resets.

### Persistence and partial failure
- Session/rating saves compare the entire intended record history to storage readback instead of trusting a retained ID.
- Planner preferences remain visit drafts until confirmed persistence; ignored writes do not falsely report success, and successful retry clears the previous error.
- Account-plan saves require exact ID/owner-scoped readback after INSERT. A partial commit/confirmation failure is reported without automatic retries or destructive rollback; reviewed edits stay available.
- Cloud account behavior was tested using synthetic transport/HTTP boundaries, not a live schema/RLS migration.

## Independent verification

The parent combined isolated workers, verified baseline and changed-file hashes, then exercised the combined candidate. After integration, the full suite/typecheck/build/format checks were repeated in the actual checkout.

| Command / gate | Actual result |
| --- | --- |
| `npm test` in combined candidate and again in integrated checkout | 206 passed; 0 failed/skipped/cancelled; exit 0 |
| `npm run typecheck` final combined and integrated checkout | exit 0 |
| `npm run build` final combined and integrated checkout | exit 0; existing large-client-chunk warning remains |
| `npm run format:check` | exit 0 |
| `npm run test:browser` combined candidate | 27 passed; exit 0 |
| `node --import tsx tests/e2e/focus-reliability.browser.mjs` integrated checkout | Six viewport cases passed: 320x640, 390x844, 768x1024, 820x1180, 1440x900, 1920x1080; no overflow/page errors, timer preserved |
| Actual extension enforcement in disposable pinned Chromium | Same reachable fixture succeeds before blocking, fails with ERR_BLOCKED_BY_CLIENT while a real rule exists with no extra fixture hit, succeeds after Stop; actual missing-alarm recovery preserves deadline; expired-lease reconciliation removes actual rules |
| `git diff --check` | exit 0 |
| Extension ZIP | Eight entries match extension source bytes; locally served ZIP matches packaged bytes |
| Local runtime | `/healthz` ok; config explicitly local demo; served JS/CSS match exact integrated production assets |

Native restart/suspension and natural alarm firing at a real one-minute deadline were not established by the expired-lease recovery check. Two local browser contexts are not proof of independent hosted account isolation.

### Reconciled failures
- Initial full baseline: 187 tests, 186 pass/one flaky room rejoin assertion. The other client's presence event can precede the joining client's acknowledgement; the assertion now waits for the joining client's own rendered control and retains clock/privacy checks.
- Browser prerequisites were absent: installed the project's pinned Playwright FFmpeg and Chromium caches, without changing project dependencies or disabling video evidence.
- Hybrid browser fixture initially had past availability; fixed fixture wall-clock. Its populated textarea also needed an accessible-role query rather than the exact implicit-label query. Consent, failed-enhancement preservation and timer assertions remain.
- Transition sampling initially assumed a fixed delay after an asynchronous view-transition callback. It now awaits the actual mode attribute and observes an intermediate opacity, then the final opacity; it still fails if the fade is absent.
- New motion tests failed against mirrored/shared-rate behavior before implementation and pass afterward. The prior exact-mirror assertion was replaced by equal population/weight, bounds and cyclic spacing checks on both sides, including 320px and thirty minutes of sampled motion.
- An intermediate new-test type-inference diagnostic was corrected with an explicit numeric annotation. The final typecheck is green.

## Evidence

Private local evidence: `.test-output/implementation-20261103/` (not for publication), including preserved source archive/manifest, worker reports, parent RED/GREEN logs, integrated command logs, final browser screenshots/videos/traces and source-hash manifest.

Detailed source list: `.test-output/implementation-20261103/integrated-files.json`.

Local preview process was started from the integrated production build at loopback port 4173 and opened/read back through the desktop preview. This is a local demo, not a replacement for hosted authentication.

## Safari / external boundaries

`npm run extension:safari:prepare` and `node --check .test-output/safari-extension/background.js` passed using the updated resources. This only prepares a candidate. `xcrun --find xcodebuild` and `xcrun --find safari-web-extension-converter` both returned exit 72; selected tooling is `/Library/Developer/CommandLineTools`. No full Xcode install, signing, native generation, Safari installation, iOS device test or OS DND activation is claimed.

No Git commit/push, deployment, paid service, credential change, database mutation or account transfer was performed. The public hosted site has not received this milestone. Fresh Google OAuth, live cloud plan saves/RLS, real provider audio, real independent hosted users, physical iPhone behavior, native restart tests and subjective visual/motion acceptance remain separate gates.

## Source of requested engineering lessons

User-supplied interview text motivated separation of drafts from durable state, browser-native blocking lifecycle and partial-failure consistency. CareerOS and the capstone were not modified. Unverified interview examples were not promoted to historical facts.
