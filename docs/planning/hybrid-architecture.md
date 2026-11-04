# Hybrid planning candidate — November 2, 2026

## Audit and baseline

Development branch begins at verified `f6fb7c5a8a92ac5d0baa49f6866b5a27f20bbf48`. Existing `/api/ai/plan` validates selected excerpts/intention and output, calls the fixed OpenRouter free router or the operator's local subprocess, and requires hosted Supabase identity. It had a process-wide four-per-minute/single-inference gate, not independent account quotas. `SessionIntention` and `AiStudyPanel` already provide manual/reviewed plan flows. `savedStudyStore` persists explicit derived copies in account-scoped browser storage. Supabase previously verified identity and live-session status only; it did not persist study plans. Rooms/provider sessions are process-memory state.

This branch adds a separate tasks/deadlines planner. Existing notes, intention planning, timers, Spotify, atmospheres and extension paths remain available. The legacy generic free-router endpoint remains an independent explicitly chosen feature, not a fallback from Qwen. Both endpoints share the new capacity gate. No paid fallback was added.

## Modules and flow

- `src/planning/schema.ts`: strict provider-independent inputs, stable IDs, UTC instants, bounded tasks/windows/preferences.
- `scheduler.ts`: deterministic earliest-deadline-first allocation, then priority/difficulty/ID tie-breaks; breaks and unfinished work.
- `savedSchedule.ts`: reviewed schedule validation against its source inputs.
- `providers.ts`: replaceable enhancement contract and disabled future local-provider descriptors. No arbitrary URL setting/proxy.
- `useHybridPlanner.ts`, `PlanningForm.tsx`, `ScheduleReview.tsx`, `HybridPlanner.tsx`: editable baseline → explicit cloud consent → separate suggestion review → explicit save.
- `server/qwenPlanning.ts`: fixed OpenRouter catalogue/inference endpoints; currently available zero-priced, structured-output Qwen `:free` candidates only, no model fallback list or automatic retries. All pricing components must be zero. Provider fallback is disabled and maximum prompt/completion prices are zero. A matching returned model, exactly zero reported cost and valid wording-only output are required.
- `server/aiCapacity.ts`: shared account/provider admission and aggregate metrics.
- `server/hybridPlanning.ts`: authenticated same-origin routes, byte/time limits, cooldowns and preserved state on errors.
- `server/planningAccount.ts`: Supabase transport using the verified caller's JWT and publishable key, never a service-role key.
- `docs/sql/hybrid-planning.sql`: unapplied, additive table/RLS/row-cap review artifact. Existing auth/table policies are untouched.

The deterministic engine runs in the browser, with no provider, login or network dependency. `/api/ai/hybrid/baseline` also exposes the same validation/scheduler behind hosted authentication. `/enhance` requires `consent: true`; the server derives the schedule itself. The model receives only objectives, task titles, difficulty and allotted minutes/block IDs. It does not receive absolute deadlines, recorded progress, room state, imported documents or auth tokens. Models can improve wording only, never timestamps, allocations, task IDs, completion records or active timers. Suggestions are not applied until reviewed.

The account-save route accepts a fresh ID, title, inputs and reviewed schedule; owner IDs in the body are rejected. Supabase RLS enforces caller ownership. Loading validates returned schedules again before offering explicit review. No automatic save or timer changes occur. Device-save remains an explicit checklist copy, up to 12 study blocks; full account schedules are a separate feature. Account save cannot work until its reviewed migration is applied. This branch does not claim live RLS/account-persistence acceptance.

## Scheduling capabilities and limits

Up to 20 tasks; estimated and already-completed minutes; optional exact deadlines; priority 1–3 and difficulty 1–5; up to eight objectives; up to 14 non-overlapping availability windows within 31 days, totaling at most 1,440 minutes. Focus intervals are 5–90 minutes and breaks 0–30 minutes. A final short block may be shorter than the preference. Harder tasks get shorter chunks without inventing extra effort. At most 200 blocks are produced; remaining work is explicit. Overdue allocations generate warnings rather than pretending to meet a deadline. Completed tasks receive no more planned work.

