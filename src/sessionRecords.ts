import { privateStorage } from './privateStorage.js';
// Completed-session records and optional feedback. Local, bounded, no content.
export type SessionRecord = {
  id: string;
  completedAt: string;
  focusedMs: number;
  plannedMs: number;
  stepsDone: number;
  stepsTotal: number;
  rating: number | null;
  focusRating: number | null;
};

export const SESSIONS_KEY = 'studyroom.completedSessions.v1';
export const CREATOR_NOTE_KEY = 'studyroom.creatorNote.v1';
const MAX_SESSIONS = 200;

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isRating = (v: unknown): v is number | null => v === null || isInt(v, 1, 5);

export function isSessionRecord(value: unknown): value is SessionRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return typeof r.id === 'string' && r.id.length > 0 && r.id.length <= 64
    && typeof r.completedAt === 'string' && !Number.isNaN(Date.parse(r.completedAt)) && r.completedAt.length <= 40
    && isInt(r.focusedMs, 0, 24 * 60 * 60 * 1000) && isInt(r.plannedMs, 0, 24 * 60 * 60 * 1000)
    && isInt(r.stepsDone, 0, 999) && isInt(r.stepsTotal, 0, 999)
    && isRating(r.rating) && isRating(r.focusRating);
}

export function parseSessions(raw: string | null): { sessions: SessionRecord[]; blocked: boolean } {
  if (raw === null) return { sessions: [], blocked: false };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > MAX_SESSIONS || !parsed.every(isSessionRecord)) return { sessions: [], blocked: true };
    const ids = new Set<string>();
    for (const s of parsed) { if (ids.has(s.id)) return { sessions: [], blocked: true }; ids.add(s.id); }
    return { sessions: parsed, blocked: false };
  } catch {
    return { sessions: [], blocked: true };
  }
}

export function loadSessions(storage: Pick<Storage, 'getItem'> | undefined = privateStorage()) {
  try { return parseSessions(storage?.getItem(SESSIONS_KEY) ?? null); } catch { return { sessions: [], blocked: true }; }
}

export function saveSession(record: SessionRecord, storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = privateStorage()): { ok: boolean; error?: string; duplicate?: boolean } {
  if (!isSessionRecord(record)) return { ok: false, error: 'That session could not be saved.' };
  const current = loadSessions(storage);
  if (current.blocked) return { ok: false, error: 'Session history is unavailable. Nothing was overwritten.' };
  if (current.sessions.some(s => s.id === record.id)) return { ok: true, duplicate: true };
  const next = [record, ...current.sessions].slice(0, MAX_SESSIONS);
  try {
    storage?.setItem(SESSIONS_KEY, JSON.stringify(next));
    const check = parseSessions(storage?.getItem(SESSIONS_KEY) ?? null);
    if (check.blocked || !check.sessions.some(s => s.id === record.id)) return { ok: false, error: 'The save was not confirmed. Nothing was overwritten.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not save on this device. Nothing was overwritten.' };
  }
}

// One rating per session: updates the existing record and never appends a new one.
export function rateSession(id: string, rating: number | null, focusRating: number | null, storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = privateStorage()): { ok: boolean; error?: string } {
  if (!isRating(rating) || !isRating(focusRating)) return { ok: false, error: 'Ratings must be 1–5 or left empty.' };
  const current = loadSessions(storage);
  if (current.blocked) return { ok: false, error: 'Session history is unavailable. Nothing was overwritten.' };
  const index = current.sessions.findIndex(s => s.id === id);
  if (index < 0) return { ok: false, error: 'That session is not stored here.' };
  const next = current.sessions.map((s, i) => i === index ? { ...s, rating, focusRating } : s);
  try {
    storage?.setItem(SESSIONS_KEY, JSON.stringify(next));
    const check = loadSessions(storage);
    if (check.blocked || check.sessions.filter(s => s.id === id).length !== 1) return { ok: false, error: 'The rating was not confirmed. Nothing was overwritten.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not save feedback on this device.' };
  }
}

export function creatorNoteSeen(storage: Pick<Storage, 'getItem'> | undefined = privateStorage()): boolean {
  try { return storage?.getItem(CREATOR_NOTE_KEY) === 'seen'; } catch { return false; }
}

export function markCreatorNoteSeen(storage: Pick<Storage, 'setItem'> | undefined = privateStorage()): void {
  try { storage?.setItem(CREATOR_NOTE_KEY, 'seen'); } catch { /* session-only */ }
}

export function clearSessions(storage: Pick<Storage, 'removeItem' | 'getItem'> | undefined = privateStorage()): boolean {
  try {
    storage?.removeItem(SESSIONS_KEY);
    return storage?.getItem(SESSIONS_KEY) === null;
  } catch {
    return false;
  }
}
