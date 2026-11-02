# Engineering and readiness review — November 2, 2026

## Verdict

Study Room is a working private beta. It is suitable for controlled use and further user testing, but is not a finished production product or a native iOS focus/blocking app. Engineers would recognize the architecture and many good decisions here. They would also ask for more consistent formatting, smaller orchestration components, repeatable CI and clearer release documentation before treating it as a mature maintained project.

This review inspected the private repository metadata, tracked source, package configuration, existing tests and earlier release evidence. It did not inspect every historical commit, re-audit live Supabase RLS, or perform a penetration test. GitHub confirms Fynn231/StudyRoom remains private with main as its default branch. The active review branch contains changes not merged into that default; someone opening GitHub's default view will therefore see the older project.

## Code readability and comments

Strengths: strict TypeScript, separate room/auth/music/AI boundaries, explicit input validation and privacy rules, meaningful negative tests, lockfile, environment exclusions and descriptive incremental commits. Existing comments explain trust boundaries, direct transport addresses, provider restrictions and private checkpoint handling. These are useful engineering comments, not missing blanket documentation.

Weaknesses: App.tsx mixes workspace orchestration, timers, auth-dependent actions and large inline JSX. Its 368 lines understate its complexity because many are very long. Some feature files and server/music.ts similarly compress validation and rendering. Spotify SDK/response boundaries retain explicit any types. There is no configured formatter/linter or .github CI workflow. Tests use a machine-specific Chrome path. Historical release manifests and README claims had drifted from the branch. These make onboarding and reliable review harder; they do not alone establish functional insecurity.

Changes made in this review: corrected the README's obsolete hosted-AI claim and snapshot language; added source navigation and contribution guidance; commented why home motion uses independent transform layers; clarified iOS Focus capabilities; stopped restoring a prior visit's DND self-report. A regression checks that a checked confirmation is unchecked after reload. Comments should explain constraints and decisions, not annotate every ordinary line.

Recommended next cleanup: introduce an agreed formatter/linter as a separate reviewable change, split timer/checkpoint and party orchestration into hooks/components, replace provider any types with unknown plus validated types, and add CI with a portable browser setup. Avoid a giant formatting/refactoring diff mixed with new behavior. No license was selected on the owner's behalf.

## iOS Focus: actual capability

The in-app Focus view is implemented: timer/intention/plan remain available, secondary tools hide, exit is reversible and fullscreen failure is recoverable. It does not start a timer automatically. Responsive Chromium tests are not physical iPhone Safari testing.

A Safari website has no permission API to activate system Focus/DND. A notification permission prompt would grant notifications, not silence other apps. Users can use Control Center → Focus, configure allowed notifications in Settings, or create their own Set Focus Shortcut. Apple's native Focus filters customize app behavior for a selected Focus; they are not a web permission to enable DND. A native companion/Shortcut integration would be separate work with its own consent and testing.

The included optional timed website blocker is a desktop Chrome/Edge Manifest V3 extension. It is NOT installed into iOS Safari by visiting the website or downloading its ZIP. Safari/iOS blocking needs a separately packaged Safari extension/content blocker, or a native Screen Time solution with appropriate Apple capabilities. That work is not implemented. Existing loaded tabs/media and OS background suspension also limit what a web focus experience can promise.

Apple references:
- https://support.apple.com/en-euro/guide/iphone/iphd6288a67f/26/ios/26
- https://developer.apple.com/documentation/AppIntents/defining-your-app-s-focus-filter
- https://developer.apple.com/documentation/SafariServices/creating-a-content-blocker
- https://webkit.org/blog/13878/ (web notification permission is separate)

## Completion assessment

Implemented: solo timer, manual/reviewed planning, returning home/checkpoint, focus view, atmospheric UI, embeds/playlist links, room clocks and opt-in sharing, device-local profiles/progress, optional desktop blocker and server-side free-only AI integration. Automated coverage includes privacy, provider failure, timers and extension blocking.

Still open before calling the intended product done:
1. Release pending reviewed changes and verify exact live revision; the last byte-verified live release was 68fb47b, while 57b7999 home motion was pushed but awaiting deployment before this review.
2. Obtain a real successful zero-cost AI plan. Latest real provider check was rate-limited; manual fallback worked. Never add a paid fallback to resolve this.
3. Exercise real Spotify active-track metadata and two independent consenting users in a room. Real OAuth succeeded, but the provider reported no current track. Audible full playback was not established.
4. Run physical iPhone Safari checks: background/lock/resume timer accuracy, audio, keyboard/small-screen interactions, auth redirect, storage and reduced motion. Do not infer these from desktop emulation.
5. If optional blocking on iOS is a requirement, build and distribute an actual Safari/native companion; the website alone cannot provide it.
6. Finish maintainability/CI work and broader security review, including operational settings and live database policies. Existing headers and tests are useful safeguards, not proof of complete security.

Operational limits: shared rooms and provider sessions are memory-only and reset on deployment/sleep; plans/progress are browser-local, not encrypted or cloud-synced; the single-instance server is not horizontally scalable. A temporary synthetic Release check room's final state/cleanup was not verified when native browser access failed in the previous pass. Do not describe fixtures as real multi-person acceptance.

The release boundary is a reviewed private branch. No main merge, paid upgrade, credential rotation or database modification is part of this review.

## Validation of this review's changes

Typecheck and production build passed. Full suite: 168 passed, zero failed/skipped. Five real Chromium browser tests passed, including visit-only Focus confirmation, account/profile boundaries, checkpoint preservation and the optional extension. The auth lifecycle test was updated to require a non-persisted self-report while retaining account-switch and legacy-storage isolation assertions; it passed independently and in the full suite. The initial full run caught its outdated persistence expectation before that correction.

A fresh hosted health request on November 2 timed out; current live availability/revision was not re-established in this pass. No new deployment is claimed. The private branch is the deliverable for this review.

## Follow-up implementation

The subsequent cleanup adds pinned Prettier formatting and checks, reformats source into readable blocks, extracts local fullscreen/Escape presentation into `useFocusView`, and adds a read-only GitHub Actions workflow for formatting, typechecking, tests and browser checks. Playwright now supports Linux/pinned Chromium and an explicit CHROME_BIN override. The large App orchestration still merits further gradual extraction; formatting does not eliminate its architectural complexity.

The blocker follow-up validates stored leases, rejects local/private hostnames, keeps Stop available after preference-read failure and refreshes open-popup status after expiry. Real extension tests exercise expired-lease cleanup and removal of actual session rules. Safari candidate preparation is isolated from Chromium sources; native signing/install and compatibility remain unverified.

Exact local Apple tool blockers: `xcrun --find safari-web-extension-packager`, `xcrun --find safari-web-extension-converter` and `xcrun --find xcodebuild` report unavailable. The active `/Library/Developer/CommandLineTools` installation is working and was not reinstalled or reconfigured. Full Xcode is needed for local Safari/iOS native generation/build/testing, not website development or Chromium extension development.