Objectives are preserved/displayed and used for optional wording enhancement, not semantically ranked by a hidden AI. Estimates/progress are user-supplied and are not claims of verified study time. The engine does not parse course calendars, infer dependencies, account for commuting or optimize a semester. Availability windows are the user's declared free time; no device calendar is read. Deadlines are soft warnings when infeasible. Time zones are converted from the user's browser-local inputs to explicit UTC; clock/device settings remain the user's responsibility. Large schedules may exceed the cloud output budget and be rejected; the deterministic schedule remains available.

## Quotas and operational behavior

One in-flight request per account; two shared in flight. Each account gets four admissions per minute and 12 per fixed 24-hour admission window; the shared provider gate allows 12/minute and 40 per fixed 24-hour window. Failed admitted calls count, including no-route failures, to prevent unlimited attempts. Rejected requests do not extend quotas. At most 1,024 live quota identities are stored; when full, new identities fail closed until old daily windows expire. User IDs come from server-verified identity, never client-selected fields. Existing hosted origin, authentication/RPC, direct-address HTTP budgets and connection caps still apply.

Retry-After is interpreted as seconds or an HTTP date, bounded to 1–86,400 seconds. Known upstream categories are retained without raw messages/prompts. Rate limits, upstream capacity and absent free routes impose a shared cooldown. No automatic provider retries are performed (retry budget zero); after cooldown users choose explicitly. Baseline/manual editing stays available. Aggregate counters include admissions, denials, success/failure and active count, not prompt text or user IDs; there is no public metrics/user-lookup API.

Windows reset on the first request after expiry; these are fixed-window limits, not strict sliding-window guarantees. These limits are single-process, reset on restart/deployment and do not make the app horizontally scalable. A shared durable quota store/queue and provider contract are prerequisites for hundreds of users. Free-tier capacity is not a service guarantee. Cloud preference is explicitly saved per account on this device only; consent is never restored. Cross-device preference sync is not claimed.

## Cloud availability and diagnosis

The November 2 public OpenRouter catalogue contained 42 Qwen entries, **zero Qwen `:free` entries and zero Qwen entries with both prompt/completion prices equal to zero**. Paid examples, inspected but not invoked: `qwen/qwen3.8-27b`, `qwen/qwen3.8-flash`, `qwen/qwen3.8-max-prime`. No exact free model or upstream provider could therefore be selected or tested live. The adapter fails with `no_free_qwen` instead of selecting a paid Qwen or a generic model. A future catalogue entry is rechecked at request time; actual inference availability is established only by success.

Sources: https://openrouter.ai/api/v1/models and https://openrouter.ai/collections/free-models . OpenRouter documents separate account free quotas and upstream model capacity limits: https://openrouter.ai/docs/api/reference/limits . Catalogue/pricing observations do not prove provider inference or account-specific quota availability.

Historical live UI errors said busy/rate-limited. The old adapter discarded upstream error bodies and could not distinguish local admission, free daily quota and upstream saturation; that exact historical cause is **unresolved**, not inferred from a generic 429. This candidate safely classifies known future messages into daily quota/upstream capacity/rate-limit/credentials/unavailable, preserves upstream status and bounded Retry-After, and never logs or returns raw provider text. No real authenticated Qwen inference has succeeded in this milestone: no currently free route exists, and the existing Render key was not extracted into development. No credits, billing changes, model downloads or tool installations were requested.

## Release gates

Do not deploy this candidate or apply the SQL without explicit approval. Keep the existing verified production release intact. Before enabling account sync, review/apply the migration in a disposable/staging Supabase project and prove two-account RLS, concurrent insert cap and deletion behavior. Before enabling cloud Qwen broadly, demonstrate a real authenticated zero-cost inference on a currently verified route and validate account/provider limits. Then run limited beta acceptance across real devices. Local providers are later work, disabled here; no Ollama/LM Studio/browser model is installed or downloaded.
