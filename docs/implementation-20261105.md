# Consolidated implementation checkpoint — November 5, 2026

## Current verification

On `review/consolidated-20261104`, based on `dfb18f93a9bc530236e9c8fd364ac3dee8da41d3`:

| Command / check | Result | Boundary |
| --- | --- | --- |
| `npm run format:check` | exit 0 | Configured complete format gate |
| `npm run typecheck` | exit 0 | Complete configured TypeScript project |
| `npm test` | **250 passed, zero failures/skips**, exit 0 | Includes actual pretest build; component, synthetic HTTP/storage and real-source worker-VM tests |
| `npx playwright test` | **31 passed, zero failures/skips/flaky cases**, exit 0 | Complete normal browser suite, not a filtered replay |
| Generated Focus extension ZIP | Valid; **8 members byte-identical to source** | Local generated artifact; source `manifest.version` is unchanged, so identify by commit/member hashes rather than version alone |
| Portable soundtrack renderer and master | Both executed successfully; resulting full MP3 byte-identical to app asset | Retained engine/bank, same tool versions; not a cross-version guarantee |
| Offline welcome comparison | 18 variant/layout cases across six viewports, no external requests/console errors/overflow | Study-only artifact, not a selected production background |

The full checks were executed in configured CI order. Earlier failed runs are preserved separately, not reclassified as passes. A short-deadline AI fixture passed unchanged at its original deadline after a high-load run failed. Two unit fixtures required explicit recovery actions/region-scoped alerts. An untouched-tab browser fixture sent Escape before the asynchronously mounted dialog existed; waiting for actual dialog visibility fixed that readiness race without increasing deadlines or weakening checkpoint assertions.

## Changes carried forward

- Independent personal/room completion identity and focused-versus-planned time; paused restored checkpoints; account-owned explicit plan selection.
- Honest checkpoint failures without claiming an unconfirmed write was saved.
- Guarded authenticated owner-scoped **saved cloud plan** deletion; no user-account deletion.
- Explicit immutable cloud copies, exact-ID preflight/readback, and safe library-cap handling without UPDATE/upsert or new grants.
- New account-scoped recovery journal stores **only ID, version and SHA-256 fingerprint**, verified before the first POST. It never stores raw tasks, titles, imported notes or drafts. Actual remount recovery works without a current draft. A fingerprint is content-derived metadata, not encryption.
- Explicit original-save retry reconciles first and sends the detached prior payload, never new edits under an old ID. Unknown/malformed/wrong-ID acknowledgements do not confirm success. Missing payload after remount cannot be reconstructed from current edits.
- Conflict recovery can stop tracking only after an informed confirmation that a delayed original may still appear and a later copy may duplicate it. It clears metadata only, never deletes a cloud row or automatically posts a new copy. Storage failures remain visible and blocked.
- Extension key-faithful cleanup reads, persistent/alarm/in-memory retry high-water state, missing retry-alarm repair and stale/duplicate delivery guards. Original lease deadlines are not extended. Worker-VM failure injection is distinct from actual browser enforcement.
- Single-action welcome, returning-session recovery, Escape/focus containment and accessible mute; one persistent original soundtrack owner across Home, Focus and Lock In, independently optional rain, saved mute/stop migration and actual playback readiness. Failed audio does not retry on unrelated gestures.

## Original soundtrack and studies

**Wind over the Reading Terrace** is an original AI-assisted 120-second orchestral study score rendered with GeneralUser GS instruments through FluidSynth WASM: strings, viola/cello, flute/oboe and restrained piano. This replaces the earlier bell-heavy candidate rejected by the owner, which remains preserved outside the application source. It is sample playback, not a live orchestra or an imitation of a named artist.

Full MP3 SHA-256:

```text
388328cb3aedbb120b97686fbcc325a2abe751ebaf329b489e44fdda2b5b13c3
```

Measured full track: approximately −25.26 LUFS, −13.76 dB true peak, zero clipped decoded samples, exact 120-second Chromium decode and verified loop wrap. The app uses the native decoded looping buffer, not a repeatedly scheduled media element. `music-source/terrace/` contains the portable source, authored score, pinned dependency lock, measurement error regression and attribution/reproduction instructions. The instrument bank and dependencies are not committed or bundled in the web client. The bank author's inherited-sample provenance caveat remains explicit; independent commercial clearance and human listening approval are not claimed.

Three standalone original welcome studies—sage canopy, paper horizon and garden window—were delivered for comparison, with the new track embedded and muted by default. The existing application background has not been silently replaced by an unselected study.

## Evidence and release limits

The browser suite includes actual isolated Chromium DNR blocking/Stop/expiry, desktop/tablet/phone layout and accessibility paths, completion state, two local room contexts, and soundtrack policy/readiness/mute/navigation tests. It does not establish real hosted OAuth/cloud RLS, all native API-error/restart conditions, physical-device/Safari acceptance, subjective music/design approval or production deployment.

One canonical PUBLIC repository remains `Fynn231/StudyRoom`; the verified development branch is distinct from public default `main` and hosted production. Independent source review and scoped publication screening precede any development commit/push. Remote SHA/CI must be read back separately. No default-branch merge, production deployment, paid service, live migration or real-user data deletion is authorized by this checkpoint.
