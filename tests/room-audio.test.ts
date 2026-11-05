import { test } from "node:test";
import assert from "node:assert/strict";
import { createAmbience } from "../src/ambienceAudio.js";
function harness(state = "suspended") {
  const gains: any[] = [];
  const sources: any[] = [];
  let resumes = 0,
    decodes = 0;
  const context: any = {
    state,
    currentTime: 2,
    sampleRate: 100,
    destination: {},
    onstatechange: null,
    createBuffer(_c: number, n: number) {
      return {
        getChannelData() {
          return new Float32Array(n);
        },
      };
    },
    createBiquadFilter() {
      const n = {
        frequency: { value: 0 },
        Q: { value: 0 },
        connect() {
          return n;
        },
      };
      return n;
    },
    createOscillator() {
      return {
        frequency: { value: 0 },
        connect() {
          return { connect() {} };
        },
        start() {},
        stop() {},
        disconnect() {},
      };
    },
    createGain() {
      const gain = {
        value: 0,
        cancelScheduledValues() {},
        cancelAndHoldAtTime() {},
        setTargetAtTime(v: number) {
          this.value = v;
        },
        setValueAtTime(v: number) {
          this.value = v;
        },
        linearRampToValueAtTime(v: number) {
          this.value = v;
        },
      };
      const node = {
        gain,
        connect() {
          return node;
        },
        disconnect() {},
      };
      gains.push(node);
      return node;
    },
    createBufferSource() {
      const s = {
        buffer: null,
        loop: false,
        starts: 0,
        stops: 0,
        connect() {
          return s;
        },
        disconnect() {},
        start() {
          this.starts++;
        },
        stop() {
          this.stops++;
        },
      };
      sources.push(s);
      return s;
    },
    async decodeAudioData() {
      decodes++;
      return { duration: 120 };
    },
    resume() {
      resumes++;
      context.state = "running";
      context.onstatechange?.();
      return Promise.resolve();
    },
    close() {
      context.state = "closed";
      return Promise.resolve();
    },
  };
  return {
    context,
    gains,
    sources,
    get resumes() {
      return resumes;
    },
    get decodes() {
      return decodes;
    },
  };
}
test("original music is ready before playing and reuses one native looping source", async () => {
  const h = harness();
  const audio = createAmbience(() => h.context);
  const prior = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Uint8Array([1, 2]));
  try {
    assert.equal(await audio.play(), true);
    assert.equal(h.decodes, 1, "must decode original soundtrack, not just rain");
    assert.equal(h.sources.length, 1);
    assert.equal(h.sources[0].loop, true);
    await audio.play();
    assert.equal(h.sources.length, 1);
    audio.locked(true);
    assert.ok(h.gains[0].gain.value < 0.1);
    audio.stop();
  } finally {
    globalThis.fetch = prior;
  }
});

test("obsolete rejected fetch cannot tear down a newer playback", async () => {
  const prior = globalThis.fetch;
  let rejectOld!: (reason: Error) => void;
  let calls = 0;
  globalThis.fetch = () =>
    ++calls === 1
      ? new Promise((_resolve, reject) => {
          rejectOld = reject;
        })
      : Promise.resolve(new Response(new Uint8Array([1])));
  const h = harness();
  const audio = createAmbience(() => h.context);
  try {
    const old = audio.play();
    audio.stop();
    await audio.play();
    assert.equal(audio.getStatus(), "playing");
    rejectOld(Error("obsolete aborted request"));
    await old;
    assert.equal(audio.getStatus(), "playing", "old rejection must not release current owner");
  } finally {
    audio.dispose();
    globalThis.fetch = prior;
  }
});

test("blocked unresolved resume is bounded and gesture retry synchronously resumes without decoding twice", async () => {
  const prior = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Uint8Array([1]));
  const h = harness();
  let resumeCalls = 0;
  h.context.resume = () => {
    resumeCalls++;
    return new Promise(() => {});
  };
  const audio = createAmbience(() => h.context);
  try {
    assert.equal(await audio.play(), false);
    assert.equal(audio.getStatus(), "suspended");
    assert.equal(h.sources.length, 1);
    h.context.resume = () => {
      resumeCalls++;
      h.context.state = "running";
      h.context.onstatechange?.();
      return Promise.resolve();
    };
    const result = audio.play();
    assert.equal(resumeCalls, 2, "resume must precede any await");
    assert.equal(await result, true);
    assert.equal(h.decodes, 1);
    h.context.state = "interrupted";
    h.context.onstatechange();
    assert.equal(audio.getStatus(), "suspended");
    assert.equal(await audio.play(), true);
  } finally {
    audio.dispose();
    globalThis.fetch = prior;
  }
});
test("failed asset/decode and disposal never report playing or revive stale work", async () => {
  const prior = globalThis.fetch;
  const h = harness();
  const audio = createAmbience(() => h.context);
  try {
    globalThis.fetch = async () => new Response("missing", { status: 404 });
    assert.equal(await audio.play(), false);
    assert.equal(audio.getStatus(), "unavailable");
    globalThis.fetch = async () => new Response(new Uint8Array([1]));
    h.context.decodeAudioData = async () => {
      throw Error("bad decode");
    };
    assert.equal(await audio.play(), false);
    assert.equal(audio.getStatus(), "unavailable");
    audio.dispose();
    assert.equal(await audio.play(), false);
    assert.equal(h.sources.length, 0);
  } finally {
    globalThis.fetch = prior;
  }
});
test("master mute and music/rain levels remain independent through locked attenuation", async () => {
  const prior = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Uint8Array([1]));
  const h = harness();
  const audio = createAmbience(() => h.context);
  try {
    await audio.play();
    audio.volume(0.5);
    assert.equal(h.gains[0].gain.value, 0.5);
    audio.rain(true, 0.2);
    const rain = h.gains[1];
    assert.equal(rain.gain.value, 0.2);
    audio.locked(true);
    assert.ok(Math.abs(h.gains[0].gain.value - 0.14) < 1e-9);
    assert.ok(Math.abs(rain.gain.value - 0.056) < 1e-9);
    audio.mute(true);
    assert.equal(h.gains[0].gain.value, 0);
    assert.equal(rain.gain.value, 0);
    audio.mute(false);
    audio.locked(false);
    assert.equal(h.gains[0].gain.value, 0.5);
    audio.rain(false);
    assert.equal(rain.gain.value, 0);
    assert.equal(h.sources.filter((s) => s.loop).length, 4);
  } finally {
    audio.dispose();
    globalThis.fetch = prior;
  }
});

test("dispose during decode closes owner immediately and late decoded audio cannot start", async () => {
  const prior = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Uint8Array([1]));
  const h = harness();
  let finish!: (buffer: any) => void;
  let decoding!: () => void;
  const started = new Promise<void>((resolve) => {
    decoding = resolve;
  });
  h.context.decodeAudioData = () => {
    decoding();
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const audio = createAmbience(() => h.context);
  try {
    const pending = audio.play();
    await started;
    audio.dispose();
    assert.equal(h.context.state, "closed");
    finish({ duration: 120 });
    assert.equal(await pending, false);
    assert.equal(h.sources.length, 0);
  } finally {
    globalThis.fetch = prior;
  }
});
