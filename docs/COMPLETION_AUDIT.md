# Study Room — Completion and Release Audit

Updated: 2026-11-04. **Implementation authorized by the consolidated directive; findings remain open until verified fixes.**

## Numbering and current scope

The supplied historical handoff's C1–C5 definitions and the newer audit's A1–A7 labels are not interchangeable. Preserve this crosswalk rather than inventing meanings:

| Historical label | Actual definition | Current findings / action |
|---|---|---|
| C1 | Shared/restored/personal/room completion accounting | A1; implement and regress independently owned cycles and restored completion |
| C2 | Checkpoint persistence falsely reports success | Function-level readback already exists at the baseline; preserve/retest and address any reproduced app feedback gap, not rebuild it |
| C3 | Cloud library create/edit/delete/cap lifecycle | A3/A4; repair routing, owner-bound confirmed deletion, explicit identity and uncertain-save recovery |
| C4 | Selected/resumed plan attribution formerly inferred from DOM | A2; the global replacement causes account contamination and needs owned state. The current master directive also calls this defect C4 |
| C5 | Provider/native integration acceptance | Preserve working cloud Qwen/deterministic fallback. Apple connected playback, local adapters and physical Safari/device acceptance are not silently marked complete or expanded into a new architecture project |

A5 is the additional bounded extension expiry-cleanup defect, **not a renaming of historical C5**. A6 hierarchy and A7 ambience verification are separately tracked integration work. The owner has approved this implementation scope, welcome removal, original music/optional rain, tests/docs and verified development-branch pushes to existing PUBLIC `Fynn231/StudyRoom`. The old private-repository prerequisite below is superseded; default-branch merges, deployment, paid/destructive operations and real-user deletion are not approved.

The original Phase 0 findings below are preserved as baseline evidence. Do not mark a source fix verified from an old green suite or solely from a worker's completion statement.

Scope: current development `dfb18f93a9bc530236e9c8fd364ac3dee8da41d3`; observed production `f6fb7c5a8a92ac5d0baa49f6866b5a27f20bbf48`; public default `672a361e878695cd01e1b6662f2a5622df5c1303`. See `PROJECT_STATE.md` for repository/backup evidence and corrections. VERIFIED/LIKELY/UNVERIFIED labels include the execution boundary; severity here prioritizes product work, not a blanket security certification.

## Current actionable findings

### A1 — P1: restored completion and per-clock accounting

**VERIFIED component reproduction:** `src/App.tsx`, `continueLastSession`, `control`, completion effect: one `sessionRef`/`recordedRef` serves independent clocks; identity is created only for a locally started fresh cycle. Current restored-copy JSDOM probe: fresh one-minute cycle reaches zero and saves one record/dialog; restored half-finished cycle starts at 00:30, reaches 00:00 and saves zero records/dialogs. Controlled time/storage, no hosted accounts.

**LIKELY additional consequences:** non-displayed personal completion, room cycles started by peers, reset/removal/reconnect can cause missing, late or misattributed accounting. These specific multi-clock symptoms were traced in source, not reproduced as live multi-user failures.

**Proposed fix:** define restored-time credit and passive-room participation policy; give personal and room cycles independent typed identity/accounting; observe both deadlines independent of displayed clock; record once with no unearned away-time credit. Preserve existing explicit start behavior, Party privacy and all-member timer control unless requirements change. Regression assets: `tests/session-complete.test.tsx`, `tests/party-private.test.tsx`, `tests/e2e/returning-social.spec.ts` cover separate portions but not this complete lifecycle. **Status: open.**

### A2 — P1: module-global selected plan survives account-keyed remount

**VERIFIED component reproduction on current source:** `src/planSelection.ts` holds one process/module-level `current`; `src/StudyProgress.tsx` writes it on Resume; `src/App.tsx` reads it for completion. `src/AccountApp.tsx` remounts account-scoped components, but no account/unmount cleanup resets this module. The only explicit `clearPlanSelection` call found in the client is closing the resumed plan.

Parent synthetic UI probe loaded a valid account A saved plan, clicked Resume, remounted the account-provider tree as B and completed a B session with no B-selected plan. B's record inherited A's 2/3 completion counts. A's plan text was not displayed in B. This is verified **metric cross-contamination at the React account boundary**, not proof of a remotely exploitable hosted-account takeover or full text disclosure.

**Proposed fix:** scoped React state/context owned by the account/session boundary; clear/invalidate selection on logout/remount, deletion, library reload and external storage changes; update the selected snapshot consistently. Test real component remount and eventually real account switching. Do not replace a DOM-priority bug with unscoped global state. **Status: open/new relative to original audit snapshot.**

