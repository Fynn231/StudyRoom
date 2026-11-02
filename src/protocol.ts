import type { StudyProfile } from "./profileModel.js";
export type ListeningTrack = {
  title: string;
  artist: string;
  url: string;
  coverUrl?: string;
  positionMs: number;
  durationMs: number;
  observedAt: number;
  playing: boolean;
};
export type Participant = {
  id: string;
  name: string;
  intention?: string;
  profile?: StudyProfile;
  listening?: ListeningTrack;
};
export type Timer = { durationMs: number; remainingMs: number; endsAt: number | null };
export type RoomState = {
  code: string;
  participants: Participant[];
  timer: Timer;
  serverNow: number;
  hostId?: string | null;
  locked?: boolean;
  maxParticipants?: number;
};
export type Reply = { ok: true; state: RoomState; selfId: string } | { ok: false; error: string };
