import type { Track } from '../types/music';

const STATS_STORAGE_KEY = 'audixify_listening_stats_v1';
const MAX_TRACK_ENTRIES = 120;
const MAX_ARTIST_ENTRIES = 80;

export interface TrackListenStat {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  plays: number;
  seconds: number;
  lastPlayedAt: number;
}

export interface ArtistListenStat {
  name: string;
  plays: number;
  seconds: number;
  artwork: string;
  lastPlayedAt: number;
}

export interface ListeningStatsStore {
  totalSeconds: number;
  totalPlays: number;
  tracks: Record<string, TrackListenStat>;
  artists: Record<string, ArtistListenStat>;
}

const EMPTY_STATS: ListeningStatsStore = {
  totalSeconds: 0,
  totalPlays: 0,
  tracks: {},
  artists: {},
};

function readStats(): ListeningStatsStore {
  try {
    const raw = localStorage.getItem(STATS_STORAGE_KEY);
    if (!raw) return { ...EMPTY_STATS, tracks: {}, artists: {} };
    const parsed = JSON.parse(raw) as Partial<ListeningStatsStore>;
    return {
      totalSeconds: Number.isFinite(parsed.totalSeconds) ? Math.max(0, Number(parsed.totalSeconds)) : 0,
      totalPlays: Number.isFinite(parsed.totalPlays) ? Math.max(0, Number(parsed.totalPlays)) : 0,
      tracks: parsed.tracks && typeof parsed.tracks === 'object' ? parsed.tracks : {},
      artists: parsed.artists && typeof parsed.artists === 'object' ? parsed.artists : {},
    };
  } catch {
    return { ...EMPTY_STATS, tracks: {}, artists: {} };
  }
}

function writeStats(store: ListeningStatsStore): void {
  try {
    // Keep dictionary bounded for 2GB RAM / localStorage efficiency
    const trackEntries = Object.entries(store.tracks);
    if (trackEntries.length > MAX_TRACK_ENTRIES) {
      trackEntries.sort((a, b) => b[1].plays * 60 + b[1].seconds - (a[1].plays * 60 + a[1].seconds));
      store.tracks = Object.fromEntries(trackEntries.slice(0, MAX_TRACK_ENTRIES));
    }
    const artistEntries = Object.entries(store.artists);
    if (artistEntries.length > MAX_ARTIST_ENTRIES) {
      artistEntries.sort((a, b) => b[1].plays * 60 + b[1].seconds - (a[1].plays * 60 + a[1].seconds));
      store.artists = Object.fromEntries(artistEntries.slice(0, MAX_ARTIST_ENTRIES));
    }
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

function getPrimaryArtistName(artist: string): string {
  return artist.split(/,|&|feat\.|ft\./i)[0]?.trim() || artist.trim() || 'Unknown Artist';
}

export function recordTrackPlay(track: Track): void {
  const store = readStats();
  const now = Date.now();
  const existingTrack = store.tracks[track.id];
  store.totalPlays += 1;
  store.tracks[track.id] = {
    id: track.id,
    title: track.title,
    artist: track.artist,
    artwork: track.artwork,
    plays: (existingTrack?.plays ?? 0) + 1,
    seconds: existingTrack?.seconds ?? 0,
    lastPlayedAt: now,
  };

  const primaryArtist = getPrimaryArtistName(track.artist);
  const artistKey = primaryArtist.toLowerCase();
  const existingArtist = store.artists[artistKey];
  store.artists[artistKey] = {
    name: existingArtist?.name || primaryArtist,
    plays: (existingArtist?.plays ?? 0) + 1,
    seconds: existingArtist?.seconds ?? 0,
    artwork: existingArtist?.artwork || track.artwork,
    lastPlayedAt: now,
  };

  writeStats(store);
}

export function recordListeningSeconds(track: Track, deltaSec: number): void {
  if (!Number.isFinite(deltaSec) || deltaSec <= 0 || deltaSec > 5) return;
  const store = readStats();
  const now = Date.now();
  store.totalSeconds += deltaSec;

  const existingTrack = store.tracks[track.id];
  store.tracks[track.id] = {
    id: track.id,
    title: track.title,
    artist: track.artist,
    artwork: track.artwork,
    plays: existingTrack?.plays ?? 0,
    seconds: (existingTrack?.seconds ?? 0) + deltaSec,
    lastPlayedAt: now,
  };

  const primaryArtist = getPrimaryArtistName(track.artist);
  const artistKey = primaryArtist.toLowerCase();
  const existingArtist = store.artists[artistKey];
  store.artists[artistKey] = {
    name: existingArtist?.name || primaryArtist,
    plays: existingArtist?.plays ?? 0,
    seconds: (existingArtist?.seconds ?? 0) + deltaSec,
    artwork: existingArtist?.artwork || track.artwork,
    lastPlayedAt: now,
  };

  writeStats(store);
}

export interface ListeningSummary {
  totalMinutes: number;
  totalSeconds: number;
  totalPlays: number;
  topArtists: ArtistListenStat[];
  topTracks: TrackListenStat[];
}

export function getListeningSummary(): ListeningSummary {
  const store = readStats();
  const topArtists = Object.values(store.artists)
    .filter((a) => a.plays > 0 || a.seconds > 0)
    .sort((a, b) => b.seconds + b.plays * 30 - (a.seconds + a.plays * 30))
    .slice(0, 6);

  const topTracks = Object.values(store.tracks)
    .filter((t) => t.plays > 0 || t.seconds > 0)
    .sort((a, b) => b.plays * 60 + b.seconds - (a.plays * 60 + a.seconds))
    .slice(0, 8);

  return {
    totalMinutes: Math.floor(store.totalSeconds / 60),
    totalSeconds: Math.round(store.totalSeconds),
    totalPlays: store.totalPlays,
    topArtists,
    topTracks,
  };
}

export function getTrackPlayCount(trackId: string): number {
  const store = readStats();
  return store.tracks[trackId]?.plays ?? 0;
}

export function clearListeningStats(): void {
  try {
    localStorage.removeItem(STATS_STORAGE_KEY);
  } catch {}
}
