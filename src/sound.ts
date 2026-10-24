/** Original three-voice local cue. Linear envelopes begin/end at zero; no assets or network. */
export function scheduleFocusChime(ctx: BaseAudioContext, onEnd: () => void = () => {}, variant: 'normal' | 'locked' = 'normal') {
  const voices: { osc: OscillatorNode; gain: GainNode }[] = [];
  let done = false, ended = 0;
  const finish = () => {
    if (done) return; done = true;
    for (const { osc, gain } of voices) { osc.onended = null; try { osc.stop(); } catch {} osc.disconnect(); gain.disconnect(); }
    onEnd();
  };
  try {
    const tones = variant === 'locked' ? [164.81, 329.63] : [293.665, 440, 587.33];
    for (const [index, frequency] of tones.entries()) {
      const osc = ctx.createOscillator(), gain = ctx.createGain(); voices.push({ osc, gain });
      const at = ctx.currentTime + .015 + index * (variant === 'locked' ? .24 : .075);
      osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, at);
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(.022 - index * .005, at + .14);
      gain.gain.linearRampToValueAtTime(.006 - index * .001, at + .48);
      gain.gain.linearRampToValueAtTime(0, at + 1.35);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.onended = () => { if (++ended === (variant === 'locked' ? 2 : 3)) finish(); };
      osc.start(at); osc.stop(at + 1.4);
    }
  } catch (e) { finish(); throw e; }
  return finish;
}

export function createFocusChime(factory: () => AudioContext = () => {
  const AC = window.AudioContext;
  if (!AC) throw Error('Web Audio is unavailable');
  return new AC();
}, report: (message: string) => void = () => {}) {
  let current: { ctx: AudioContext; ready: Promise<boolean>; stop?: () => void; closed: boolean } | null = null;
  const close = (attempt: NonNullable<typeof current>) => {
    if (attempt.closed) return; attempt.closed = true;
    if (current === attempt) current = null;
    attempt.stop?.();
    try { void attempt.ctx.close().catch(() => {}); } catch {}
  };
  function cancel() { if (current) close(current); }
  function prepare(): Promise<boolean> {
    cancel();
    try {
      const ctx = factory();
      const attempt = { ctx, closed: false, ready: Promise.resolve(false) } as NonNullable<typeof current>;
      current = attempt;
      // resume() is invoked synchronously in the user's gesture, before a room ack.
      attempt.ready = ctx.resume().then(() => current === attempt && !attempt.closed).catch(() => {
        if (!attempt.closed) { report('Chime unavailable. Your timer still works; try Preview chime after allowing audio.'); close(attempt); }
        return false;
      });
      return attempt.ready;
    } catch { report('Chime unavailable. Your timer still works; this browser may not support audio.'); cancel(); return Promise.resolve(false); }
  }
  async function play(variant: 'normal' | 'locked' = 'normal') {
    const attempt = current;
    if (!attempt || !await attempt.ready || current !== attempt || attempt.closed) return false;
    try { attempt.stop = scheduleFocusChime(attempt.ctx, () => close(attempt), variant); return true; }
    catch { report('Chime unavailable. Your timer still works; try Preview chime again.'); close(attempt); return false; }
  }
  return { prepare, play, cancel, dispose: cancel };
}
