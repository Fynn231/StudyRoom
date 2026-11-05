# Study Room — Project State

Updated: 2026-11-05, America/New_York. **Consolidated implementation authorized; verification in progress.**

**November 5 final local checkpoint:** New orchestral audio/title and durable cloud-save recovery are integrated. The complete configured gate chain passed: format/typecheck/build exit 0, **250 unit tests and all 31 browser tests passed with zero failures/skips**. Native Chromium DNR and exact-asset audio cases are included; hosted/device/aesthetic gates remain separate. The portable renderer was actually rerun and reproduced the app MP3 byte-for-byte. See `implementation-20261105.md`. Earlier failures below remain historical evidence, not current gate results. Independent source review and publication screening are pending; no new commit/push/release is claimed yet.

## Consolidated directive — supersedes the audit stop below

The owner explicitly approved the November 4 consolidated development directive and confirmed the other development session has stopped. The canonical repository is the existing **PUBLIC `Fynn231/StudyRoom`**; no redundant private repository is being created. Sole active integration branch: **`review/consolidated-20261104`**, based on `dfb18f93a9bc530236e9c8fd364ac3dee8da41d3`. Historical checkouts and their unfinished changes remain preserved, not reset.

**VERIFIED consolidation:** all 130 records of the supplied handoff were reconciled with source. `dfb18f9` was a formatting-only fix, not a completed C1 implementation or workflow rewrite. The other session's partial C1 ref declarations were preserved separately; they do not type-match the remaining scalar uses. Its welcome backup is identical to the original welcome. No new soundtrack or welcome removal had been delivered. The baseline below remains historical evidence, not validation of the integration candidate.

**VERIFIED new checkpoint:** 244 selected files restored/hash-matched; Git bundle restored with 15 matching refs and `git fsck` exit 0. Original source hashes remained unchanged during checkpoint creation. Same-disk archives remain private/local; existing committed development source has separately verified public off-device GitHub copies.

**VERIFIED repository safeguards:** authenticated ownership/ADMIN and all remote branches inspected. Bounded scan of 470 reachable historical blobs across 24 commits found no credential-pattern or private-artifact-path alerts; this is not a comprehensive secret/PII certification. Two historical documents contain machine-local paths to sanitize before this publication. `main` now requires a pull request, strict successful `verify` from the GitHub Actions app (15368), administrator enforcement and conversation resolution; force pushes/deletion are disabled. Exact settings were read back and `main` SHA remained `672a361e878695cd01e1b6662f2a5622df5c1303`. Zero outside approvals deliberately avoids locking a sole-owner repository; it does not authorize an agent merge.

**Authorized scope:** correctness A1–A5 (with historical C-label reconciliation), the requested single-action welcome, original composed default ambience with optional rain, bounded hierarchy/integration fixes, tests/docs, and verified development-branch commits/pushes. **Not authorized:** merge into `main`, production deployment, real-user deletion, paid services, secret publication or history rewrite. Live database migrations and provider/device acceptance retain explicit boundaries.

Runtime findings below stay open until corrected behavior and exact candidate checks are recorded. See `DECISIONS.md` for current authority and `COMPLETION_AUDIT.md` for the numbering crosswalk.

**Parent continuation checkpoint:** recovered correctness changes and isolated welcome/audio code have now been boundedly reconciled, with manual App integration. Current parent checks: **235 unit tests passed, zero failed/skipped; typecheck/format/build exit 0**. Generated Focus ZIP: eight members exactly match current source. An initial broader browser run recorded 17 passes/8 failures; seven targeted recovery cases subsequently passed after explicit entry-readiness/fixture corrections and an observed RED→GREEN audio-failure retry repair. The broader run is not retroactively green. The new orchestral asset/background studies, final full browser replay, source review and publication remain pending. See `implementation-20261104.md` for exact scope and `DECISIONS.md` for the latest music direction.

## Preserved Phase 0 baseline — historical, not current defect status

## Evidence labels

- **VERIFIED:** named source/artifact was inspected or the stated command/observation actually executed. The execution boundary is part of the claim.
- **LIKELY:** source-supported consequence not reproduced at the stated runtime boundary.
- **UNVERIFIED:** not established; historical reports and source presence do not fill a missing runtime/provider/device gate.

## Current revisions and repository roles

