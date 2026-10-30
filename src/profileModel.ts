import type { SessionRecord } from "./sessionRecords.js";
export type StudyProfile = {
  displayName: string;
  bio: string;
  accent: "sage" | "ocean" | "rose";
  sessions: number;
  minutes: number;
};
export const PROFILE_KEY = "studyroom.profile.v1";
export function validProfile(value: unknown): value is StudyProfile {
  if (!value || typeof value !== "object") return false;
  const v = value as StudyProfile;
  return (
    Object.keys(v).sort().join("|") ===
      "accent|bio|displayName|minutes|sessions" &&
    typeof v.displayName === "string" &&
    !!v.displayName.trim() &&
    v.displayName.length <= 60 &&
    typeof v.bio === "string" &&
    v.bio.length <= 160 &&
    !/[\u0000-\u001f\u007f]/.test(v.displayName + v.bio) &&
    ["sage", "ocean", "rose"].includes(v.accent) &&
    Number.isInteger(v.sessions) &&
    v.sessions >= 0 &&
    v.sessions <= 200 &&
    Number.isInteger(v.minutes) &&
    v.minutes >= 0 &&
    v.minutes <= 288000
  );
}
export function profileStats(records: SessionRecord[]) {
  return {
    sessions: records.filter((s) => s.focusedMs > 0).length,
    minutes: Math.floor(records.reduce((n, s) => n + s.focusedMs, 0) / 60000),
  };
}
export function profileBadges(
  profile: Pick<StudyProfile, "sessions" | "minutes">,
) {
  return [
    {
      name: "First focus",
      earned: profile.sessions >= 1,
      goal: "Complete one focus cycle",
    },
    {
      name: "Steady five",
      earned: profile.sessions >= 5,
      goal: "Complete five focus cycles",
    },
    {
      name: "Deep diver",
      earned: profile.minutes >= 300,
      goal: "Record five hours of focus",
    },
  ];
}