### A3 — P2: account-delete handler exists but cannot receive a valid ID

**VERIFIED HTTP reproduction:** `server/hybridPlanning.ts`, `createHybridHandler`: account routing first requires `req.url === '/api/ai/hybrid/account-plans'`, then DELETE expects an `id` query parameter. Query/path variants fail the route; exact route has no ID.

Read-only restored-copy loopback test with synthetic verified identity and a fake upstream that must not be called:
- DELETE `/api/ai/hybrid/account-plans?id=<synthetic UUID>` → 404.
- DELETE `/api/ai/hybrid/account-plans/<synthetic UUID>` → 404.
- DELETE `/api/ai/hybrid/account-plans` → 500.
- Actual DB/upstream calls: zero.

**VERIFIED source concerns behind the unreachable path:** malformed PostgREST ID filter construction, no UUID validation, no explicit owner filter/readback, missing timeout/redirect/error-boundary parity. No DB request was made to validate a live policy or deletion. No account-delete UI was found.

**Proposed fix:** parse/validate method, pathname and ID once; use exact validated owner/ID transport, existing auth/origin/failure boundaries and confirmed deletion; explicit user confirmation and narrow scoped error. Review live SQL/RLS separately before any migration. **Status: incomplete; do not label delete implemented because a handler was added.**

### A4 — P2: cloud-save identity and partial-commit recovery remain incomplete

**VERIFIED source:** `src/planning/useHybridPlanner.ts`, `loadAccount` assigns the first returned plan ID before the user explicitly selects a plan; `saveAccount` reuses that ID or creates a new one. `HybridPlanner.tsx` does not pass an explicitly chosen persistent identity back into this state. `server/planningAccount.ts` still performs INSERT, not update/upsert; `docs/sql/hybrid-planning.sql` caps records at 20 and has no update contract. Existing delete lifecycle is A3, not a working cap recovery path.

`planningAccount.ts` preserves a safe 'reload before retry' message after uncertain confirmation, but the outer hybrid handler replaces it with generic unavailability. Fresh unsaved attempts do not retain a committed-but-unconfirmed attempted ID.

**LIKELY consequences, not live DB reproductions:** duplicate inserts after uncertain saves, unique-key failures when reusing an existing ID, wrong loaded-plan identity and inability to free a capped library slot.

**Proposed fix:** explicit create-copy versus edit/revision semantics; selected and attempted ID state; structured uncertain-save error and explicit owner/ID reconciliation before retry; confirmed deletion/cap recovery. Do not add blind upserts, broad SQL privileges, destructive rollback or paid fallbacks. Synthetic tests currently prove edit preservation, not the full lifecycle. **Status: open.**

### A5 — P2: extension expiry failure can leave enforcement without a retry alarm

**VERIFIED code plus synthetic API execution:** current `extension/background.js`, `stop`, `onAlarm`, queue recovery: rejection during one-shot expiry cleanup is swallowed without scheduling retry. Worker probe with failed rule inspection after consuming the alarm retained one rule, no alarm and the lease. A later Status recovered after the injected error ended. Native failure frequency, actual one-minute expiry with popup closed, worker termination and browser restart were not established.

**Proposed fix:** bounded persistent cleanup-retry intent/backoff without granting more time; truthful unknown/error status; native interruption/expiry tests and explicit disable/remove recovery. Do not promise exact cutoff during sleep or permanent API failure. **Status: open in current source and relevant to deployed source.**

### A6 — P2 usability: timer actions remain below the first viewport

**VERIFIED isolated-browser measurement of byte-matched production commit in local-demo mode:** at 1200x800, Start was at y=1034.14 with height 46; at 325x844 it was at y=1303.11. Timer itself was also substantially below the initial viewport. This reproduces the hierarchy concern without claiming a fresh signed-in live session. No horizontal overflow was observed.

The pre-intervening local candidate fit Start within 1440x900, but at 325x844 it remained at y=1291.11. Current browser layout tests pass their existing assertions; they do not require the primary action above the fold at 325px. Explanatory text/privacy boundaries need progressive disclosure, not removal or hidden disclosure changes.

**Proposed fix:** compact, accessible guide/intro treatment; make timer/intention the first meaningful task; preserve six guide tabs and the calm identity. Recheck 1200px and narrow phones, keyboard/focus and first-run/returning states. Do not redesign the product wholesale or remove auth as a cosmetic shortcut. **Status: open release-polish work.**

### A7 — P2 verification: ambience full-suite failure remains unclassified

