import { createOwnerPlaybackSignal } from "./audioArbitration.js";
import { useAuthFetch } from "./auth.js";
import { useEffect, useRef, useState } from "react";
type Readiness = {
  spotify: {
    ready: boolean;
    authorized: boolean;
    canPlay?: boolean;
    canListen?: boolean;
    blocker: string | null;
  };
  apple: { ready: false; blocker: string };
};
type Player = {
  addListener: (name: string, callback: (event: any) => void) => boolean;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  pause: () => Promise<void>;
  togglePlay: () => Promise<void>;
  activateElement: () => Promise<void>;
  seek?: (position: number) => Promise<void>;
  setVolume?: (volume: number) => Promise<void>;
};
type SpotifySDK = {
  Player: new (options: {
    name: string;
    volume: number;
    getOAuthToken: (callback: (token: string) => void) => void;
  }) => Player;
};
declare global {
  interface Window {
    Spotify?: SpotifySDK;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}
let sdkLoad: Promise<SpotifySDK> | undefined;
function loadSDK(): Promise<SpotifySDK> {
  if (window.Spotify) return Promise.resolve(window.Spotify);
  if (sdkLoad) return sdkLoad;
  sdkLoad = new Promise<SpotifySDK>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      window.onSpotifyWebPlaybackSDKReady = undefined;
      sdkLoad = undefined;
      reject(Error("SDK unavailable"));
    };
    const timer = setTimeout(fail, 15_000);
    window.onSpotifyWebPlaybackSDKReady = () => {
      clearTimeout(timer);
      if (window.Spotify) resolve(window.Spotify);
      else fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return sdkLoad;
}
export function ConnectedMusic({
  provider,
  selection,
  onEnable,
  onDisable,
  embeddedActive,
  expanded = false,
}: {
  provider: "spotify" | "apple";
  selection: string | null;
  onEnable: () => void;
  onDisable?: () => void;
  embeddedActive: boolean;
  expanded?: boolean;
}) {
  const authFetch = useAuthFetch();
  const panel = useRef<HTMLDetailsElement>(null);
  const [panelOpen, setPanelOpen] = useState(expanded);
  useEffect(() => {
    if (expanded && panel.current) panel.current.open = true;
  }, [expanded]);
  const [track, setTrack] = useState<{
    name: string;
    artist: string;
    position: number;
    duration: number;
    paused: boolean;
    observed: number;
  } | null>(null);
  const playingSelection = useRef<string | null>(null);
  const latestSelection = useRef(selection);
  latestSelection.current = selection;
  const [volume, setVolume] = useState(0.5);
  const [, tick] = useState(0);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [message, setMessage] = useState(
    "Account playback is optional. Official embeds do not require this setup.",
  );
  const [device, setDevice] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!track || track.paused || !enabled) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [track, enabled]);
  const [connectionUrl, setConnectionUrl] = useState<string | null>(null);
  const [authorizing, setAuthorizing] = useState(false);
  const player = useRef<Player | null>(null);
  const expiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generation = useRef(0);
  const alive = useRef(true);
  const playback = useRef<ReturnType<typeof createOwnerPlaybackSignal> | null>(null);
  function teardown() {
    playback.current?.dispose();
    playback.current = null;
    onDisable?.();
    generation.current++;
    clearTimeout(expiry.current);
    const old = player.current;
    player.current = null;
    if (old) {
      void old.pause().catch(() => {});
      old.disconnect();
    }
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      teardown();
    };
  }, []);
  useEffect(() => {
    if (embeddedActive) {
      teardown();
      setDevice(null);
      setEnabled(false);
      setMessage("Official embed selected. Connected Spotify device unloaded.");
    }
  }, [embeddedActive]);
  useEffect(() => {
    if (!connectionUrl) return;
    const timer = setTimeout(() => {
      setConnectionUrl(null);
      setMessage(
        "Connection link expired. Check account setup or connect again; your study session is unchanged.",
      );
    }, 300_000);
    return () => clearTimeout(timer);
  }, [connectionUrl]);
  useEffect(() => {
    const clear = () => {
      teardown();
      setDevice(null);
      setEnabled(false);
      setTrack(null);
      setReadiness((v) => (v ? { ...v, spotify: { ...v.spotify, authorized: false } } : v));
    };
    window.addEventListener("studyroom:spotify-disconnected", clear);
    return () => window.removeEventListener("studyroom:spotify-disconnected", clear);
  }, []);
  async function check() {
    try {
      const response = await authFetch("/api/music/status", {
        cache: "no-store",
      });
      if (!response.ok) throw Error();
      const value = await response.json();
      if (
        !value ||
        typeof value.spotify?.ready !== "boolean" ||
        typeof value.spotify?.authorized !== "boolean" ||
        (value.spotify.blocker !== null && typeof value.spotify.blocker !== "string") ||
        value.apple?.ready !== false ||
        typeof value.apple?.blocker !== "string"
      )
        throw Error("Invalid connection status");
      if (alive.current) {
        setReadiness(value);
        if (value.spotify?.authorized) setConnectionUrl(null);
        setMessage((previous) =>
          value.spotify?.authorized
            ? player.current
              ? previous
              : "Spotify connected. Press Play when you’re ready."
            : "Connect Spotify to play here, or use a playlist link below.",
        );
      }
    } catch {
      if (alive.current) setMessage("Account setup is unavailable. Official embeds still work.");
    }
  }
  useEffect(() => {
    if (!panelOpen) return;
    const refresh = () => {
      if (panel.current?.open) void check();
    };
    const visible = () => {
      if (!document.hidden) refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [authFetch, panelOpen]);
  async function authorize() {
    // Open from the actual click so mobile popup rules do not add a second step.
    let consent: Window | null = null;
    try {
      consent = window.open("about:blank", "_blank");
      if (consent) consent.opener = null;
    } catch {}
    teardown();
    const run = generation.current;
    setDevice(null);
    setEnabled(false);
    setTrack(null);
    setConnectionUrl(null);
    setAuthorizing(true);
    try {
      const response = await authFetch("/api/music/spotify/begin", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: { "Content-Type": "application/json" },
      });
      const value = await response.json();
      if (!response.ok) throw Error();
      const url = new URL(value.url);
      if (url.origin !== "https://accounts.spotify.com" || url.pathname !== "/authorize")
        throw Error();
      if (!alive.current || run !== generation.current) {
        consent?.close();
        return;
      }
      if (consent && !consent.closed) {
        consent.location.replace(url.href);
        setMessage(
          "Finish connecting in Spotify, then return here. Your timer and drafts stay here.",
        );
      } else {
        setConnectionUrl(url.href);
        setMessage(
          "Your browser blocked the new tab. Use Continue in Spotify. Your timer and drafts stay here.",
        );
      }
    } catch {
      consent?.close();
      if (alive.current && run === generation.current)
        setMessage("Could not connect Spotify. Try again or use a playlist link.");
    } finally {
      if (alive.current && run === generation.current) setAuthorizing(false);
    }
  }
  async function enable() {
    teardown();
    const requestedSelection = selection;
    const run = generation.current;
    setTrack(null);
    setEnabled(true);
    setDevice(null);
    onEnable();
    setMessage("Loading Spotify SDK. Playback has not started.");
    const current = () => alive.current && run === generation.current;
    const fail = (text: string) => {
      if (!current()) return;
      teardown();
      setDevice(null);
      setEnabled(false);
      setMessage(text);
    };
    try {
      const SDK = await loadSDK();
      if (!current()) return;
      const next = new SDK.Player({
        name: "StudyRoom personal player",
        volume: 0.5,
        getOAuthToken: (callback) => {
          void authFetch("/api/music/spotify/token", { method: "POST" })
            .then(async (response) => {
              if (!response.ok) throw Error();
              const token = await response.json();
              if (!current()) return;
              if (
                typeof token.access_token !== "string" ||
                !Number.isFinite(token.expiresAt) ||
                token.expiresAt <= Date.now()
              )
                throw Error();
              clearTimeout(expiry.current);
              expiry.current = setTimeout(
                () => fail("Spotify authorization expired. Reconnect to continue."),
                Math.min(token.expiresAt - Date.now(), 3600_000),
              );
              callback(token.access_token); // SDK receives token transiently; never persisted by StudyRoom.
            })
            .catch(() => fail("Spotify authorization expired or unavailable. Reconnect."));
        },
      });
      player.current = next;
      playback.current = createOwnerPlaybackSignal();
      next.addListener("ready", ({ device_id }) => {
        if (current()) {
          setDevice(device_id);
          setMessage("Spotify player ready.");
          if (requestedSelection && latestSelection.current === requestedSelection)
            void play(next, device_id);
        }
      });
      next.addListener("not_ready", () => {
        if (current()) {
          fail("Spotify went offline. Press Play Spotify to reconnect.");
        }
      });
      next.addListener("player_state_changed", (state) => {
        if (!current()) return;
        const item = state?.track_window?.current_track;
        const valid =
          item &&
          typeof item.name === "string" &&
          Number.isFinite(state.position) &&
          Number.isFinite(state.duration) &&
          state.duration > 0 &&
          typeof state.paused === "boolean";
        playback.current?.report(valid ? (state.paused ? "paused" : "playing") : "unknown");
        setTrack(
          item &&
            typeof item.name === "string" &&
            Number.isFinite(state.position) &&
            Number.isFinite(state.duration)
            ? {
                name: item.name.slice(0, 200),
                artist: Array.isArray(item.artists)
                  ? item.artists
                      .slice(0, 5)
                      .map((a: any) => String(a.name ?? "").slice(0, 80))
                      .join(", ")
                  : "",
                position: Math.max(0, state.position),
                duration: Math.max(1, state.duration),
                paused: state.paused !== false,
                observed: Date.now(),
              }
            : null,
        );
        setMessage(
          valid
            ? state.paused
              ? "Spotify device paused."
              : "Playing on this Spotify device."
            : "Spotify playback state unavailable.",
        );
      });
      for (const event of [
        "initialization_error",
        "authentication_error",
        "account_error",
        "playback_error",
      ])
        next.addListener(event, () =>
          fail(
            event === "account_error"
              ? "Spotify Premium is required. Check your account."
              : "Spotify device failed. Check authorization, browser DRM and app access, then reconnect.",
          ),
        );
      next.addListener("autoplay_failed", () => {
        if (current()) setMessage("Browser blocked playback. Press the play/resume button again.");
      });
      if (!(await next.connect()))
        fail("Spotify device could not connect. Check Premium, browser DRM and app access.");
    } catch {
      fail("Spotify SDK unavailable or blocked. Official embeds remain available.");
    }
  }
  async function play(preparedPlayer = player.current, preparedDevice = device) {
    const current = preparedPlayer;
    const chosen = latestSelection.current;
    const run = generation.current;
    if (!current || !preparedDevice || !chosen) return;
    try {
      // Activate synchronously from the actual click before awaiting network.
      const activated = current.activateElement();
      await activated;
      const response = await authFetch("/api/music/spotify/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: preparedDevice, url: chosen }),
      });
      if (alive.current && run === generation.current) {
        if (response.ok) playingSelection.current = chosen;
        setMessage(
          response.ok
            ? "Play requested. Waiting for Spotify device state; audio is not yet confirmed."
            : "Spotify refused playback. Check Premium, app access and the selected link.",
        );
      }
    } catch {
      if (alive.current && run === generation.current)
        setMessage("Play failed or browser blocked audio. Retry with a direct click.");
    }
  }
  async function disconnect() {
    teardown();
    setDevice(null);
    setEnabled(false);
    try {
      const response = await authFetch("/api/music/disconnect", {
        method: "POST",
      });
      if (!response.ok) throw Error();
      if (alive.current) {
        setReadiness((value) =>
          value ? { ...value, spotify: { ...value.spotify, authorized: false } } : value,
        );
        window.dispatchEvent(new Event("studyroom:spotify-disconnected"));
        setMessage(
          "Local music session cleared. Provider consent can be revoked separately in Spotify account settings.",
        );
      }
    } catch {
      if (alive.current)
        setMessage(
          "Device stopped locally; server disconnect could not be confirmed. Session expires within one hour.",
        );
    }
  }
  const position = track
    ? Math.min(
        track.duration,
        track.position + (track.paused ? 0 : Math.max(0, Date.now() - track.observed)),
      )
    : 0;
  const clock = (ms: number) =>
    `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
  return (
    <details
      ref={panel}
      className="music-custom"
      onToggle={(e) => {
        if (e.target === e.currentTarget) {
          setPanelOpen(e.currentTarget.open);
          if (e.currentTarget.open) void check();
        }
      }}
    >
      <summary>Account-connected playback</summary>
      {provider === "spotify" && (
        <section className="spotify-device-player" aria-label="Full Spotify player">
          <p className="eyebrow">SPOTIFY PLAYER</p>
          <h3>{device && track ? track.name : "Your soundtrack, in this room."}</h3>
          <p>
            {device && track
              ? track.artist
              : "Play your Spotify playlist here. Full playback requires Spotify Premium."}
          </p>
          {device && track && (
            <>
              <label>
                Track position
                <input
                  type="range"
                  min="0"
                  max={track.duration}
                  step="1000"
                  value={position}
                  disabled={!player.current?.seek}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    void player.current
                      ?.seek?.(next)
                      .catch(() => setMessage("Spotify could not seek."));
                  }}
                />
              </label>
              <p className="quiet-note">
                {clock(position)} / {clock(track.duration)}
              </p>
            </>
          )}
          {device && (
            <label>
              Spotify volume
              <input
                type="range"
                min="0"
                max="1"
                step=".05"
                value={volume}
                disabled={!player.current?.setVolume}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setVolume(next);
                  void player.current
                    ?.setVolume?.(next)
                    .catch(() => setMessage("Spotify could not change volume."));
                }}
              />
            </label>
          )}
        </section>
      )}
      {provider === "spotify" && (
        <div className="spotify-main-action">
          {connectionUrl ? (
            <a
              className="launch-link"
              href={connectionUrl}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              Continue in Spotify
            </a>
          ) : readiness?.spotify.authorized && readiness.spotify.canPlay !== false ? (
            <button
              className="primary"
              disabled={(enabled && !device) || !selection}
              onClick={() => {
                if (!device) void enable();
                else if (track && playingSelection.current === selection)
                  void player.current
                    ?.togglePlay()
                    .catch(() => setMessage("Spotify could not change playback. Try again."));
                else void play();
              }}
            >
              {enabled && !device
                ? "Preparing Spotify…"
                : device && track && playingSelection.current === selection && !track.paused
                  ? "Pause Spotify"
                  : device && track && playingSelection.current === selection
                    ? "Resume Spotify"
                    : "Play Spotify"}
            </button>
          ) : (
            <button
              className="primary"
              disabled={!readiness?.spotify.ready || authorizing}
              onClick={() => void authorize()}
            >
              {authorizing ? "Connecting…" : "Connect Spotify"}
            </button>
          )}
          {!readiness && <p className="quiet-note">Checking connection…</p>}
          {readiness?.[provider]?.blocker && (
            <p className="quiet-note">{readiness[provider].blocker}</p>
          )}
        </div>
      )}
      {provider === "spotify" ? (
        <details className="spotify-connection-settings">
          <summary>Connection settings</summary>
          <p className="quiet-note">
            Full playback requires Spotify Premium. Your connection is personal; sharing listening
            status with your room is a separate choice. Disconnecting here does not revoke Spotify
            consent.
          </p>
          <button onClick={() => void check()}>Refresh connection</button>
          {readiness?.spotify.authorized && (
            <button onClick={() => void disconnect()}>Disconnect Spotify</button>
          )}
        </details>
      ) : (
        <p className="quiet-note">
          {readiness?.apple.blocker ??
            "Connected Apple Music playback is unavailable. You can still add a link and use Apple’s official player."}
        </p>
      )}
      <p className="quiet-note" aria-live="polite">
        {message}
      </p>
    </details>
  );
}
