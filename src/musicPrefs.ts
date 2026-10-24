import { privateStorage } from './privateStorage.js';
// Personal music preferences. Local only: no accounts, tokens or secrets.
export type MusicProvider = 'spotify' | 'apple' | 'silent';
export type MusicPrefs = { provider: MusicProvider; spotify: string | null; apple: string | null };

export const MUSIC_PREFS_KEY = 'studyroom.musicPrefs.v1';
export const SILENT: MusicPrefs = { provider: 'silent', spotify: null, apple: null };

const isProvider = (value: unknown): value is MusicProvider => value === 'spotify' || value === 'apple' || value === 'silent';

// Apple Music: accept a normal music.apple.com link (album/playlist/song) and
// return an embed URL. Reject credentials, custom ports, lookalike hosts and
// non-HTTPS input. No tracking query is preserved on the embed URL.
export function appleMusicLink(input: string): string | null {
  if (typeof input !== 'string' || input.length > 2048 || /[\s\\]/.test(input)) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    if (host !== 'music.apple.com' && host !== 'embed.music.apple.com') return null;
    if (!/^\/[a-z]{2}\/(album|playlist|song)\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)?\/?$/.test(url.pathname)) return null;
    if (url.searchParams.has('uo') || url.searchParams.has('at') || url.searchParams.has('ct')) return null;
    const songs = url.searchParams.getAll('i');
    if (songs.length > 1 || (songs.length === 1 && (!/^\d{1,30}$/.test(songs[0]) || !url.pathname.includes('/album/')))) return null;
    return `https://embed.music.apple.com${url.pathname.replace(/\/$/, '')}${songs.length ? `?i=${songs[0]}` : ''}`;
  } catch {
    return null;
  }
}

export function sanitizePrefs(value: unknown): MusicPrefs {
  if (!value || typeof value !== 'object') return SILENT;
  const raw = value as Record<string, unknown>;
  const provider = isProvider(raw.provider) ? raw.provider : 'silent';
  const spotify = typeof raw.spotify === 'string' && /^https:\/\/open\.spotify\.com\/(track|album|playlist)\/[A-Za-z0-9]{22}$/.test(raw.spotify) ? raw.spotify : null;
  const apple = typeof raw.apple === 'string' ? appleMusicLink(raw.apple) : null;
  return { provider, spotify, apple };
}

export function loadMusicPrefs(storage: Pick<Storage, 'getItem'> | undefined = privateStorage()): MusicPrefs {
  try {
    const raw = storage?.getItem(MUSIC_PREFS_KEY);
    if (!raw) return SILENT;
    return sanitizePrefs(JSON.parse(raw));
  } catch {
    return SILENT;
  }
}

export function saveMusicPrefs(prefs: MusicPrefs, storage: Pick<Storage, 'setItem' | 'getItem'> | undefined = privateStorage()): boolean {
  try {
    const clean = sanitizePrefs(prefs);
    storage?.setItem(MUSIC_PREFS_KEY, JSON.stringify(clean));
    return storage?.getItem(MUSIC_PREFS_KEY) !== null && storage?.getItem(MUSIC_PREFS_KEY) !== undefined;
  } catch {
    return false;
  }
}
