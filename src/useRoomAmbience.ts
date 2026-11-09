import { roomAudioBlocked, subscribeRoomAudioStop } from "./audioArbitration.js";
import { useEffect, useRef, useState } from "react";
import { createAmbience, ORIGINAL_SOUNDTRACK_TITLE, type AudioStatus } from "./ambienceAudio.js";
import { usePrivateStorage } from "./privateStorage.js";
export type RoomAudioPreference = {
  volume: number;
  muted: boolean;
  stopped: boolean;
  rain: boolean;
  rainVolume: number;
};
const KEY = "studyroom.ambience.v2";
const level = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : fallback;
export function readRoomAudioPreference(storage: Pick<Storage, "getItem">): RoomAudioPreference {
  const defaults = { volume: 0.3, muted: false, stopped: false, rain: false, rainVolume: 0.4 };
  try {
    const raw = storage.getItem(KEY),
      value = JSON.parse(raw ?? storage.getItem("studyroom.ambience.v1") ?? "null");
    if (!value || typeof value !== "object") return defaults;
    return {
      volume: level(value.volume, defaults.volume),
      muted: value.muted === true,
      stopped: raw !== null && value.stopped === true,
      rain: raw !== null && value.rain === true,
      rainVolume: level(value.rainVolume, defaults.rainVolume),
    };
  } catch {
    return defaults;
  }
}
export function useRoomAmbience(locked: boolean) {
  const storage = usePrivateStorage();
  const [preference, setPreference] = useState(() => readRoomAudioPreference(storage));
  const preferenceRef = useRef(preference);
  const [status, setStatus] = useState<AudioStatus>("idle");
  const [blocked, setBlocked] = useState(roomAudioBlocked);
  const [storageError, setStorageError] = useState(false);
  const audio = useRef<ReturnType<typeof createAmbience> | null>(null);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  function getAudio() {
    if (!audio.current) {
      const controller = createAmbience();
      controller.subscribe(() => setStatus(controller.getStatus()));
      audio.current = controller;
    }
    return audio.current;
  }
  function apply(next: RoomAudioPreference) {
    const controller = getAudio();
    controller.volume(next.volume);
    controller.mute(next.muted);
    controller.rain(next.rain, next.rainVolume);
    controller.locked(lockedRef.current);
    return controller;
  }
  function save(next: RoomAudioPreference) {
    preferenceRef.current = next;
    setPreference(next);
    apply(next);
    try {
      storage.setItem(KEY, JSON.stringify(next));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }
  // Called synchronously by Continue and trusted interaction; never awaited by entry/timer.
  function prepare() {
    if (roomAudioBlocked()) return;
    const next = preferenceRef.current;
    if (!next.stopped && !next.muted && (next.volume > 0 || (next.rain && next.rainVolume > 0))) {
      const controller = apply(next);
      const status = controller.getStatus();
      // A failed asset/unsupported device needs explicit Play, not a new fetch
      // and synchronous layout change on every unrelated pointer or key press.
      if (status !== "playing" && status !== "unavailable") void controller.play();
    }
  }
  useEffect(() => {
    apply(preferenceRef.current);
    const suppress = () => {
      setBlocked(roomAudioBlocked());
      if (!roomAudioBlocked()) return;
      // Dispose closes both soundtrack and rain immediately, including in-flight loads.
      save({ ...preferenceRef.current, stopped: true });
      audio.current?.dispose();
      audio.current = null;
      setStatus("idle");
    };
    const unsubscribe = subscribeRoomAudioStop(suppress);
    if (roomAudioBlocked()) suppress();
    prepare();
    const gesture = (event: Event) => {
      if (event.isTrusted) prepare();
    };
    document.addEventListener("pointerdown", gesture, { capture: true });
    document.addEventListener("keydown", gesture, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", gesture, { capture: true });
      document.removeEventListener("keydown", gesture, { capture: true });
      unsubscribe();
      audio.current?.dispose();
      audio.current = null;
    };
  }, []);
  useEffect(() => {
    audio.current?.locked(locked);
  }, [locked]);
  return {
    preference,
    status,
    storageError,
    blocked,
    prepare,
    change(next: Partial<RoomAudioPreference>) {
      save({ ...preferenceRef.current, ...next });
      prepare();
    },
    toggleMute() {
      const next = { ...preferenceRef.current, muted: !preferenceRef.current.muted };
      save(next);
      if (!next.muted) prepare();
    },
    play() {
      if (roomAudioBlocked()) return;
      const next = { ...preferenceRef.current, stopped: false };
      save(next);
      if (!next.muted) void apply(next).play();
    },
    stop() {
      save({ ...preferenceRef.current, stopped: true });
      audio.current?.stop();
    },
  };
}
export type RoomAmbience = ReturnType<typeof useRoomAmbience>;
export function roomAudioMessage(
  status: AudioStatus,
  preference: RoomAudioPreference,
  blocked = false,
) {
  if (blocked)
    return "Room audio stopped to avoid overlap. Pause Spotify or unload the selected provider, then press Play room audio. For listening status, refresh after pausing; reconnect first if disconnected. Playback is not automatically resumed.";
  if (preference.stopped) return "Room audio stopped. Press Play to start again.";
  if (preference.muted) return "Room audio muted.";
  if (status === "playing") return `${ORIGINAL_SOUNDTRACK_TITLE} is playing.`;
  if (status === "loading") return "Preparing original soundtrack…";
  if (status === "unavailable")
    return "Original soundtrack unavailable. Try Play again; your timer is unaffected.";
  return "Sound is paused by your browser. Continue or press Play to try again.";
}
