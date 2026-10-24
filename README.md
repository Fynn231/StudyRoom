# Study Room

A private-first focus workspace with a personal timer, optional shared study rooms, editable planning tools and device-local progress.

## What works in this source

- **Solo focus:** adjustable 1–180 minute cycles, pause/resume/reset, completion reflection and local session history.
- **Party rooms:** explicit creation and joining through a six-character room code or invite link, synchronized room clocks, separate personal clocks, host admission lock/removal, and opt-in intention sharing. Opening an invite or signing in does not join a room or start focus.
- **Planning without AI:** import text/Markdown notes, derive a checklist from unfinished tasks, edit/reorder steps, use a step as a private intention, and save/resume derived plan copies. Context-only notes receive a labelled review scaffold, not invented completed work. Pasted external plans and generic editable session templates also work offline.
- **Presentation:** customizable colors, animated decor, reduced-motion support, optional focus sounds, a quieter Lock In view and alternative atmospheres.
- **Music:** official Spotify/Apple embeds and validated links; optional Spotify account-connected playback has separate configuration and provider requirements. Apple account-connected playback is disabled.

## Architecture and privacy

React + TypeScript is built by Vite into `dist/`. A Node server serves the built client and Socket.IO room events. Shared room state lives in process memory; there is no persistent room database. Supabase is used for hosted identity and live-session verification, not cloud storage of study plans.

Imported sources and appearance state are in memory. Saved derived plans, reflections, preferences and session records use browser storage, scoped to the signed-in subject in hosted mode. They are **not encrypted or cloud-synced** and may contain imported information. Browser/site-data clearing can remove them. A different account or sign-in session discards unsaved workspace state. The auth SDK also maintains its own auth/PKCE browser storage.

Typing an intention or importing/building a plan does not publish it to a room. Only explicit sharing sends the intention. Private notes and plan steps are not room broadcasts. Explicit optional local AI requests can send selected text to an operator-configured provider; no personal AI runner or account configuration is distributed here. **Hosted AI is disabled**, even when AI environment variables are supplied.

## Local setup

Use a Node version accepted by `package.json` (Node 24.15.0 or later in the 24.x line is one option), then:

```sh
npm ci
npm run typecheck
npm test
npm run dev
```

The development server prints its loopback address. For the production-style local server:

```sh
npm run build
npm start
```

The default port is 4173; `PORT` can override it. Local mode binds only to loopback, uses anonymous demo room identities, and is not a friend-reachable deployment. Local invite links are same-device only. Environment variables must be provided by the shell or hosting dashboard; this application does not automatically load `.env` files.

## Hosted setup: Render + Supabase

The supplied Dockerfile and `render.yaml` target one free-plan Render web service, with manual deployment, hosted authentication required and `/healthz` as the process-health endpoint. No live service, account consent or SQL application is established by the source or local tests. A public website can be served from a private repository; visitors do not need repository access.

1. Create/select the intended Supabase project. Review and, as database owner, apply `docs/sql/studyroom-session-active.sql` in **that project only**. It is an unapplied setup artifact here. Without this RPC the app fails closed rather than trusting a valid-but-revoked token.
2. Configure email delivery and/or Google sign-in in Supabase. Set the Site URL to the final canonical HTTPS origin and configure its `/auth/confirm` redirect, including the optional validated room query. See `docs/hosted-setup.md` for the email template and verification checklist. Provider secrets belong in provider dashboards, never in the repository or frontend.
3. Connect this private repository to Render using your own account and deploy the Docker service from the intended commit. The blueprint explicitly selects `plan: free`, one instance and automatic deploys off. Check current platform availability/limits before confirming deployment; do not accept a paid upgrade as a prerequisite.
4. Set `STUDY_PUBLIC_ORIGIN` to the exact canonical HTTPS origin (no trailing slash), `SUPABASE_URL` to the exact project HTTPS origin, and `SUPABASE_ANON_KEY` to a publishable key or legacy anon key. The blueprint sets `STUDY_DEPLOYMENT_MODE=hosted`, `STUDY_PROXY_POLICY=render` and `PORT=10000`. Never supply a service-role or secret key. The publishable key is intentionally exposed in client configuration.
5. Verify real email/Google sign-in, expiry/logout/revocation, two independent clients, invite preservation across sign-in and explicit Join room. A healthy `/healthz` alone does **not** establish these features.

**Ephemeral rooms:** free services can sleep/restart and deployments replace the process. All shared rooms, clocks and connected-music sessions are in memory and disappear on restart; create a new room and reconnect music. Browser-local saved plans are separate and are not a server backup. This single-instance design is not horizontally scalable. Hosted empty rooms expire after five minutes; capacity/rate limits reject excess work.

## Optional music and AI

For Spotify account-connected playback, register the exact canonical origin plus `/api/music/spotify/callback` in your Spotify app and set `SPOTIFY_CLIENT_ID`. For local testing also set `MUSIC_ORIGIN` to the exact printed `http://127.0.0.1:PORT` origin; hosted mode always derives the origin from `STUDY_PUBLIC_ORIGIN`. The implementation uses PKCE, one-use state, bounded in-memory sessions and discards refresh tokens. Playback depends on provider consent, eligible account/Premium, app access, device availability and current provider rules. Reconnect after expiry/restart. Embeds and external links do not prove account-connected playback or audible full-track playback.

`server/ai.ts` retains the local subprocess protocol and synthetic fixture tests. The machine-specific operator implementation is intentionally absent. `npm run start:ai` and `npm run test:operator` report **UNAVAILABLE** and exit 2 until independently supplied local operator files exist. No provider credentials, model access or successful live inference are implied. Hosted mode never runs this operator.

## Tests and evidence boundaries

```sh
npm run typecheck
npm run build
npm test
npm run test:integration
npm run test:smoke
npm run test:operator  # expected unavailable (exit 2) in this publication
```

The portable default suite retains the original runtime, UI, privacy, origin, auth, socket, deployment, service-worker and synthetic AI tests. Two operator-dependent assertions are preserved under `tests/local-only/`, outside the default glob, and are run only by the explicit availability-gated operator command. They are not replaced with dummy success or counted as passed. See `docs/testing.md` for the exact split and browser prerequisites.

Auth/provider HTTP fixtures and model subprocess fixtures are **synthetic**. They test the actual application boundaries but do not establish genuine email delivery, Google consent, live Supabase session-row behavior, Spotify consent/DRM or real model output. Browser emulation is not physical mobile-device testing. Container execution and live Render deployment require their own verification.

`docs/publication-manifest.json` maps the selected source baseline to candidate hashes and records exclusions; it deliberately omits machine paths and internal reports. It is a limited provenance aid, not a guarantee that no sensitive data exists. Keep all future keys, user data and test outputs out of Git.
