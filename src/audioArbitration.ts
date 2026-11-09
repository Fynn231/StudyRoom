// Local owner signals only. Never feed peer listening cards into this arbiter.
// Unknown reports preserve an active guard until a verified pause or teardown.
const playing = new Set<symbol>();
const selections = new Set<symbol>();
const listeners = new Set<() => void>();
export const roomAudioBlocked = () => playing.size > 0 || selections.size > 0;
// This is a deliberate source choice, NOT detected iframe playback.
export function holdSelectedProvider() {
  const id = Symbol("selected provider embed");
  selections.add(id);
  stopRoomAudioForSelection();
  return () => {
    selections.delete(id);
    stopRoomAudioForSelection();
  };
}
export function subscribeRoomAudioStop(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function stopRoomAudioForSelection() {
  for (const listener of listeners) listener();
}
export function createOwnerPlaybackSignal() {
  const id = Symbol("owner Spotify playback");
  let disposed = false;
  let observation: "playing" | "paused" | "unknown" = "unknown";
  return {
    report(state: "playing" | "paused" | "unknown") {
      if (disposed) return;
      observation = state;
      if (state === "unknown") return;
      if (state === "playing") {
        playing.add(id);
        stopRoomAudioForSelection();
      } else {
        playing.delete(id);
        stopRoomAudioForSelection();
      }
    },
    isUncertain() {
      return !disposed && observation === "unknown" && playing.has(id);
    },
    recoverUnknown() {
      // Only this observation owner can be released; SDK and selected-provider
      // guards remain independent. This never starts room audio.
      if (disposed || observation !== "unknown" || !playing.has(id)) return false;
      playing.delete(id);
      stopRoomAudioForSelection();
      return true;
    },
    dispose() {
      disposed = true;
      playing.delete(id);
      stopRoomAudioForSelection();
    },
  };
}