**VERIFIED current execution:** current source's full browser run was 26 pass/1 fail. `tests/e2e/immersive.spec.ts`, ambience mode fade, sampled initial gain 0, then about 0.1023; comparison against `normal * 0.4` failed. Unchanged targeted replay passed. Initial grep anchored to the wrong full title selected no tests; it is not a product failure.

**Root cause UNVERIFIED:** scheduling, AudioContext readiness or product envelope behavior requires controlled observation. Preserve the full-run screenshot/video/trace and source unchanged; do not increase sleeps, weaken assertions or call the release browser-green merely because CI or isolated replay passed.

**Proposed next test:** record AudioContext state/currentTime and gain-ramp readiness through play/mode transitions, reproduce under controlled sequencing, then classify before fixing. Audible real-device/provider playback remains a different gate. **Status: open verification discrepancy.**

## Historical findings reconciled against newer source

- **Checkpoint false success:** original `saveCheckpoint` returned true after a silent ignored write. Current `src/sessionCheckpoint.ts` now reads back; the same ignored-write probe returns false. **VERIFIED function-level improvement in the intervening commit**, not an open false-return defect. App-level unsaved-state feedback, old/future timestamp policy and broader failure cases remain unverified/undecided.
- **First DOM checklist attribution:** original App scanned selector priority. The newer commit replaces it with selected-plan state, so do not repeat that old implementation as current. Its module-global replacement introduces A2 and does not establish complete selection lifecycle.
- **No DELETE handler:** obsolete literal statement; a handler now exists but A3 proves it is not functional.
- **No formatter/CI:** incorrect. Prettier and `.github/workflows/checks.yml` exist, and actual remote runs were inspected. Source remains a large App orchestrator; small typed extractions may follow correctness fixes, not a framework migration.
- **Public main versus all GitHub source:** default omissions are real, but extension/welcome/rain exist on the public production-corresponding review branch. The public repo is not a verified private backup. Do not publish a full checkout to cure an apparent default-branch discrepancy.
- No invented '23 of 30 features verified' total is retained. The feature matrix states evidence per row instead of manufacturing a product-completion percentage.

## Extension distribution and security boundary

**VERIFIED artifact:** deployed ZIP SHA-256 `21a71efb58a48f64455b2b514a159431cc1bfed10757d500cef703267e41fd71`; eight members match `f6fb7c5`. Current package differs in README/background/popup JS/popup HTML, while both manifests say `0.1.0`. The inspected download was not executed in this audit. Earlier installed-extension tests loaded the candidate directory, not this downloaded ZIP.

**VERIFIED source:** Manifest V3; permissions are exactly `declarativeNetRequest`, `storage`, `alarms`; no host_permissions, content scripts, tabs/history, external messaging or telemetry/network calls in the bounded extension runtime. Selected-domain `main_frame` session rules are browser enforced. DNR block authority does not require adding broad host permissions. Stored domains/deadline/preferences are local and can be sensitive; Stop retains domain preferences. No token bridge to the website exists.

**Deployed-specific gaps:** its status trusts stored lease without inspecting rules/expiry alarm; popup responses lack the newer ordering guard. Newer source contains rule/alarm reconciliation and response guards, but has A5. `co.uk` passes domain validation and can overblock a public suffix (**VERIFIED mock, LIKELY broad effect**); propose registrable-domain checks or explicit broad-scope review. Different same-version artifacts need version/commit/hash provenance before release.

**Boundary:** no Critical/High remote-compromise issue was identified in this bounded extension review; that is not a whole-app security certification. Blocking is voluntary/bypassable: stop/disable/uninstall, other profiles/browsers/devices, unselected hosts and already-loaded content remain relevant. Main-frame network blocking is not universal content blocking; page service-worker/CacheStorage behavior is a separate documented limitation. Chrome/Edge brand-specific lifecycle and native Safari/iOS acceptance remain unverified.

## Focus versus Lock In

**VERIFIED production-commit replay:** ordinary Focus entry/exit does not activate Lock In. Five L keys outside editors and five brand presses activate Lock In; typing in an intention does not. Running timer node/intention survive reversible entry/exit. No dedicated visible normal-view Lock In activation button was observed; do not claim one exists from an earlier design discussion alone.

**VERIFIED production visual discrepancy:** selected dark palette and document canvas differ (normal white/green canvas remains underneath). Newer source contains the whole-canvas CSS fix and in-flow exit row, but observed production remains older. Lock In's dark creative identity is not the normal sage/white gradient. Forty-eight normal decorations and their lifecycle checks are not proof of every Lock In atmosphere, actual OS Focus or subscriber music playback.

## Reproducible acceptance plan

All unexecuted cases are requirements/proposals, not passed tests. Use exact source SHA, isolated environment, steps, expected/observed results and evidence for each.

