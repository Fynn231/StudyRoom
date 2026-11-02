import { useState, useId } from "react";
import { usePrivateStorage } from "./privateStorage.js";
import { useOptionalAuth } from "./auth.js";
import { loadSessions } from "./sessionRecords.js";
import {
  PROFILE_KEY,
  validProfile,
  profileStats,
  profileBadges,
  type StudyProfile as Profile,
} from "./profileModel.js";
export function ProfileCard({ profile }: { profile: Profile }) {
  return (
    <article
      className={`profile-card profile-${profile.accent}`}
      aria-label={`${profile.displayName}'s study profile`}
    >
      <div className="profile-banner" />
      <div className="profile-avatar" aria-hidden="true">
        {profile.displayName.slice(0, 1).toUpperCase()}
      </div>
      <h3>{profile.displayName}</h3>
      <p>{profile.bio || "Making room for one good next step."}</p>
      <p className="quiet-note">
        Device progress · {profile.sessions} completed cycles · {profile.minutes} minutes
      </p>
      <ul className="study-badges" aria-label="Study milestones">
        {profileBadges(profile).map((b) => (
          <li key={b.name} data-earned={b.earned}>
            <strong>
              {b.earned ? "✦" : "○"} {b.name}
            </strong>
            <small>{b.earned ? "Earned on this device" : b.goal}</small>
          </li>
        ))}
      </ul>
    </article>
  );
}
export function StudyProfile({
  inRoom,
  shared,
  onShare,
  onWithdraw,
  disabled,
}: {
  inRoom: boolean;
  shared: boolean;
  onShare: (profile: Profile) => Promise<unknown>;
  onWithdraw: () => Promise<unknown>;
  disabled: boolean;
}) {
  const uid = useId(),
    storage = usePrivateStorage(),
    auth = useOptionalAuth();
  const [draft, setDraft] = useState<Profile>(() => {
    try {
      const value = JSON.parse(storage.getItem(PROFILE_KEY) ?? "null");
      if (validProfile(value)) return { ...value, ...profileStats(loadSessions(storage).sessions) };
    } catch {}
    return {
      displayName: auth?.user?.name?.slice(0, 60) || "Study friend",
      bio: "",
      accent: "sage",
      ...profileStats(loadSessions(storage).sessions),
    };
  });
  const [message, setMessage] = useState(""),
    [blocked, setBlocked] = useState(false);
  const updateStats = () => {
    const history = loadSessions(storage);
    setBlocked(history.blocked);
    setDraft((v) => ({ ...v, ...profileStats(history.sessions) }));
  };
  async function share() {
    if (!validProfile(draft)) return;
    const history = loadSessions(storage);
    if (history.blocked) {
      setMessage("History is unavailable. Progress was not shared.");
      return;
    }
    const next = { ...draft, ...profileStats(history.sessions) };
    if (await onShare(next))
      setMessage(
        "Profile shared with this room. Further edits stay private until you share again.",
      );
  }
  return (
    <details
      className="optional-panel study-profile"
      onToggle={(e) => {
        if (e.currentTarget.open) updateStats();
      }}
    >
      <summary>Your study profile</summary>
      <p className="quiet-note">
        Edit privately. Save on this device or deliberately share with the people in your current
        room. No notes, intentions or plan text are included. Rejoining never restores sharing
        automatically.
      </p>
      <ProfileCard profile={draft} />
      <label htmlFor={`${uid}-name`}>Profile display name</label>
      <input
        id={`${uid}-name`}
        value={draft.displayName}
        maxLength={60}
        onChange={(e) => setDraft((v) => ({ ...v, displayName: e.target.value }))}
      />
      <label htmlFor={`${uid}-bio`}>About your study space</label>
      <textarea
        id={`${uid}-bio`}
        value={draft.bio}
        maxLength={160}
        onChange={(e) => setDraft((v) => ({ ...v, bio: e.target.value }))}
      />
      <label htmlFor={`${uid}-color`}>Profile color</label>
      <select
        id={`${uid}-color`}
        value={draft.accent}
        onChange={(e) =>
          setDraft((v) => ({
            ...v,
            accent: e.target.value as Profile["accent"],
          }))
        }
      >
        <option value="sage">Sage</option>
        <option value="ocean">Ocean</option>
        <option value="rose">Rose</option>
      </select>
      <div className="ambience-actions">
        <button
          disabled={!validProfile(draft)}
          onClick={() => {
            try {
              storage.setItem(PROFILE_KEY, JSON.stringify(draft));
              setMessage("Profile saved on this device.");
            } catch {
              setMessage("Could not save the profile; it remains in this tab.");
            }
          }}
        >
          Save profile on this device
        </button>
        {inRoom && (
          <>
            <button
              disabled={disabled || !validProfile(draft) || blocked}
              onClick={() => void share()}
            >
              {shared ? "Update room profile" : "Share profile with room"}
            </button>
            {shared && (
              <button
                disabled={disabled}
                onClick={async () => {
                  if (await onWithdraw())
                    setMessage(
                      "Profile hidden from this room. Listening sharing is controlled separately.",
                    );
                }}
              >
                Hide room profile
              </button>
            )}
          </>
        )}
      </div>
      {!inRoom && <p className="quiet-note">Join a room to share your profile.</p>}
      {blocked && (
        <p role="alert">
          Study history could not be read. It was preserved; milestones are unavailable.
        </p>
      )}
      <p role="status">{message}</p>
      <p className="quiet-note">
        Milestones use completed cycles stored on this device. They are personal progress, not
        verified attendance, ranked achievements or cloud-synced totals.
      </p>
    </details>
  );
}
