export type Participant = { id: string; name: string; intention?: string };
export type Timer = { durationMs: number; remainingMs: number; endsAt: number | null };
export type RoomState = { code: string; participants: Participant[]; timer: Timer; serverNow: number; hostId?: string | null; locked?: boolean; maxParticipants?: number }; 
export type Reply = { ok: true; state: RoomState; selfId: string } | { ok: false; error: string };