| Surface | Revision / state | Evidence and limitations |
|---|---|---|
| Public default `Fynn231/StudyRoom:main` | `672a361e878695cd01e1b6662f2a5622df5c1303` | **VERIFIED:** GitHub API; original default tree has 156 blobs. It lacks the later extension, welcome and ambience files. |
| Public production-corresponding branch | `review/returning-home-social-focus-20261029` at `f6fb7c5a8a92ac5d0baa49f6866b5a27f20bbf48` | **VERIFIED:** remote tree has 213 blobs, including those features. |
| Production observed in this audit | `f6fb7c5a8a92ac5d0baa49f6866b5a27f20bbf48` | **VERIFIED:** `/healthz`; an isolated rebuild of this commit produced JavaScript and CSS byte-identical to live assets. This establishes static build correspondence, not fresh OAuth/provider or Render dashboard acceptance. |
| Current development checkout | `review/hybrid-planning-20261102` at `dfb18f93a9bc530236e9c8fd364ac3dee8da41d3` | **VERIFIED:** local HEAD and public remote branch match. The tree was clean before these audit documents. This newer source is **not the observed production release**. |
| Intervening publication | `a0031767c266e944677b5252c46b8de70e12e923`, then `dfb18f93…` | **VERIFIED:** commits and public branch appeared after the original audit snapshot. Their authorizing conversation/actor is **UNVERIFIED** here. Do not infer that the Phase 0 gate approved them or rewrite history to conceal them. |
| Canonical private development remote | Not established | **VERIFIED inventory scope:** no suitable private Study Room repository was found among repositories accessible to the current credential. Other inaccessible identities/organizations are not ruled out. Creation requires owner approval. |

**Important correction:** `Fynn231/StudyRoom` is PUBLIC, including its review branches. A branch name does not provide privacy. Default-branch omissions are not proof of missing development. The extension/welcome/rain source exists on public review branches matching production; these features were added after the default snapshot, not listed as intentionally excluded features.

`docs/publication-manifest.json` explicitly describes the historical initial publication; `docs/release-candidate.json` retains historical candidate status. Neither identifies today's working tree. Documented intentional exclusions include personal Codex operator runners, credentials/configuration, raw internal evidence/reference harnesses, dependencies and generated builds. Preserve that sanitization distinction; do not bulk-copy the legacy prototype into public GitHub.

**Render configuration boundary:** configured repository/branch was not independently read from an authenticated Render dashboard. The automation browser fell back to a fresh profile because the actual default Safari profile was unsupported; its login page does not prove the owner is signed out. Runtime/static assets correspond to `f6fb7c5`; the same-SHA public branch is verified, but current dashboard configuration remains **UNVERIFIED**.

## Architecture

| Boundary | Assessment / source |
|---|---|
| Client | **VERIFIED source:** React 19, TypeScript and Vite (`package.json`, `src/main.tsx`). This is not Next.js; no migration is proposed. |
| Server | **VERIFIED source:** Node HTTP + Socket.IO (`server/app.ts`, `server/start.ts`). Rooms/provider state are process-local; restart/sleep loses them. This is a single-instance beta limitation. |
| Authentication | **VERIFIED source/config:** Supabase, hosted auth required, server-side session checks; `src/auth.tsx`, `server/auth.ts`, `src/AccountApp.tsx`. Fresh live callback/revocation/cross-user acceptance was not rerun. |
| Private data | **VERIFIED source:** account-prefixed browser storage, explicit saved checklist copies and session history (`src/privateStorage.ts`, `src/savedStudyStore.ts`, `src/sessionRecords.ts`). Browser-local does not mean encrypted or cloud-synced. The new module-global plan selection has a reproduced isolation defect; see audit A2. |
| Timers / Party | **VERIFIED source:** separate personal deadline and authoritative room clock. Hosts control admission/removal; timer controls are not exclusively host-only. `src/App.tsx`, `server/app.ts`. Completion accounting is not yet independently owned per clock. |
| Planning | **VERIFIED current source:** intention/manual planning plus a newer deterministic task/deadline scheduler and explicit optional free-route enhancement (`src/planning/`, `server/hybridPlanning.ts`). This newer hybrid workflow is not established on the observed production commit. |
| Music / ambience | **VERIFIED source:** official embeds, Spotify connection/SDK paths, locally generated Beneath the Rain ambience. Connected Apple MusicKit is explicitly disabled. Source/automated boundaries are not proof of audible real-provider playback. |
| Focus | **VERIFIED:** ordinary Focus view, secret Lock In presentation, independent desktop blocker and manual device-DND self-report are separate capabilities. No website-to-extension session bridge exists. |
| PWA | **VERIFIED source foundation:** manifest/icons/service worker. Physical installation/offline/device behavior remains **UNVERIFIED**, not certified by manifest presence. |

## Feature verification matrix

