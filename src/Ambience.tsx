import { useEffect, useRef, useState } from "react";
import { createAmbience } from "./ambienceAudio.js";
import { usePrivateStorage } from "./privateStorage.js";
export function Ambience({ locked, onWelcome }: { locked: boolean; onWelcome: () => void }) {
  const storage = usePrivateStorage();
  const [preference, setPreference] = useState(() => {
    try {
      const value = JSON.parse(storage.getItem("studyroom.ambience.v1") ?? "null");
      if (
        value &&
        typeof value.volume === "number" &&
        Number.isFinite(value.volume) &&
        value.volume >= 0 &&
        value.volume <= 1 &&
        typeof value.muted === "boolean"
      )
        return { volume: value.volume, muted: value.muted };
    } catch {}
    return { volume: 0.4, muted: false };
  });
  const [playing, setPlaying] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("Silent until you press Play.");
  const audio = useRef<ReturnType<typeof createAmbience> | null>(null),
    alive = useRef(true),
    run = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      run.current++;
      audio.current?.stop();
      audio.current = null;
    };
  }, []);
  useEffect(() => {
    audio.current?.locked(locked);
  }, [locked]);
  function save(next: typeof preference) {
    setPreference(next);
    audio.current?.volume(next.volume);
    audio.current?.mute(next.muted);
    try {
      storage.setItem("studyroom.ambience.v1", JSON.stringify(next));
      setMessage("Volume and mute saved on this device. Playback never starts automatically.");
    } catch {
      setMessage("Setting applied for this visit; device storage is unavailable.");
    }
  }
  async function play() {
    const current = ++run.current;
    setBusy(true);
    const next = audio.current ?? createAmbience();
    audio.current = next;
    next.volume(preference.volume);
    next.mute(preference.muted);
    next.locked(locked);
    const ok = await next.play();
    if (!alive.current || current !== run.current) return;
    setBusy(false);
    setPlaying(ok);
    setMessage(
      ok
        ? "Beneath the Rain is playing."
        : "Audio could not start. Check browser audio permissions and try Play again.",
    );
  }
  function stop() {
    run.current++;
    audio.current?.stop();
    audio.current = null;
    setPlaying(false);
    setBusy(false);
    setMessage("Ambience stopped. Your music player is unchanged.");
  }
  return (
    <details className="ambience-panel">
      <summary>Room ambience</summary>
      <p className="eyebrow">ORIGINAL STUDY ROOM SOUNDSCAPE</p>
      <h3>Beneath the Rain</h3>
      <p>
        Soft rainfall, submerged ocean resonance and slow atmospheric movement. An original
        three-minute evolving synthesis, without melody or sudden sounds.
      </p>
      <p className="quiet-note">
        Separate from Spotify and Apple Music. You can listen to either, both, or neither. LOCKED IN
        gently lowers this ambience; returning restores its level only while it is playing.
      </p>
      <div className="ambience-actions">
        <button disabled={playing || busy} onClick={() => void play()}>
          {busy ? "Starting ambience…" : "Play room ambience"}
        </button>
        <button disabled={!playing && !busy} onClick={stop}>
          Stop room ambience
        </button>
        <button
          aria-pressed={preference.muted}
          onClick={() => save({ ...preference, muted: !preference.muted })}
        >
          {preference.muted ? "Unmute room ambience" : "Mute room ambience"}
        </button>
      </div>
      <label>
        Ambience volume
        <input
          type="range"
          min="0"
          max="1"
          step=".01"
          value={preference.volume}
          onChange={(e) => save({ ...preference, volume: Number(e.target.value) })}
        />
      </label>
      <p role="status" className="quiet-note">
        {message}
      </p>
      <button onClick={onWelcome}>Show welcome again</button>
    </details>
  );
}
