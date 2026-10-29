// Original synthesis: no recordings, samples, remote requests or audio libraries.
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
        ? raw[i] * Math.sin((t * Math.PI) / 2) +
          raw[length + i] * Math.cos((t * Math.PI) / 2)
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
export function createAmbience(factory = () => new AudioContext()) {
  let context: AudioContext | null = null,
    graph: ReturnType<typeof createAmbienceGraph> | null = null,
    generation = 0;
  let volume = 0.4,
    muted = false,
    locked = false;
  const level = () => (muted ? 0 : volume * (locked ? 0.28 : 1));
  function update(seconds = 1.8) {
    if (!context || !graph) return;
    const gain = graph.master.gain;
    gain.cancelScheduledValues(context.currentTime);
    gain.setTargetAtTime(level(), context.currentTime, seconds / 4);
  }
  return {
    async play() {
      const run = ++generation;
      try {
        if (!context) {
          context = factory();
          graph = createAmbienceGraph(context);
        }
        await context.resume();
        if (run !== generation) return false;
        update(0.8);
        return true;
      } catch {
        if (run === generation) {
          const old = context;
          graph?.stop();
          graph = null;
          context = null;
          if (old) void old.close().catch(() => {});
        }
        return false;
      }
    },
    volume(value: number) {
      volume = Math.max(0, Math.min(1, value));
      update(0.15);
    },
    mute(value: boolean) {
      muted = value;
      update(0.15);
    },
    locked(value: boolean) {
      locked = value;
      update();
    },
    stop() {
      generation++;
      const old = context,
        oldGraph = graph;
      graph = null;
      context = null;
      if (old && oldGraph) {
        const gain = oldGraph.master.gain;
        gain.cancelAndHoldAtTime(old.currentTime);
        gain.linearRampToValueAtTime(0, old.currentTime + 0.12);
        setTimeout(() => {
          oldGraph.stop();
          void old.close().catch(() => {});
        }, 150);
      } else if (old) void old.close().catch(() => {});
    },
  };
}
