import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
test("original three-minute synthesis renders without clipping and repeats seamlessly after warmup", async ({
  page,
}, info) => {
  const source = stripTypeScriptTypes(
    readFileSync(
      new URL("../../src/ambienceAudio.ts", import.meta.url),
      "utf8",
    ),
  );
  await page.route("**/__test_ambience.js", (r) =>
    r.fulfill({ contentType: "text/javascript", body: source }),
  );
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const modulePath: string = "/__test_ambience.js";
    const { createAmbienceGraph } = await import(modulePath);
    const rate = 22050;
    const context = new OfflineAudioContext(1, Math.round(204.1 * rate), rate);
    const graph = createAmbienceGraph(context);
    graph.master.gain.value = 0.4;
    const rendered = await context.startRendering();
    const data = rendered.getChannelData(0),
      start = 24 * rate,
      length = 180 * rate;
    let square = 0,
      peak = 0,
      seam = 0;
    const pcm = new Uint8Array(length * 2),
      view = new DataView(pcm.buffer);
    for (let i = 0; i < length; i++) {
      const value = data[start + i];
      square += value * value;
      peak = Math.max(peak, Math.abs(value));
      view.setInt16(
        i * 2,
        Math.round(Math.max(-1, Math.min(1, value)) * 32767),
        true,
      );
    }
    for (let i = 0; i < Math.floor(rate * 0.09); i++)
      seam = Math.max(
        seam,
        Math.abs(data[start + i] - data[start + length + i]),
      );
    let encoded = "";
    for (let i = 0; i < pcm.length; i += 32768)
      encoded += String.fromCharCode(...pcm.subarray(i, i + 32768));
    return {
      rms: Math.sqrt(square / length),
      peak,
      periodicDifference: seam,
      pcm: btoa(encoded),
    };
  });
  expect(result.rms).toBeGreaterThan(0.005);
  expect(result.peak).toBeLessThan(0.7);
  expect(result.periodicDifference).toBeLessThan(0.001);
  const pcm = Buffer.from(result.pcm, "base64"),
    header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(pcm.length + 36, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(22050, 24);
  header.writeUInt32LE(44100, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  writeFileSync(
    info.outputPath("beneath-the-rain-original.wav"),
    Buffer.concat([header, pcm]),
  );
  writeFileSync(
    info.outputPath("audio-analysis.json"),
    JSON.stringify(
      {
        durationSeconds: 180,
        sampleRate: 22050,
        rms: result.rms,
        peak: result.peak,
        periodicDifference: result.periodicDifference,
        externalRecordings: false,
      },
      null,
      2,
    ),
  );
});
