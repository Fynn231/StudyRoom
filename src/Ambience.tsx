import { roomAudioMessage, type RoomAmbience } from "./useRoomAmbience.js";
import { ORIGINAL_SOUNDTRACK_TITLE } from "./ambienceAudio.js";
export function WelcomeSound({ room }: { room: RoomAmbience }) {
  return (
    <div className="welcome-sound">
      <button aria-pressed={room.preference.muted} onClick={room.toggleMute}>
        {room.preference.muted ? "Unmute room audio" : "Mute room audio"}
      </button>
      <p role="status" className="quiet-note">
        {roomAudioMessage(room.status, room.preference)}
      </p>
    </div>
  );
}
export function Ambience({ room, onWelcome }: { room: RoomAmbience; onWelcome: () => void }) {
  const { preference } = room;
  return (
    <details className="ambience-panel">
      <summary>Room ambience</summary>
      <p className="eyebrow">ORIGINAL STUDY ROOM SOUNDTRACK</p>
      <h3>{ORIGINAL_SOUNDTRACK_TITLE}</h3>
      <p>
        An original orchestral study loop with strings, flute, oboe and piano; optional Beneath the
        Rain ambience.
      </p>
      <p className="quiet-note">
        Separate from Spotify and Apple Music. LOCKED IN gently lowers room audio without restarting
        it.
      </p>
      <div className="ambience-actions">
        <button onClick={room.play} disabled={room.status === "playing" && !preference.stopped}>
          Play room audio
        </button>
        <button onClick={room.stop} disabled={preference.stopped}>
          Stop room audio
        </button>
        <button aria-pressed={preference.muted} onClick={room.toggleMute}>
          {preference.muted ? "Unmute room audio" : "Mute room audio"}
        </button>
      </div>
      <label>
        Music volume
        <input
          type="range"
          min="0"
          max="1"
          step=".01"
          value={preference.volume}
          onChange={(e) => room.change({ volume: Number(e.target.value) })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={preference.rain}
          onChange={(e) => room.change({ rain: e.target.checked })}
        />
        Optional rain
      </label>
      <label>
        Rain volume
        <input
          type="range"
          min="0"
          max="1"
          step=".01"
          value={preference.rainVolume}
          onChange={(e) => room.change({ rainVolume: Number(e.target.value) })}
        />
      </label>
      <p role="status" className="quiet-note">
        {roomAudioMessage(room.status, preference)}
      </p>
      {room.storageError && (
        <p role="status">Applied for this visit; device storage is unavailable.</p>
      )}
      <button onClick={onWelcome}>Show welcome again</button>
    </details>
  );
}
