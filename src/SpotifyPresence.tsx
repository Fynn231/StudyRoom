import { useEffect, useRef, useState } from "react";
import { useAuthFetch } from "./auth.js";
import type { ListeningTrack } from "./protocol.js";
export function ListeningCard({ track }: { track: ListeningTrack }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  if (now - track.observedAt > 90000)
    return <p className="quiet-note">Listening status expired.</p>;
  const position = Math.min(
    track.durationMs,
    track.positionMs +
      (track.playing ? Math.max(0, now - track.observedAt) : 0),
  );
  const clock = (ms: number) =>
    `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
  return (
    <aside className="listening-card" aria-label="Spotify listening activity">
      <p className="eyebrow">
        {track.playing ? "LISTENING TO SPOTIFY" : "SPOTIFY PAUSED"}
      </p>
      {track.coverUrl && (
        <img
          className="track-cover"
          src={track.coverUrl}
          alt="Spotify album artwork"
          referrerPolicy="no-referrer"
        />
      )}
      <h4>{track.title}</h4>
      <p>{track.artist}</p>
      <progress
        aria-label="Song progress"
        max={track.durationMs}
        value={position}
      />
      <p>
        {clock(position)} / {clock(track.durationMs)}
      </p>
      <a href={track.url} target="_blank" rel="noopener noreferrer">
        Open track on Spotify
      </a>
      <p className="quiet-note">
        Spotify-reported activity · not audio from this page.
      </p>
    </aside>
  );
}
export function SpotifyPresence({
  target,
}: {
  target?: { roomCode: string; participantId: string };
}) {
  const request = useAuthFetch(),
    alive = useRef(true);
  const [track, setTrack] = useState<ListeningTrack | null>(null),
    [link, setLink] = useState(""),
    [message, setMessage] = useState(
      "Connect listening status to show the song playing in your Spotify app. This does not turn this browser into a Spotify player.",
    ),
    [sharing, setSharing] = useState(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function connect() {
    try {
      const r = await request("/api/music/spotify/begin?purpose=listening", {
        method: "POST",
      });
      if (!r.ok) throw Error();
      const v = await r.json(),
        url = new URL(v.url);
      if (
        url.origin !== "https://accounts.spotify.com" ||
        url.pathname !== "/authorize"
      )
        throw Error();
      setLink(url.href);
      setMessage(
        "Continue in Spotify to allow current-track access, then return and refresh your status.",
      );
    } catch {
      setMessage(
        "Listening connection is unavailable. A registered Spotify app is required; the operator must configure SPOTIFY_CLIENT_ID and the hosted callback.",
      );
    }
  }
  async function disconnect() {
    setSharing(false);
    setTrack(null);
    setLink("");
    try {
      const response = await request("/api/music/disconnect", {
        method: "POST",
      });
      if (!response.ok) throw Error();
      window.dispatchEvent(new Event("studyroom:spotify-disconnected"));
      setMessage(
        "Spotify disconnected from Study Room. Provider consent can be revoked separately in Spotify settings.",
      );
    } catch {
      setMessage(
        "Stopped sharing locally; disconnect was not confirmed. Previously shared activity expires within 90 seconds.",
      );
    }
  }
  useEffect(() => {
    const clear = () => {
      setSharing(false);
      setTrack(null);
      setLink("");
    };
    window.addEventListener("studyroom:spotify-disconnected", clear);
    return () =>
      window.removeEventListener("studyroom:spotify-disconnected", clear);
  }, []);
  async function refresh(share = false) {
    try {
      const r = await request(
        share
          ? "/api/music/spotify/share-listening"
          : "/api/music/spotify/listening",
        share
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(target),
            }
          : { cache: "no-store" },
      );
      if (!r.ok) throw Error(String(r.status));
      const value = await r.json();
      if (!alive.current) return;
      setTrack(value.track);
      if (share) setSharing(true);
      setMessage(
        value.track
          ? "Spotify status updated."
          : "Spotify is connected but reports no current track.",
      );
    } catch {
      if (alive.current) {
        setTrack(null);
        setSharing(false);
        setMessage(
          "Listening status unavailable or expired. Reconnect, grant current-track access, and check Spotify playback.",
        );
      }
    }
  }
  useEffect(() => {
    if (!sharing || !target) return;
    const tick = setInterval(() => {
      if (!document.hidden) void refresh(true);
    }, 30000);
    return () => clearInterval(tick);
  }, [sharing, target?.roomCode, target?.participantId, request]);
  async function stopSharing() {
    setSharing(false);
    try {
      await request("/api/music/spotify/hide-listening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
    } catch {}
    setMessage(
      "Listening sharing stopped locally. Any previously shared card expires within 90 seconds.",
    );
  }
  useEffect(() => {
    setSharing(false);
  }, [target?.roomCode, target?.participantId]);
  return (
    <section className="spotify-presence">
      <h3>Spotify connection</h3>
      <p className="quiet-note">
        A Discord-style listening card, separate from in-page playback. Only the
        current track, artist and progress are read. Sharing is off until you
        choose it for your room; cards expire if updates stop.
      </p>
      <button onClick={() => void connect()}>
        Connect Spotify listening status
      </button>
      {link && (
        <a
          className="launch-link"
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
        >
          Continue listening connection in Spotify
        </a>
      )}
      <button onClick={() => void refresh()}>Refresh listening status</button>
      <button onClick={() => void disconnect()}>
        Disconnect Spotify connection
      </button>
      {target && (
        <button
          aria-pressed={sharing}
          onClick={() => {
            if (sharing) void stopSharing();
            else {
              void refresh(true);
            }
          }}
        >
          {sharing
            ? "Stop sharing Spotify with room"
            : "Share Spotify status with room"}
        </button>
      )}
      <p role="status">{message}</p>
      {track && <ListeningCard track={track} />}
    </section>
  );
}