| Feature | Current source / automated evidence | Production / remaining gate |
|---|---|---|
| Welcome, ten normal appearances | **VERIFIED:** committed source; current browser cases exercise presets | Welcome/preset code present in byte-matched production build; subjective acceptance separate |
| Beneath the Rain | **VERIFIED:** generation and controls; current full browser run had an ambience-gain failure, unchanged isolated replay passed | Present in production bundle; audible output on real devices unverified |
| Solo timer / fresh completion | **VERIFIED:** fresh-cycle control probe finishes 01:00 → 00:00 with one record/dialog | Fresh hosted-account completion not rerun |
| Restored completion | **VERIFIED defect:** restored 00:30 → 00:00 produces zero records/dialogs in current restored-copy probe | Release blocker; paused checkpoint restoration itself is deliberate, not automatically a bug |
| Party collaboration | **VERIFIED source and local test assets:** create/join, authoritative timer, privacy/admission/removal | Real independent consenting hosted accounts and five-second removal criterion not established |
| Saved local checklists | **VERIFIED:** schema/allowlist and persistence tests; scoped native keys | Global selected-plan metrics can survive an account-keyed remount; see A2 |
| Hybrid cloud schedule library | **VERIFIED partial source:** create/list plus incomplete delete path | Live table/RLS/cap and real cloud save acceptance unverified; observed production lacks this newer source |
| Ordinary Focus view | **VERIFIED isolated-browser interactions:** entry/exit, separate from Lock In, same timer/intention | Does not activate system DND or install/control the blocker |
| Lock In | **VERIFIED:** five L keys outside editors and five brand presses; reversible running timer/intention in production-commit replay | Production replay retains normal document canvas; newer CSS fix is committed but not deployed. No dedicated visible normal-view activation button observed |
| Desktop blocker | **VERIFIED artifact:** deployed ZIP is valid MV3/DNR source, eight members match `f6fb7c5` | Current package differs in four members; earlier disposable Chromium evidence does not prove exact deployed ZIP behavior in Chrome/Edge |
| Safari/iOS blocker | **VERIFIED candidate preparation only** | Native signing/install/API/device acceptance unverified; full Xcode tooling was unavailable at prior check |
| AI enhancement | **VERIFIED source:** bounded consent/free-route verification/manual fallback | Current real free-model availability/success unverified; descriptor-only local providers are not implemented adapters |
| Spotify / Apple | **VERIFIED source/test boundaries:** embeds and Spotify account code | Real audible playback, independent-user sharing and Apple connected playback not certified |

## Executed verification — keep versions separate

**Current `dfb18f93…`, restored isolated copy, November 4:**
- `npm run typecheck`: exit 0.
- `npm test`: **206 passed, 0 failed/skipped/cancelled**, exit 0; its pretest built the isolated copy, not the application checkout.
- `npm run format:check`: exit 0.
- `npm run test:browser`: **26 passed, 1 failed**, exit 1. Failure: ambience comparison sampled normal gain 0 and a later gain about 0.1023; this is not a clean full-browser release gate.
- Unchanged targeted ambience replay: **1 passed**, exit 0. An initial over-anchored grep selected no tests; that harness invocation is not product evidence. Neither result erases the full-run failure or establishes its root cause.
- Parent targeted JSDOM/synthetic-storage/loopback HTTP audit probes: reproduced A1, A2 and A3; confirmed ignored checkpoint writes now return false. These are controlled component/API observations, not live OAuth/DB testing.
- GitHub run `41778316661` reports success for `dfb18f93…`; prior run `41775912735` failed for `a0031767…`. Remote CI success does not invalidate a later local failure or missing scenario coverage.

**Historical pre-audit local milestone:** 206 tests and 27 browser cases passed before the intervening commits; a separate Focus helper exercised six emulated viewports. Do not relabel all 27 as passing on the current audit run, combine overlapping totals, or infer physical-device acceptance.

Formatting and CI already exist: `.prettierrc.json`, package format scripts and `.github/workflows/checks.yml`. The old assessment claiming no formatter/CI and a 368-line current App was stale. `App.tsx` remains a large orchestration component, but no framework rewrite is needed.

## Milestone ledger

| Feature / milestone | Code committed | Pushed to approved private remote | Automated / browser evidence | Production |
|---|---|---|---|---|
| Baseline welcome/rain/desktop blocker | Yes — `f6fb7c5…` | **No private remote verified**; exists publicly | Production bytes/ZIP match commit; historical CI/local evidence | Deployed revision observed |
| New UI/motion/save confirmation/hybrid work | Yes — included in `a0031767…`, format commit `dfb18f93…` | **No**; public branch presence verified, approval provenance not established here | Current 206 tests/typecheck/format pass; browser 26/27 + one targeted replay pass; targeted defects reproduced | **Not deployed** in observed production |
| Phase 0 documentation | Uncommitted audit documents | No | Source/reference preservation checks and audit evidence | Not a product deployment |

## Recovery and continuation

**VERIFIED recovery:** original checkpoint restored 22 commits/14 refs and 239 selected working files; lean legacy source restored 179 files. Separate public motion-preview history (two commits) was also bundled/restored. The continuation checkpoint preserves current history with 15 refs and 240 selected files; bundle verification, restored Git fsck and file hash equality passed. Backups are access-controlled on the same disk, not an approved private off-device backup. The newer commits are also public remote copies, not private backups. Configuration values and generated dependencies/builds are excluded from source archives; confidential bundles/evidence are not cleared for public distribution or comprehensively secret-scanned.

Exact private checkpoint paths and execution logs are recorded in the local vault handoff. Portable evidence names include `production-source-byte-verification.json`, `github-branches.json`, `current-verification.json`, `current-browser-result.json`, `audit-probes-clean.json` and worker extension/completeness reports.

**Current execution boundary:** canonical public development and the bounded consolidated sprint are approved by the newer owner directive above. Continue implementation and exact-candidate verification on `review/consolidated-20261104`; push only verified coherent commits. No default-branch merge, production deployment, history rewrite, paid service or real-user deletion is authorized. The Phase 0 baseline is retained for comparison, not as a renewed stop gate.
