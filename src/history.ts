import type { SessionRecord } from './PrivateReview.js';

export const storageKey = 'studyroom.private-history.v1';
export const historyLimit = 50;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;

// All-or-nothing import: never render or overwrite a partially understood schema.
export function parseHistory(raw: string | null): SessionRecord[] {
  if (raw === null) return [];
  if (raw.length > 100000) throw new Error('History is too large.');
  const data: unknown = JSON.parse(raw);
  if (!object(data) || Object.keys(data).length !== 2 || data.version !== 1 || !Array.isArray(data.records) || data.records.length > historyLimit) throw new Error('Unsupported history.');
  const ids = new Set<string>();
  return data.records.map((item: unknown) => {
    if (!object(item) || Object.keys(item).sort().join(',') !== 'commitment,finishedAt,id,note,openedAt,outcome' || typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(item.id) || ids.has(item.id) || !timestamp(item.openedAt) || !timestamp(item.finishedAt) || item.finishedAt < item.openedAt || typeof item.commitment !== 'string' || item.commitment.length > 240 || typeof item.note !== 'string' || item.note.length > 500 || !['completed', 'partial', 'blocked'].includes(item.outcome as string)) throw new Error('Invalid session.');
    ids.add(item.id);
    return { id: item.id, openedAt: item.openedAt, finishedAt: item.finishedAt, commitment: item.commitment, note: item.note, outcome: item.outcome as SessionRecord['outcome'] };
  });
}