| ID | Environment / steps | Expected / observed boundary |
|---|---|---|
| AC1 | Restored current copy; fresh control, partial checkpoint, Continue, Resume, finish | **Executed:** fresh saves 1; restored saves 0. Fix then require one correctly credited record, optional feedback once. |
| AC2 | Two synthetic clients; personal and room clocks independently start/reset/finish/switch | **Not executed as this scenario:** independent cycle IDs and no lost/wrong/duplicate credit. Preserve all-member timer policy; hosts govern membership. |
| AC3 | Account-scoped components A/B; resume A plan, remount B, complete B without selecting | **Executed synthetic React boundary:** B inherits 2/3 counts, no A plan text. Require no stale selection/metrics; later real auth-switch check separate. |
| AC4 | DELETE query/path/exact routes with fake owner-bound transport | **Executed:** 404/404/500, zero DB calls. Require documented valid route, explicit confirmation, exact owner/ID readback; no cross-owner access. |
| AC5 | Approved disposable DB: fill 20, load/select/edit/save-copy/delete/retry; parallel accounts/inserts | **Not executed live:** cap recovery, safe identity, RLS and concurrency; migration separately approved. |
| AC6 | Synthetic INSERT commits then confirmation fails; explicit retry/load | **Partial existing tests only:** preserve edits plus attempted ID/category, no duplicate blind insertion, reconcile owner/ID. |
| AC7 | Storage denial/ignored writes/corrupt/stale values and untouched-tab close | Current ignored write detection **executed**. Corruption tests exist; stale/future acceptance needs defined policy, not an arbitrary expiry fix. |
| AC8 | Personal running timer reload / explicit Continue | Current intended policy is paused checkpoint and no away-time credit. Define two-second tolerance against last confirmed checkpoint, not an undocumented promise of continuing elapsed time during absence. |
| AC9 | Healthy two-client room, removal and reconnect | Existing local cases/assets; independently timed <=5s removal and real hosted accounts remain unverified. |
| AC10 | Actual downloaded ZIP and candidate in disposable Chrome and Edge; one-minute expiry popup closed, worker/browser restart, rule/storage failures | Prior candidate Chromium evidence only. Exact deployed package and all native interruption/brand cases are not passed. |
| AC11 | Lock In/Focus/preset switches with running timer/intention/plan; reduced/hidden lifecycle | Existing passing cases and targeted replay; preserve identity, inspect full canvas, no auto start/reset or OS-DND claims. |
| AC12 | Real Google/revocation/account switch, live free AI route, real audio/metadata, physical iPhone/Safari | **Not executed this audit.** Separate consent/provider/device gates; no paid fallback or fake success. |

## Authorized consolidated sprint — completion requires evidence

0. Existing PUBLIC `Fynn231/StudyRoom` is approved as canonical following the bounded repository assessment; sole integration branch is `review/consolidated-20261104`. Preserve source/history and checkpoint evidence. Verified development-branch pushes are authorized, but default-branch merge and production deployment are not.
1. Account-scoped selection and per-clock/restored completion (A1/A2): add failing reproductions to the normal suite, fix bounded ownership, prove no cross-account/reset regressions.
2. Choose cloud-library semantics and repair routed deletion/uncertain-save identity (A3/A4), using disposable DB policy review before any live migration. No broad upsert permissions.
3. Extension bounded expiry cleanup/release provenance (A5), exact downloaded-package native acceptance; current manual timer controls stay explicit.
4. Resolve ambience verification discrepancy (A7), then compact guide hierarchy (A6) while preserving normal and Lock In identities. Reuse working features; no Vite migration or new integration detours.
5. Full exact-candidate gates and separate explicit approval for public publication/production release; document commit, private push, tests, browser results and deployed SHA independently.

## Technically defensible resume wording

The exact current resume was **not inspected**. These corrections apply to supplied interview/project claims:
- Supported project wording: 'Built an optional Manifest V3 desktop website blocker using Chrome declarativeNetRequest session rules, with user-selected domains, bounded timers and explicit recovery controls.'
- Qualify evidence: selected candidate blocking/Stop/expired-state recovery was tested in disposable Chromium; do not claim Edge, Safari/iOS, natural expiry/restarts or exact deployed ZIP acceptance without those tests.
- Remove/qualify automatic activation/deactivation with website sessions: web timer and blocker are independent; ordinary Focus is not OS DND.
- Do not claim private canonical backup, finished cloud sync, complete account isolation, real-provider playback or production-ready completeness from existing test totals.
- Do not promote the unverified Landover partial-upload incident into personal history; describe the general design lesson unless independently confirmed.
