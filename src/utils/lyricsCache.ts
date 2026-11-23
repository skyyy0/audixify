import type { LyricsPayload } from '../types/music';

const LYRICS_CACHE_KEY = 'audixify_lyrics_cache_v1';
const MAX_CACHED_TRACKS = 50;

interface CachedLyricsEntry {
  key: string;
  cachedAt: number;
  payload: LyricsPayload;
}

function makeLyricsKey(title: string, artist: string): string {
  return `${title.trim().toLowerCase()}::${artist.trim().toLowerCase()}`;
}

function readCache(): CachedLyricsEntry[] {
  try {
    const raw = localStorage.getItem(LYRICS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CachedLyricsEntry[]) : [];
  } catch {
    return [];
  }
}

function writeCache(entries: CachedLyricsEntry[]): void {
  try {
    localStorage.setItem(LYRICS_CACHE_KEY, JSON.stringify(entries.slice(0, MAX_CACHED_TRACKS)));
  } catch {
    // If storage quota is tight on low-end devices, trim aggressively
    try {
      localStorage.setItem(LYRICS_CACHE_KEY, JSON.stringify(entries.slice(0, 15)));
    } catch {}
  }
}

export function getCachedLyrics(title: string, artist: string): LyricsPayload | null {
  const key = makeLyricsKey(title, artist);
  const entries = readCache();
  const hit = entries.find((e) => e.key === key);
  if (!hit || !hit.payload?.found) return null;

  // Move hit to front (LRU)
  const reordered = [hit, ...entries.filter((e) => e.key !== key)];
  writeCache(reordered);
  return hit.payload;
}

export function setCachedLyrics(title: string, artist: string, payload: LyricsPayload): void {
  if (!payload.found) return;
  const key = makeLyricsKey(title, artist);
  const entries = readCache().filter((e) => e.key !== key);
  entries.unshift({
    key,
    cachedAt: Date.now(),
    payload,
  });
  writeCache(entries);
}
