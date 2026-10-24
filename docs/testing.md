# Test boundaries

## Portable default suite

`npm test` first builds the production client, then runs every root `tests/*.test.ts` and `tests/*.test.tsx` serially using Node's test runner and `tsx`. These are actual application assertions, not generated success output. `npm run typecheck` includes source, server and test TypeScript. Integration and smoke scripts remain explicit additional entrypoints.

The source baseline had two additional operator-dependent assertions:

- `ai-startup.test.ts`: the explicitly configured private-local AI launcher status, without probing a model.
- `intention-bridge.test.ts`: the private Python operator's intention validation and distinct mode policies.

Their real assertions are preserved in `tests/local-only/`, with relative paths adjusted for that location. They are **not** collected by the portable default glob. `npm run test:operator` first checks both unpublished private operator files and exits **2 / UNAVAILABLE** when absent; no tests or provider calls run in that case. `npm run start:ai` uses the same prerequisite gate. This is intentionally not a skipped/pass placeholder. The distributed server, protocol, request validation, limits, fallback and synthetic subprocess tests still run in the portable suite.

The optional `ai-live.mjs`, `intention-live.mjs` and `ai-study.browser.mjs` also require the undistributed operator. The optional live-AI section of `usability.browser.mjs` requires `STUDY_BROWSER_LIVE_AI=1` and that operator. Do not run those live-provider sections without independently supplying the operator and explicitly authorizing provider access. No genuine-provider acceptance is claimed here.

## Optional disposable-browser exercises

Browser scripts require an installed Chromium-compatible browser and the `ws` package currently present in the locked development dependency graph. They use disposable profiles, not an existing user profile. Set `CHROME_BIN` to the executable; otherwise `chromium` is resolved on PATH. They use the OS temp directory (which respects `TMPDIR`) for disposable profiles and ignored test-output locations for artifacts. Some harnesses accept `STUDY_EVIDENCE` as an output override. Never add resulting screenshots/logs/session data to Git.

Examples after `npm run build`:

```sh
CHROME_BIN=chromium node --import tsx tests/usability.browser.mjs
CHROME_BIN=chromium node --import tsx tests/auth-recovery.browser.mjs
CHROME_BIN=chromium node --import tsx tests/study-progress.browser.mjs
```

These scripts are not part of `npm test`. Some exercise external music embeds and therefore need provider network access; default unit/integration fixtures do not prove that live path. Synthetic hosted auth responses in browser exercises remain labelled synthetic. Browser device emulation does not establish behavior on physical iOS/Android devices.

Two internal harnesses, `atmospheres.browser.mjs` and `final-delivery.browser.mjs`, are not distributed because their reference-image/delivery workflow depends on unpublished private assets and internal evidence locations. Their absence is documented, not hidden as a pass; runtime atmosphere/appearance/Lock In tests and other portable browser harnesses are retained.

## Publication verification and identity

The publication manifest records source/candidate SHA-256 mappings, modifications and exclusions. It excludes itself from its own hash set to avoid a recursive checksum. Verification logs remain outside the repository; a sanitized result file records the actual command exits and test counts. Basic secret/path scans are heuristic, not a comprehensive secret audit or vulnerability assessment.

If this initial snapshot is committed using `StudyRoom Publication Bot <publication@studyroom.invalid>`, that is an explicitly synthetic repository-local automation identity using the reserved `.invalid` domain. It does not impersonate the owner or assert a verified GitHub user/email. No global Git identity is changed. The owner may choose a verified no-reply identity for later commits.
