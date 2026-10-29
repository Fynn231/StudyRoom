# Beneath the Rain

Original Study Room ambience, synthesized locally in `src/ambienceAudio.ts`. No third-party recordings, audio libraries, network requests, or provider credentials are used.

A deterministic xorshift noise field has a one-second equal-power circular join. Three filtered layers evoke soft rain, muffled ocean resonance, and air. Their modulation periods are 60, 90, and 180 seconds; all divide a three-minute cycle. A shared twelve-second mono buffer keeps runtime memory bounded instead of downloading/decoding a long soundtrack. No melody, impulses, or sharp thunder are generated.

Press Play in Room ambience to create/resume the browser audio context. Volume and mute are saved with the existing account-specific device storage; playing state is never saved or automatically restored. Stop fades out and releases the context. LOCKED IN fades active ambience to 28% of its selected level and restores it only while it remains active. Spotify/Apple controls remain independent. Audio failure leaves the timer usable.

To reproduce the standalone three-minute WAV and numerical analysis, run `npm run build`, then `npx playwright test tests/e2e/ambience-render.spec.ts`. The test imports the actual synthesizer into an isolated browser and renders with OfflineAudioContext after filter warmup. Artifacts are written under `.test-output/browser/`. It checks nonzero energy, no clipping, and matching phase after 180 seconds. Signal analysis is not a listening panel or real Spotify playback verification.

Welcome is a native modal dialog with keyboard entry/skip/Escape, focus restoration, saved dismissal, and Show welcome again under Room ambience. Invitation links bypass the first-visit welcome. The application remains mounted behind the scene. Reduced motion enters immediately and removes decorative motion.

Mode changes use same-document View Transitions when available, with stable live workspace state and a separately held focus surface. Labels recede before replacement labels emerge. Unsupported browsers keep the shared background fade. Reduced motion skips the native transition. No full-screen blur or extra motion dependency is used.
