# Hosted free AI

Set OPENROUTER_API_KEY only in the existing service's server environment. Never add a VITE-prefixed key or commit an environment file. The browser receives only availability, validated plans, and non-secret route verification.

The server always requests `openrouter/free` at the fixed OpenRouter endpoint, with provider prompt/completion prices capped at zero, provider fallback disabled, no tools, no model list and no automatic retries. A response must report zero cost before its validated plan is accepted. No paid route exists in the application. Free capacity, rate limits, response format support and the provider's data-policy eligibility can prevent a request from succeeding.

The user explicitly opts into sending the displayed intention or selected excerpts. Nothing typed or imported is sent automatically. Requests stay authenticated and same-origin, bounded in size, duration and frequency. Plan citations and output are validated before replacement. Errors preserve current work and manual/pasted planning. Provider errors and keys are never logged or returned.

Availability is not proof of a successful inference. `/api/ai/status` reports `liveVerified` only after a valid zero-cost response in that server session. This is ephemeral and resets when the service restarts.

Full Spotify playback is separate: the in-page Web Playback SDK player requires Spotify Premium, existing app registration and explicit account authorization; embeds retain Spotify's own playback restrictions. No account playback is claimed from embed or synthetic test success.

## Hybrid planning candidate

The isolated hybrid branch adds a provider-independent tasks/deadlines scheduler with optional verified-free Qwen wording enhancement, per-user/shared quotas and account-save preparation. This candidate is not deployed by this implementation. The legacy generic free-router path remains separate, with shared admission controls; Qwen never silently falls back to it. See [hybrid architecture and release gates](docs/planning/hybrid-architecture.md). No currently free Qwen model was listed at the November 2 catalogue check; do not claim live Qwen inference or applied account-sync RLS.
