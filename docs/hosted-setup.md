# Hosted setup and acceptance

This is setup guidance, not evidence of a deployed integration. No remote SQL or account settings are applied by this repository.

## Required environment

| Name | Required hosted value |
| --- | --- |
| `STUDY_DEPLOYMENT_MODE` | `hosted` |
| `STUDY_PROXY_POLICY` | `render` |
| `STUDY_PUBLIC_ORIGIN` | Exact canonical HTTPS DNS origin, without path, slash, query, fragment or credentials |
| `SUPABASE_URL` | Intended project's HTTPS origin |
| `SUPABASE_ANON_KEY` | Publishable key or legacy anon key; never service-role/secret |
| `PORT` | Render-provided port; blueprint specifies `10000` |

The server rejects incomplete hosted configuration before listening. Host and Origin must match the configured canonical origin. Forwarded headers cannot broaden trust. Do not expose local mode by changing its bind address to bypass authentication.

## Supabase setup

1. Review `sql/studyroom-session-active.sql`. As the intended project's database owner, apply it only after confirming the project. This security-definer function has an empty search path, no arguments and fully qualified objects. Only authenticated callers may execute it; it returns a boolean for the verified caller's own user/session row and expiration, not arbitrary session information.
2. Configure the canonical Site URL and allowlist the canonical `/auth/confirm` redirect, including its optional room query. The application sends `room` only when it is exactly six uppercase letters/digits. Validate the provider's redirect/query matching with a disposable test account.
3. Enable and configure email delivery. The application explicitly handles token-hash email callbacks. The magic-link template must carry the token hash and original redirect hint:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&invite_redirect={{ .RedirectTo }}">Sign in</a>
```

4. If Google sign-in is desired, create/configure your Google OAuth app and enable its Supabase provider. Follow the provider dashboard's callback instructions, then ensure the application's canonical `/auth/confirm` target is allowlisted. OAuth PKCE callbacks must be completed in the browser that began sign-in. No Google client secret goes into frontend source or this Git repository.
5. Use only the publishable/anon key in the application environment. It is public configuration, not a privileged database credential. The actual verified access token plus live-session RPC are required for protected requests.

A valid JWT alone is insufficient: the application verifies its signature/issuer/audience/expiry and then checks the live-session RPC. Missing RPC, false/malformed response, timeout, expiry or provider failure denies access. HTTP protected requests and socket handshakes/events use these checks. Socket idle polling is every five seconds with a three-second request timeout; revocation is not instantaneous and provider propagation/scheduling can add delay. Pending checks suppress that socket's delivery. The UI also rechecks the session before exposing private hosted workspace state.

## Render packaging

`Dockerfile` builds Vite with locked dependencies, installs production dependencies in a separate stage, includes `tsx` as a runtime dependency and runs as the non-root `node` user. Docker context inclusion is allowlisted. Personal operator implementations, env files and test outputs must stay excluded.

`render.yaml` explicitly requests `plan: free`, one instance, manual deploys and `/healthz`. The official Render free-service documentation describes idle spin-down and an ephemeral filesystem. In addition, this application's room/music maps are process-local: they disappear on any restart or redeploy. Browser-local saved plans are separate. Review current platform terms, availability and resource limits in the Render dashboard before deployment; do not silently select a paid plan.

Reference documentation: Render's **Deploy for Free** and **Blueprint YAML Reference** pages. A successful local build or process-health response is not a container-build, provider-readiness or public-deployment claim.

## Real acceptance checklist (not satisfied by fixtures)

- Confirm the service uses the exact intended commit, free plan and canonical HTTPS origin.
- Confirm `/healthz`, application shell and config, but also complete real sign-in with each enabled provider.
- Open an invite while signed out, sign in, confirm the room hint survives and that entry still requires an explicit name and Join room.
- With two independent browsers/accounts, create/join a room and verify synchronized Start/Pause/Reset, private plans and opt-in intentions.
- Exercise expired/malformed callbacks, token expiry, logout/revocation and unavailable session RPC; none may silently enable local/anonymous hosted access.
- Confirm account switches do not reuse unsaved private workspace state or another account's saved plans/music session.
- Confirm a restart loses rooms/music sessions as documented; create a replacement room.
- If enabling Spotify, verify genuine consent, eligible account/device playback and reconnect; official embeds or a synthetic token response are not equivalent.

Hosted AI remains disabled; do not install a personal operator bridge in the deployed image.
