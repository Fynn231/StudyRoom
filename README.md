# Juliette — natural motion v2

**Standalone visual study, not integrated and not visually accepted.** No production repository files were read or changed. No network assets, providers, credentials, deployment or app snapshots were used. All blossom geometry is newly authored, not the original 24 flat SVGs. This study uses 18 blossoms.

## Open / share

- `index.html` — complete portable interactive study; open directly in a browser.
- `preview.html` — review page with desktop/mobile replay controls and still-state comparisons.
- `desktop-replay.mp4` — 1440×900, approximately 12 seconds.
- `mobile-replay.mp4` — 390×844, approximately 12 seconds.
- Matching `.gif` replays are available, but MP4s are smaller and cleaner.
- `desktop-live.png`, `mobile-live.png`, `viewport-320.png` — inspected actual browser screenshots.
- `motion-off.png`, `reduced-motion.png` — actual nonmoving compositions.
- `verification.json`, `video-playback.json` — measured evidence.

## What changed visually

Compared with the rejected video's actual chronological frames (`rejected-contact.jpg`): its flowers were tiny flat outline marks, substantial opaque app panels concealed the background, and field movement was hard to discern. This study deliberately exposes large surrounding background gaps while keeping only the stationary timer surface protected.

New flowers have five curved, cupped cream petals built as original 3D surface meshes. Pitch/yaw reveal folded edge/back silhouettes; depth-sorted faces, directional light, darker petal roots and the recessed pollen center create volume. Near/far scale, opacity and slight far-focus blur separate distance. These are software-projected SVG meshes, not flat icons rotating in the screen plane. They remain stylized; close inspection reveals some faceting, not photoreal material simulation.

A seeded fixed-step simulation integrates coherent spatial wind, changing updrafts, gravity, orientation-dependent drag, inertia and angular torque. Flowers can slow, arc and briefly rise; there are no four path presets, synchronized loops or visible resets. Recycling occurs only beyond generous offscreen margins. Gentle and Lively vary energy; Off and reduced motion retain the scene without scheduling animation. No flags or moving text exist.

The background itself changes: oversized gold/sage radial fields translate, rotate and breathe at different rates, causing a clearly shifting light field over the 12-second replays. Only the supplied `#ffe6a3` and `#8faa78` endpoints are used in the field. Cream petals and the protected reading surface remain warm. The centered timer is intentional for this focus/operate surface; the design-craft diagnostic found no generic feature-grid, neon-tech, marketing-stat or decorative-card tells.

## Actual checks

- No horizontal or vertical document overflow at 320×690, 390×844 or 1440×900.
- Every button has a 44px minimum height and measured width ≥44px.
- Protected main text contrast: 11.34:1; muted text: 6.38:1; primary button: 7.97:1. Small text over the two-endpoint field has a conservative endpoint minimum of 4.65:1.
- Off, emulated reduced motion and a genuinely hidden browser tab each stopped frame advancement and had no scheduled rAF. Stills remained visible.
- Start counted to 24:59; Pause stayed stable; Reset restored 25:00.
- Zero browser runtime exceptions; extracted JavaScript passed `node --check`.
- Both MP4s fully decoded with FFmpeg and played in actual Chromium without errors; video currentTime advanced past 2 seconds without seeking.

### Performance, not a device claim

The live renderer intentionally targets 30fps. In local headless Chromium with software rendering, the final run measured:

| | Desktop 1440×900 | Mobile-sized 390×844 |
|---|---:|---:|
| Idle median draw | 10.8ms | 20.8ms |
| Idle p95 draw | 12.4ms | 26.6ms |
| Median render interval | 33.3ms | 33.3ms |
| p95 render interval | 33.4ms | 50.0ms |

There are 18 blossoms / 300 surface patches per blossom, in one rAF loop with fixed 1/60-second physics. Mobile-size evidence is desktop browser emulation, **not physical-phone performance**; occasional 50ms intervals occurred. The recordings sample actual browser screenshots at roughly 10fps, preserving their real elapsed timing and encoding at 30fps (duplicate holds, no synthesized animation). These files demonstrate visual movement, not a 30fps capture benchmark.

## Implementation issue / recovery

Canvas 2D in the initial harness returned transparent pixels and caused GPU/readback timeouts, so that rendering attempt was discarded. The final implementation projects the same authored petal geometry into SVG paths and uses composited CSS fields; a separate clean Chromium session verified the working result. `verify.py` and `evidence.py` reproduce checks/capture using the locally available Python environment, websockets and FFmpeg. No installed packages were added.

## Gate

Show the real replays and interactive study for the user's visual decision before any integration. No claim of user approval or production readiness is made. Physical iPhone/Safari testing, app-specific reading-gap composition and integration profiling remain outside this isolated study.
