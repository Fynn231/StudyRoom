# Wind over the Reading Terrace — source and reproduction

Original AI-assisted score for Study Room: 48 bars, 6/8, quarter note 72 BPM, 120 seconds. Two independently voiced string sections, viola, cello, flute, oboe and restrained piano; no bells, vocals, percussion or copied melody. `score.json` captures the authored performance. This is instrument-sample playback, not a live orchestra.

## Requirements and render

Use Node.js, Python 3 (standard library), FFmpeg with libmp3lame, and the GeneralUser GS 2.0.3 SoundFont. The application never downloads the bank or loads this offline renderer. Do not commit the bank, dependencies or large render intermediates.

1. Obtain GeneralUser GS from its author's official repository: `https://github.com/mrbumpy409/GeneralUser-GS`, source commit `684543d5e5efaef08d02be50dcda8d552478fa60`.
2. Check the bank SHA-256: `9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe`.
3. In this directory, run:

```sh
npm ci --ignore-scripts
GENERALUSER_SF2=/path/to/GeneralUser-GS.sf2 node compose-render.cjs
FFMPEG=/path/to/ffmpeg python3 finish.py
```

This writes float PCM, MP3, archival FLAC, a 30-second preview, performance MIDI, readable MusicXML and measurements into this directory. The fixed mastering gain is +16.13 dB; optional MASTER_GAIN_DB is for deliberate recalibration, not automatic dynamic compression. The renderer runs two cycles and retains the second for existing reverb/voices, then applies an 8 ms edge treatment. The musical dominant-to-tonic turn remains part of the composed loop; other media players may schedule gaps. The app uses a decoded AudioBuffer with native looping.

Renderer: js-synthesizer 1.13.0 (lockfile), FluidSynth WASM 2.4.6. Upstream engine/documentation: `https://github.com/jet2jet/js-synthesizer` and `https://github.com/jet2jet/fluidsynth-emscripten`. The engine/bank are not bundled in the web client. Outputs can vary with other versions/platforms; do not assume bit-identical cross-version synthesis.

## Rights and evidence boundary

GeneralUser GS is by S. Christian Collins. Its author permits commercial rendered music; the retained license also discloses incomplete historical provenance of inherited samples. That caveat has not been independently cleared. No exclusivity or commercial legal certification is claimed. The original composition and its arrangement are distinct from the instrument samples. Review individual-sample provenance before a stricter commercial-product clearance requirement.

The local candidate was independently measured around -25.2 LUFS and -13.8 dB true peak, with zero clipped decoded samples, 120-second Chromium decoding and loop wrap. Human musical/audible-seam approval and other-device testing are separate; this candidate is not evidence of live orchestra recording or production deployment.
