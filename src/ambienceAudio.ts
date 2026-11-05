// Original procedural rain synthesis: no recordings or samples in this graph.
// The separate orchestral soundtrack below is an original score rendered with licensed instruments.
// A circular 12-second texture plus 60/90/180-second modulation repeats every
// three minutes. All modulation frequencies divide that period exactly.
export function createAmbienceGraph(context: BaseAudioContext) {
  const rate = context.sampleRate,
    period = 12,
    overlap = 1,
    length = Math.round(rate * period);
  const buffer = context.createBuffer(1, length, rate),
    samples = buffer.getChannelData(0);
  let seed = 0x52a9f137;
  const noise = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 4294967296) * 2 - 1;
  };
  const raw = new Float32Array(length + Math.round(rate * overlap));
  for (let i = 0; i < raw.length; i++) raw[i] = noise();
  for (let i = 0; i < length; i++) {
    const t = i / (rate * overlap);
    samples[i] =
      t < 1
        ? raw[i] * Math.sin((t * Math.PI) / 2) + raw[length + i] * Math.cos((t * Math.PI) / 2)
        : raw[i];
  }
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(context.destination);
  const nodes: AudioScheduledSourceNode[] = [];
  for (const layer of [
    {
      cutoff: 3400,
      highpass: 450,
      gain: 0.2,
      seconds: 60,
      depth: 0.05,
      offset: 0,
    },
    {
      cutoff: 210,
      highpass: 35,
      gain: 0.65,
      seconds: 180,
      depth: 0.15,
      offset: 4,
    },
    {
      cutoff: 1100,
      highpass: 110,
      gain: 0.12,
      seconds: 90,
      depth: 0.03,
      offset: 8,
    },
  ]) {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const low = context.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = layer.cutoff;
    low.Q.value = 0.5;
    const high = context.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = layer.highpass;
    high.Q.value = 0.5;
    const gain = context.createGain();
    gain.gain.value = layer.gain;
    const movement = context.createOscillator();
    movement.frequency.value = 1 / layer.seconds;
    const depth = context.createGain();
    depth.gain.value = layer.depth;
    movement.connect(depth).connect(gain.gain);
    source.connect(low).connect(high).connect(gain).connect(master);
    source.start(0, layer.offset);
    movement.start();
    nodes.push(source, movement);
  }
  return {
    master,
    stop() {
      for (const node of nodes) {
        try {
          node.stop();
        } catch {
          /* already stopped */
        }
        node.disconnect();
      }
      master.disconnect();
    },
  };
}

export const ORIGINAL_SOUNDTRACK_TITLE = "Wind over the Reading Terrace";
export const ORIGINAL_SOUNDTRACK_URL = "/audio/whimsical-study-loop.mp3";
export type AudioStatus = "idle" | "loading" | "playing" | "suspended" | "unavailable";
export function createAmbience(factory = () => new AudioContext()) {
  let context: AudioContext | null = null;
  let music: AudioBufferSourceNode | null = null;
  let master: GainNode | null = null;
  let rain: ReturnType<typeof createAmbienceGraph> | null = null;
  let loading: Promise<void> | null = null;
  let abort: AbortController | null = null;
  let generation = 0,
    disposed = false,
    wanted = false;
  let volume = 0.3,
    muted = false,
    locked = false,
    rainOn = false,
    rainVolume = 0.4;
  let status: AudioStatus = "idle";
  const listeners = new Set<() => void>();
  const publish = (next: AudioStatus) => {
    if (status === next) return;
    status = next;
    listeners.forEach((listener) => listener());
  };
  function fade(node: GainNode | null, level: number, seconds: number) {
    if (!context || !node) return;
    const gain = node.gain,
      now = context.currentTime;
    // Hold the instantaneous gain, not a sampled pre-resume zero or prior target.
    if (typeof gain.cancelAndHoldAtTime === "function") gain.cancelAndHoldAtTime(now);
    else {
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
    }
    gain.setTargetAtTime(level, now, seconds / 4);
  }
  function update(seconds = 0.15) {
    const attenuation = muted || !wanted ? 0 : locked ? 0.28 : 1;
    fade(master, volume * attenuation, seconds);
    if (rainOn && context && !rain && wanted) rain = createAmbienceGraph(context);
    fade(rain?.master ?? null, rainOn ? rainVolume * attenuation : 0, seconds);
  }
  function sync() {
    if (!wanted || disposed) return;
    publish(context?.state === "running" && music ? "playing" : loading ? "loading" : "suspended");
    update(0.8);
  }
  function release(immediate = false) {
    generation++;
    abort?.abort();
    abort = null;
    loading = null;
    const old = context,
      source = music,
      oldRain = rain,
      gain = master;
    if (old) old.onstatechange = null;
    fade(gain, 0, 0.12);
    fade(oldRain?.master ?? null, 0, 0.12);
    context = null;
    music = null;
    master = null;
    rain = null;
    const close = () => {
      try {
        source?.stop();
        source?.disconnect();
        oldRain?.stop();
        gain?.disconnect();
      } catch {
        /* already stopped */
      }
      if (old) void old.close().catch(() => {});
    };
    if (immediate) close();
    else setTimeout(close, 150);
  }
  async function bounded<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
    let timer: number | ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<undefined>((resolve) => {
          timer = setTimeout(resolve, ms);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    getStatus: () => status,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    // resume is invoked before the first await, within the caller's trusted gesture.
    async play() {
      if (disposed) return false;
      wanted = true;
      let run = generation;
      try {
        if (!context || context.state === "closed") {
          release(true);
          run = generation;
          context = factory();
          master = context.createGain();
          master.gain.value = 0;
          master.connect(context.destination);
          context.onstatechange = sync;
        }
        const current = context;
        run = generation;
        const resumed = current.resume().catch(() => {});
        if (!music && !loading) {
          abort = new AbortController();
          const signal = abort.signal;
          publish("loading");
          loading = (async () => {
            const response = await fetch(ORIGINAL_SOUNDTRACK_URL, { signal });
            if (!response.ok) throw Error("Soundtrack unavailable");
            const buffer = await current.decodeAudioData(await response.arrayBuffer());
            if (disposed || !wanted || run !== generation) return;
            music = current.createBufferSource();
            music.buffer = buffer;
            music.loop = true;
            music.connect(master!);
            music.start();
          })();
        }
        const ready = loading;
        if (ready) {
          const completed = await bounded(
            ready.then(() => true),
            8000,
          );
          if (!completed && run === generation) throw Error("Soundtrack timed out");
        }
        await bounded(resumed, 650);
        if (run !== generation || disposed || !wanted) return false;
        loading = null;
        sync();
        return status === "playing";
      } catch {
        if (!disposed && wanted && run === generation) {
          release(true);
          publish("unavailable");
        }
        return false;
      }
    },
    volume(value: number) {
      volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
      update();
    },
    mute(value: boolean) {
      muted = value;
      update();
    },
    rain(enabled: boolean, value = rainVolume) {
      rainOn = enabled;
      rainVolume = Math.max(0, Math.min(1, value));
      update();
    },
    locked(value: boolean) {
      locked = value;
      update(1.8);
    },
    stop() {
      wanted = false;
      release();
      publish("idle");
    },
    dispose() {
      disposed = true;
      wanted = false;
      release(true);
      listeners.clear();
    },
  };
}
