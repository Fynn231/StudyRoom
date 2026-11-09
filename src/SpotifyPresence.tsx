import { createOwnerPlaybackSignal } from "./audioArbitration.js";
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
    track.positionMs + (track.playing ? Math.max(0, now - track.observedAt) : 0),
  );
  const clock = (ms: number) =>
    `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
  return (
    <aside className="listening-card" aria-label="Spotify listening activity">
      <p className="eyebrow">{track.playing ? "LISTENING TO SPOTIFY" : "SPOTIFY PAUSED"}</p>
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
      <progress aria-label="Song progress" max={track.durationMs} value={position} />
      <p>
        {clock(position)} / {clock(track.durationMs)}
      </p>
      <a href={track.url} target="_blank" rel="noopener noreferrer">
        Open track on Spotify
      </a>
      <p className="quiet-note">Spotify-reported activity · not audio from this page.</p>
    </aside>
  );
}
export function SpotifyPresence({
  target,
}: {
  target?: { roomCode: string; participantId: string };
}) {
  const request = useAuthFetch(),
    alive = useRef(true),
    connectionGeneration = useRef(0),
    refreshSequence = useRef(0),
    sharingConsent = useRef<{ id: string; roomCode: string; participantId: string } | null>(null),
    pendingRequest = useRef<AbortController | null>(null),
    pendingConsent = useRef<Window | null>(null);
  const playback = useRef<ReturnType<typeof createOwnerPlaybackSignal> | null>(null);
  const [monitoring, setMonitoring] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [track, setTrack] = useState<ListeningTrack | null>(null),
    [link, setLink] = useState(""),
    [message, setMessage] = useState(
      "Connect listening status to show the song playing in your Spotify app. This does not turn this browser into a Spotify player.",
    ),
    [sharing, setSharing] = useState(false);
  function hideConsent(consent: { id: string; roomCode: string; participantId: string }) {
    return request("/api/music/spotify/hide-listening", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomCode: consent.roomCode,
        participantId: consent.participantId,
        consentId: consent.id,
      }),
    }).catch(() => undefined);
  }
  function cancelConnect() {
    connectionGeneration.current++;
    const previousConsent = sharingConsent.current;
    sharingConsent.current = null;
    setSharing(false);
    if (previousConsent) void hideConsent(previousConsent);
    // Lost observation is not a pause. Offer a separate informed recovery action.
    playback.current?.report("unknown");
    setUncertain(playback.current?.isUncertain() ?? false);
    setMonitoring(false);
    pendingRequest.current?.abort();
    pendingRequest.current = null;
    try {
      pendingConsent.current?.close();
    } catch {}
    pendingConsent.current = null;
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancelConnect();
      playback.current?.dispose();
      playback.current = null;
    };
  }, []);
  async function connect() {
    cancelConnect();
    const run = connectionGeneration.current;
    const current = () => alive.current && run === connectionGeneration.current;
    const controller = new AbortController();
    pendingRequest.current = controller;
    // Open during the user's click; waiting for the API first can lose the gesture.
    let consent: Window | null = null;
    try {
      consent = window.open("about:blank", "_blank");
      if (consent) consent.opener = null;
      pendingConsent.current = consent;
    } catch {}
    setLink("");
    try {
      const r = await request("/api/music/spotify/begin?purpose=listening", {
        method: "POST",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
      });
      if (!r.ok) throw Error();
      const v = await r.json(),
        url = new URL(v.url);
      if (url.origin !== "https://accounts.spotify.com" || url.pathname !== "/authorize")
        throw Error();
      if (!current()) {
        consent?.close();
        return;
      }
      setMonitoring(true);
      if (consent && !consent.closed) {
        consent.location.replace(url.href);
        if (pendingConsent.current === consent) pendingConsent.current = null;
        setMessage(
          "Finish connecting in Spotify, then return here. Your timer and drafts stay here.",
        );
      } else {
        setLink(url.href);
        setMessage(
          "Your browser blocked the new tab. Use Continue in Spotify. Your timer and drafts stay here.",
        );
      }
    } catch {
      consent?.close();
      if (current())
        setMessage(
          "Listening connection is unavailable. A registered Spotify app is required; the operator must configure SPOTIFY_CLIENT_ID and the hosted callback.",
        );
    } finally {
      if (pendingRequest.current === controller) pendingRequest.current = null;
      if (pendingConsent.current === consent) pendingConsent.current = null;
    }
  }
  async function disconnect() {
    cancelConnect();
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
      cancelConnect();
      setSharing(false);
      setTrack(null);
      setLink("");
    };
    window.addEventListener("studyroom:spotify-disconnected", clear);
    return () => window.removeEventListener("studyroom:spotify-disconnected", clear);
  }, []);
  async function refresh(share = false, start = false) {
    const consent = sharingConsent.current;
    if (
      share &&
      (!consent ||
        consent.roomCode !== target?.roomCode ||
        consent.participantId !== target?.participantId)
    )
      return;
    const run = connectionGeneration.current;
    const sequence = ++refreshSequence.current;
    const current = () =>
      alive.current &&
      run === connectionGeneration.current &&
      sequence === refreshSequence.current &&
      (!share || sharingConsent.current === consent);
    try {
      const r = await request(
        share ? "/api/music/spotify/share-listening" : "/api/music/spotify/listening",
        share
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                roomCode: consent!.roomCode,
                participantId: consent!.participantId,
                consentId: consent!.id,
                start,
              }),
            }
          : { cache: "no-store" },
      );
      if (!r.ok) throw Error(String(r.status));
      const value = await r.json();
      if (!current()) return;
      const item = value.track;
      if (!playback.current) playback.current = createOwnerPlaybackSignal();
      const fresh =
        item &&
        Number.isFinite(item.observedAt) &&
        Date.now() - item.observedAt >= -5000 &&
        Date.now() - item.observedAt < 90000;
      playback.current.report(
        fresh && typeof item.playing === "boolean"
          ? item.playing
            ? "playing"
            : "paused"
          : "unknown",
      );
      setUncertain(playback.current.isUncertain());
      setMonitoring(true);
      setTrack(value.track);
      if (share) setSharing(true);
      setMessage(
        value.track
          ? "Spotify status updated."
          : "Spotify is connected but reports no current track.",
      );
    } catch {
      if (current()) {
        playback.current?.report("unknown");
        setUncertain(playback.current?.isUncertain() ?? false);
        setTrack(null);
        // Failed observation does not revoke explicit room-sharing consent.
        setMessage(
          "Listening status unavailable or expired. Reconnect, grant current-track access, and check Spotify playback.",
        );
      }
    }
  }
  useEffect(() => {
    if (!monitoring) return;
    // Room audio can continue while this tab is hidden; do not suspend owner
    // observation just because the user switched to their Spotify tab/app.
    // Browser timer throttling still means this is sampled status, not instant detection.
    const refreshOwner = () => {
      void refresh();
    };
    const tick = setInterval(refreshOwner, 15000);
    window.addEventListener("focus", refreshOwner);
    document.addEventListener("visibilitychange", refreshOwner);
    return () => {
      clearInterval(tick);
      window.removeEventListener("focus", refreshOwner);
      document.removeEventListener("visibilitychange", refreshOwner);
    };
  }, [monitoring, request]);
  useEffect(() => {
    if (!sharing || !target) return;
    const tick = setInterval(() => {
      if (!document.hidden) void refresh(true);
    }, 30000);
    return () => clearInterval(tick);
  }, [sharing, target?.roomCode, target?.participantId, request]);
  async function stopSharing() {
    const run = connectionGeneration.current;
    const previousConsent = sharingConsent.current;
    sharingConsent.current = null;
    setSharing(false);
    if (previousConsent) await hideConsent(previousConsent);
    if (!alive.current || run !== connectionGeneration.current || sharingConsent.current) return;
    setMessage(
      "Listening sharing stopped locally. Any previously shared card expires within 90 seconds.",
    );
  }
  useEffect(() => {
    sharingConsent.current = null;
    setSharing(false);
    const previous = target;
    return () => {
      const previousConsent = sharingConsent.current;
      sharingConsent.current = null;
      if (previous && previousConsent) void hideConsent(previousConsent);
    };
  }, [target?.roomCode, target?.participantId, request]);
  return (
    <section className="spotify-presence">
      <h3>Spotify connection</h3>
      <p className="quiet-note">
        A Discord-style listening card, separate from in-page playback. Only the current track,
        artist and progress are read. Sharing is off until you choose it for your room; cards expire
        if updates stop.
      </p>
      <button onClick={() => void connect()}>Connect Spotify listening status</button>
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
      <button onClick={() => void disconnect()}>Disconnect Spotify connection</button>
      {target && (
        <button
          aria-pressed={sharing}
          onClick={() => {
            if (sharing) void stopSharing();
            else {
              sharingConsent.current = { ...target, id: crypto.randomUUID() };
              setSharing(true);
              void refresh(true, true);
            }
          }}
        >
          {sharing ? "Stop sharing Spotify with room" : "Share Spotify status with room"}
        </button>
      )}
      {uncertain && (
        <aside>
          <p>
            Spotify listening status is uncertain, not confirmed paused. Pause Spotify in its app
            first. Then release only this uncertain listening-status guard; other active players
            still block room audio. Nothing starts automatically — press Play room audio afterward.
          </p>
          <button
            onClick={() => {
              refreshSequence.current++;
              if (playback.current?.recoverUnknown()) setUncertain(false);
            }}
          >
            I paused Spotify — release uncertain status
          </button>
        </aside>
      )}
      <p role="status">{message}</p>
      {track && <ListeningCard track={track} />}
    </section>
  );
}
