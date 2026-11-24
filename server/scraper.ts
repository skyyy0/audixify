import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import type {
  AlbumDetailPayload,
  AlbumSummary,
  ArtistDetailPayload,
  ArtistRelatedItem,
  ArtistSummary,
  ArtistVideoItem,
  DiscoverPayload,
  LyricSearchHit,
  LyricSearchPayload,
  LyricsPayload,
  MusicVideoResult,
  QuickMix,
  RegionScope,
  ReleaseRadarPayload,
  SearchPayload,
  StreamResolution,
  SyncedLyricLine,
  Track,
} from '../src/types/music.ts';

const HAS_FFMPEG = (() => {
  if (process.env.VERCEL === '1') return false;
  try {
    execFileSync('which', ['ffmpeg'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

async function withCache<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const running = inflight.get(key);
  if (running) {
    return running as Promise<T>;
  }

  const promise = loader()
    .then((value) => {
      cache.set(key, { expiresAt: Date.now() + ttlMs, value });
      inflight.delete(key);
      return value;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise);
  return promise;
}

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 8500): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json, text/plain, */*',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

async function fetchText(url: string, init?: RequestInit, timeoutMs = 8500): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': USER_AGENT,
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return await res.text();
}

// ============================================================================
// SSRF-Safe Media Host Validation
// ============================================================================

const ALLOWED_MEDIA_HOST_SUFFIXES = [
  'soundcloud.cloud',
  'sndcdn.com',
  'soundcloud.com',
  'saavncdn.com',
  'mzstatic.com',
  'apple.com',
  'dzcdn.net',
  'deezer.com',
  'dailymotion.com',
  'dmcdn.net',
];

export function isValidExternalMediaUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.includes(':')
    ) {
      return false;
    }
    return ALLOWED_MEDIA_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

// ============================================================================
// Normalization & Deduplication Utilities
// ============================================================================

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(feat|ft|featuring|official|audio|video|lyrics|mv|remastered)\b\.?/gi, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function makeDedupeKey(title: string, artist: string): string {
  const primaryArtist = artist.split(/,|&|feat\.|ft\.|x\s/i)[0]?.trim() || artist;
  return `${normalizeText(title)}::${normalizeText(primaryArtist)}`;
}

function deduplicateTracks(tracks: Track[]): Track[] {
  const seen = new Map<string, Track>();
  const seenIds = new Set<string>();
  for (const track of tracks) {
    if (!track.title || !track.artist || !track.id) continue;
    if (seenIds.has(track.id)) continue;
    const key = makeDedupeKey(track.title, track.artist);
    const existing = seen.get(key);
    if (!existing) {
      seenIds.add(track.id);
      seen.set(key, track);
    } else {
      // Merge previewUrl or artwork or rank if missing
      if (!existing.previewUrl && track.previewUrl) {
        existing.previewUrl = track.previewUrl;
      }
      if (!existing.durationSec && track.durationSec) {
        existing.durationSec = track.durationSec;
      }
      if (!existing.scTrackId && track.scTrackId) {
        existing.scTrackId = track.scTrackId;
      }
      if (!existing.playCountText && track.playCountText) {
        existing.playCountText = track.playCountText;
      }
      if (!existing.explicit && track.explicit) {
        existing.explicit = track.explicit;
      }
      if (!existing.collectionId && track.collectionId) {
        existing.collectionId = track.collectionId;
      }
      if (!existing.trackNumber && track.trackNumber) {
        existing.trackNumber = track.trackNumber;
      }
    }
  }
  return Array.from(seen.values());
}

function upscaleItunesArt(url?: string): string {
  if (!url) return '';
  return url
    .replace(/\/\d+x\d+bb\.(jpg|jpeg|png|webp)/i, '/600x600bb.$1')
    .replace(/\/\d+x\d+-\d+\.(jpg|jpeg|png|webp)/i, '/600x600bb.$1');
}

function parseDurationLabel(label?: string): number {
  if (!label) return 0;
  const parts = label.trim().split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function inferRegion(artist: string, genre: string, fallback: 'ID' | 'ASIA' | 'GLOBAL'): 'ID' | 'ASIA' | 'GLOBAL' {
  const combined = `${artist} ${genre}`.toLowerCase();
  if (
    /indonesia|indo|dangdut|koplo|jawa|sunda|tulus|hindia|bernadya|mahalini|raisa|sheila on 7|dewa 19|juicy luicy|sal priadi|denny caknan|lyodra|tiara andini|nidji|noah|peterpan|feast|pamungkas|fiersa|payung teduh|fourtwnty|virgoun|budi doremi|rizky febian|yura yunita|isyana|afgan|rossa|kunto aji|barasuara|reality club/.test(
      combined,
    )
  ) {
    return 'ID';
  }
  if (
    /k-pop|kpop|j-pop|jpop|c-pop|cpop|mandopop|cantopop|anime|newjeans|aespa|bts|blackpink|ive|seventeen|stray kids|twice|le sserafim|yoasobi|fujii kaze|kenshi yonezu|ado|official hige|jay chou|eric chou|g-dragon|iu|baekhyun|day6|babymonster|illit|bini|jeff satur/.test(
      combined,
    ) ||
    /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(combined)
  ) {
    return 'ASIA';
  }
  return fallback;
}

// ============================================================================
// Apple RSS & iTunes Scraper
// ============================================================================

interface AppleRssResult {
  feed?: {
    results?: Array<{
      id: string;
      name: string;
      artistName: string;
      artworkUrl100?: string;
      releaseDate?: string;
      genres?: Array<{ name: string }>;
    }>;
  };
}

async function scrapeAppleChart(
  country: 'id' | 'jp' | 'kr' | 'us' | 'tw',
  regionTag: 'ID' | 'ASIA' | 'GLOBAL',
  limit = 25,
): Promise<Track[]> {
  return withCache(`apple_chart:${country}:${limit}`, 15 * 60 * 1000, async () => {
    const data = await fetchJson<AppleRssResult>(
      `https://rss.applemarketingtools.com/api/v2/${country}/music/most-played/${limit}/songs.json`,
      undefined,
      6500,
    );
    const items = data.feed?.results ?? [];
    return items.map((item, idx) => ({
      id: `apple-${country}-${item.id}`,
      title: item.name,
      artist: item.artistName,
      album: 'Top Charts',
      durationSec: 0,
      artwork: upscaleItunesArt(item.artworkUrl100),
      region: inferRegion(item.artistName, item.genres?.[0]?.name ?? '', regionTag),
      genre: item.genres?.[0]?.name ?? (regionTag === 'ID' ? 'Pop Indonesia' : 'Pop'),
      source: 'itunes' as const,
      releaseYear: item.releaseDate?.slice(0, 4),
      rank: idx + 1,
    }));
  });
}

interface ItunesSearchResult {
  results?: Array<{
    wrapperType?: string;
    trackId?: number;
    collectionId?: number;
    trackName?: string;
    artistName?: string;
    collectionName?: string;
    trackTimeMillis?: number;
    artworkUrl100?: string;
    previewUrl?: string;
    primaryGenreName?: string;
    releaseDate?: string;
    trackNumber?: number;
    trackExplicitness?: string;
    copyright?: string;
    trackCount?: number;
  }>;
}

async function scrapeItunesSearch(
  term: string,
  country: 'id' | 'jp' | 'kr' | 'us' | 'tw' = 'id',
  regionTag: 'ID' | 'ASIA' | 'GLOBAL' = 'GLOBAL',
  limit = 15,
): Promise<Track[]> {
  return withCache(`itunes:${country}:${term}:${limit}`, 15 * 60 * 1000, async () => {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${country}&media=music&entity=song&limit=${limit}`;
    const data = await fetchJson<ItunesSearchResult>(url, undefined, 7000);
    const results = data.results ?? [];
    return results
      .filter((r) => r.trackId && r.trackName && r.artistName)
      .map((r) => ({
        id: `itunes-${r.trackId}`,
        title: r.trackName!,
        artist: r.artistName!,
        album: r.collectionName || 'Single',
        durationSec: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : 0,
        artwork: upscaleItunesArt(r.artworkUrl100),
        region: inferRegion(r.artistName!, r.primaryGenreName ?? '', regionTag),
        genre: r.primaryGenreName || 'Music',
        source: 'itunes' as const,
        previewUrl: r.previewUrl,
        releaseYear: r.releaseDate?.slice(0, 4),
        explicit: r.trackExplicitness === 'explicit',
        trackNumber: r.trackNumber,
        collectionId: r.collectionId,
      }));
  });
}

// ============================================================================
// Deezer Chart & Search Scraper
// ============================================================================

interface DeezerTrack {
  id: number;
  title: string;
  duration: number;
  preview?: string;
  explicit_lyrics?: boolean;
  rank?: number;
  artist?: { id: number; name: string; picture_big?: string; picture_medium?: string };
  album?: { id: number; title: string; cover_xl?: string; cover_big?: string; cover_medium?: string };
}

async function scrapeDeezerChart(limit = 25): Promise<Track[]> {
  return withCache(`deezer_chart:${limit}`, 15 * 60 * 1000, async () => {
    const data = await fetchJson<{ data?: DeezerTrack[] }>(
      `https://api.deezer.com/chart/0/tracks?limit=${limit}`,
      undefined,
      6500,
    );
    return (data.data ?? []).map((t, idx) => ({
      id: `deezer-${t.id}`,
      title: t.title,
      artist: t.artist?.name ?? 'Unknown Artist',
      album: t.album?.title ?? 'Single',
      durationSec: t.duration || 0,
      artwork: t.album?.cover_xl || t.album?.cover_big || t.album?.cover_medium || '',
      region: inferRegion(t.artist?.name ?? '', '', 'GLOBAL'),
      genre: 'Global Chart',
      source: 'deezer' as const,
      previewUrl: t.preview,
      rank: idx + 1,
      explicit: Boolean(t.explicit_lyrics),
    }));
  });
}

async function scrapeDeezerSearch(
  query: string,
  regionTag: 'ID' | 'ASIA' | 'GLOBAL' = 'GLOBAL',
  limit = 15,
): Promise<Track[]> {
  return withCache(`deezer_search:${query}:${limit}`, 10 * 60 * 1000, async () => {
    const data = await fetchJson<{ data?: DeezerTrack[] }>(
      `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      undefined,
      6500,
    );
    return (data.data ?? []).map((t) => ({
      id: `deezer-${t.id}`,
      title: t.title,
      artist: t.artist?.name ?? 'Unknown Artist',
      album: t.album?.title ?? 'Single',
      durationSec: t.duration || 0,
      artwork: t.album?.cover_xl || t.album?.cover_big || t.album?.cover_medium || '',
      region: inferRegion(t.artist?.name ?? '', '', regionTag),
      genre: 'Music',
      source: 'deezer' as const,
      previewUrl: t.preview,
      explicit: Boolean(t.explicit_lyrics),
    }));
  });
}

// ============================================================================
// YouTube Music InnerTube (WEB_REMIX) Catalog Scraper
// ============================================================================

function extractTextRuns(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const runs = (node as { runs?: Array<{ text?: string }> }).runs;
  if (!Array.isArray(runs)) return '';
  return runs.map((r) => r.text ?? '').join('').trim();
}

function collectYtmRenderers(node: unknown, out: Record<string, unknown>[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectYtmRenderers(item, out);
    return;
  }
  const rec = node as Record<string, unknown>;
  if (rec.musicResponsiveListItemRenderer && typeof rec.musicResponsiveListItemRenderer === 'object') {
    out.push(rec.musicResponsiveListItemRenderer as Record<string, unknown>);
  }
  for (const val of Object.values(rec)) {
    if (val && typeof val === 'object') {
      collectYtmRenderers(val, out);
    }
  }
}

async function scrapeYTMusicSearch(
  query: string,
  gl: 'ID' | 'KR' | 'JP' | 'US' = 'ID',
  regionTag: 'ID' | 'ASIA' | 'GLOBAL' = 'GLOBAL',
): Promise<Track[]> {
  return withCache(`ytm_search:${gl}:${query}`, 10 * 60 * 1000, async () => {
    const body = {
      context: {
        client: {
          clientName: 'WEB_REMIX',
          clientVersion: '1.20241101.01.00',
          hl: gl === 'ID' ? 'id' : 'en',
          gl,
        },
      },
      query,
      params: 'EgWKAQIIAWoMEAMQBBAJEAoQBRAV', // Songs filter
    };

    const data = await fetchJson<unknown>(
      'https://music.youtube.com/youtubei/v1/search?prettyPrint=false',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://music.youtube.com',
          Referer: 'https://music.youtube.com/',
        },
        body: JSON.stringify(body),
      },
      7500,
    );

    const renderers: Record<string, unknown>[] = [];
    collectYtmRenderers(data, renderers);

    const tracks: Track[] = [];
    for (const r of renderers) {
      const playlistItemData = r.playlistItemData as { videoId?: string } | undefined;
      const videoId = playlistItemData?.videoId;
      if (!videoId) continue;

      const flexCols = (r.flexColumns as Array<{ musicResponsiveListItemFlexColumnRenderer?: { text?: unknown } }>) ?? [];
      const title = extractTextRuns(flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text);
      const subtext = extractTextRuns(flexCols[1]?.musicResponsiveListItemFlexColumnRenderer?.text);

      // Subtext typically looks like: "Artist • Album • 3:42" or "Song • Artist • 3:42"
      const parts = subtext.split('•').map((s) => s.trim()).filter(Boolean);
      let artist = 'Unknown Artist';
      let album = 'Single';
      let durationSec = 0;

      for (const part of parts) {
        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(part)) {
          durationSec = parseDurationLabel(part);
        }
      }
      const nonTimeParts = parts.filter(
        (p) => !/^\d{1,2}:\d{2}(:\d{2})?$/.test(p) && !/^(Song|Video|Lagu|Single|EP)$/i.test(p) && !/plays$/i.test(p),
      );
      if (nonTimeParts.length >= 1) artist = nonTimeParts[0];
      if (nonTimeParts.length >= 2) album = nonTimeParts[1];

      const thumbs = (
        r.thumbnail as { musicThumbnailRenderer?: { thumbnail?: { thumbnails?: Array<{ url?: string }> } } }
      )?.musicThumbnailRenderer?.thumbnail?.thumbnails;
      const rawArt = thumbs?.[thumbs.length - 1]?.url || thumbs?.[0]?.url || '';
      const artwork = rawArt.replace(/=w\d+-h\d+[^=]*/, '=w544-h544-l90-rj');

      if (!title || !artist) continue;
      tracks.push({
        id: `ytm-${videoId}`,
        title,
        artist,
        album,
        durationSec,
        artwork,
        region: inferRegion(artist, '', regionTag),
        genre: regionTag === 'ID' ? 'Pop Indonesia' : regionTag === 'ASIA' ? 'Asian Hits' : 'Global',
        source: 'ytmusic',
      });
    }

    return tracks.slice(0, 18);
  });
}

// ============================================================================
// SoundCloud Client ID Scraper & Track Search
// ============================================================================

interface SoundCloudTranscoding {
  url: string;
  preset?: string;
  duration?: number;
  snipped?: boolean;
  format?: { protocol?: string; mime_type?: string };
}

interface SoundCloudTrack {
  id: number;
  title: string;
  duration: number;
  artwork_url?: string | null;
  policy?: string;
  genre?: string;
  user?: { username?: string; avatar_url?: string };
  media?: { transcodings?: SoundCloudTranscoding[] };
}

let cachedScClientId: { value: string; expiresAt: number } | null = null;
let inflightScClientId: Promise<string> | null = null;

async function getSoundCloudClientId(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedScClientId && cachedScClientId.expiresAt > Date.now()) {
    return cachedScClientId.value;
  }
  if (!forceRefresh && inflightScClientId) {
    return inflightScClientId;
  }

  const task = (async () => {
    const html = await fetchText('https://soundcloud.com', undefined, 5000);
    const scriptMatches = Array.from(
      html.matchAll(/https:\/\/a-v2\.sndcdn\.com\/assets\/[^\s"']+\.js/g),
    ).map((m) => m[0]);

    const targets = scriptMatches.slice(-6).reverse();
    if (targets.length === 0) {
      throw new Error('No SoundCloud script bundles found');
    }

    const extractFromScript = async (scriptUrl: string): Promise<string> => {
      const js = await fetchText(scriptUrl, undefined, 4500);
      const match =
        js.match(/client_id\s*:\s*"([a-zA-Z0-9]{32})"/) ||
        js.match(/"client_id"\s*:\s*"([a-zA-Z0-9]{32})"/);
      if (match?.[1]) return match[1];
      throw new Error('client_id not in bundle');
    };

    try {
      const cid = await Promise.any(targets.map(extractFromScript));
      cachedScClientId = {
        value: cid,
        expiresAt: Date.now() + 4 * 60 * 60 * 1000,
      };
      return cid;
    } catch {
      throw new Error('Unable to extract SoundCloud client_id');
    }
  })().finally(() => {
    inflightScClientId = null;
  });

  inflightScClientId = task;
  return task;
}

async function searchSoundCloudRaw(query: string, limit = 10): Promise<SoundCloudTrack[]> {
  let cid = await getSoundCloudClientId(false);
  const doSearch = async (clientId: string) =>
    fetchJson<{ collection?: SoundCloudTrack[] }>(
      `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=${limit}`,
      undefined,
      5000,
    );

  try {
    const data = await doSearch(cid);
    return data.collection ?? [];
  } catch {
    cid = await getSoundCloudClientId(true);
    const data = await doSearch(cid);
    return data.collection ?? [];
  }
}

async function scrapeSoundCloudTracks(
  query: string,
  regionTag: 'ID' | 'ASIA' | 'GLOBAL' = 'GLOBAL',
  limit = 10,
): Promise<Track[]> {
  return withCache(`sc_search:${query}:${limit}`, 10 * 60 * 1000, async () => {
    const items = await searchSoundCloudRaw(query, limit);
    return items
      .filter((t) => t.title && t.user?.username && t.duration >= 45000 && t.policy !== 'BLOCK')
      .map((t) => {
        const rawArt = t.artwork_url || t.user?.avatar_url || '';
        const artwork = rawArt.replace('-large.', '-t500x500.');
        return {
          id: `sc-${t.id}`,
          scTrackId: t.id,
          title: t.title,
          artist: t.user?.username || 'Independent Artist',
          album: 'SoundCloud',
          durationSec: Math.round((t.duration || 0) / 1000),
          artwork,
          region: inferRegion(`${t.user?.username ?? ''} ${t.genre ?? ''}`, t.genre ?? '', regionTag),
          genre: t.genre || 'Music',
          source: 'soundcloud' as const,
        };
      });
  });
}

// ============================================================================
// JioSaavn Fallback Full-Track Resolver (320/160kbps AAC/MP4)
// ============================================================================

interface SaavnSearchResult {
  results?: Array<{
    id: string;
    song?: string;
    primary_artists?: string;
  }>;
}

interface SaavnDetailResult {
  [id: string]: {
    song?: string;
    primary_artists?: string;
    duration?: string;
    encrypted_media_url?: string;
    '320kbps'?: string;
  };
}

function decryptSaavnMediaUrl(encrypted: string): string {
  const key = Buffer.from('38346591', 'utf8');
  const decipher = crypto.createDecipheriv('des-ecb', key, null);
  decipher.setAutoPadding(true);
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted.replace('_96.mp4', '_160.mp4').replace('http://', 'https://');
}

async function resolveJioSaavnStream(title: string, artist: string, expectedDur: number): Promise<StreamResolution | null> {
  try {
    const query = `${title} ${artist.split(/,|&/)[0]}`.trim();
    const sr = await fetchJson<SaavnSearchResult>(
      `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&ctx=web6dot0&q=${encodeURIComponent(query)}`,
      undefined,
      6000,
    );
    const first = sr.results?.[0];
    if (!first?.id) return null;

    const detail = await fetchJson<SaavnDetailResult>(
      `https://www.jiosaavn.com/api.php?__call=song.getDetails&cc=in&_marker=0%3F_marker%3D0&_format=json&pids=${encodeURIComponent(first.id)}`,
      undefined,
      6000,
    );
    const item = detail[first.id];
    if (!item?.encrypted_media_url) return null;

    const dur = Number(item.duration || 0);
    if (expectedDur > 0 && dur > 0 && Math.abs(dur - expectedDur) > 45) {
      return null;
    }

    const titleNorm = normalizeText(title);
    const candNorm = normalizeText(item.song || '');
    if (!candNorm.includes(titleNorm.split(' ')[0] || '') && !titleNorm.includes(candNorm.split(' ')[0] || '')) {
      return null;
    }

    let url = decryptSaavnMediaUrl(item.encrypted_media_url);
    if (item['320kbps'] === 'true') {
      url = url.replace('_160.mp4', '_320.mp4');
    }
    if (!isValidExternalMediaUrl(url)) return null;

    return {
      streamUrl: `/api/audio-proxy?url=${encodeURIComponent(url)}`,
      mode: 'audio',
      source: 'jiosaavn',
      fullLength: true,
      durationSec: dur || expectedDur,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Smart Full-Track Stream Resolution
// ============================================================================

const UNWANTED_MODIFIER_WORDS = [
  '1 hour',
  '10 hour',
  'loop',
  'slowed',
  'reverb',
  'sped up',
  'nightcore',
  '8d',
  'karaoke',
  'instrumental',
  'cover',
  'pop punk',
  'koplo version',
  'remix',
  'dj ',
  'tiktok',
];

function isPlayableScTranscoding(tr: SoundCloudTranscoding): boolean {
  const proto = (tr.format?.protocol || '').toLowerCase();
  const urlLower = (tr.url || '').toLowerCase();
  if (!urlLower) return false;
  if (
    proto.includes('encrypt') ||
    proto.includes('cbc') ||
    proto.includes('ctr') ||
    proto.includes('drm') ||
    urlLower.includes('/cbcs/') ||
    urlLower.includes('encrypted')
  ) {
    return false;
  }
  return proto === 'progressive' || proto === 'hls';
}

function scoreSoundCloudCandidate(cand: SoundCloudTrack, title: string, artist: string, expectedDur: number): number {
  const transcodings = cand.media?.transcodings ?? [];
  if (!transcodings.some(isPlayableScTranscoding) || cand.policy === 'BLOCK') return -1000;

  let score = 0;
  const candTitle = normalizeText(cand.title || '');
  const candUser = normalizeText(cand.user?.username || '');
  const targetTitle = normalizeText(title);
  const targetArtist = normalizeText(artist.split(/,|&|feat\.|ft\./i)[0] || artist);

  const durSec = Math.round((cand.duration || 0) / 1000);

  // Full length vs 30s snippet
  if (cand.policy === 'ALLOW' || cand.policy === 'MONETIZE') {
    score += 40;
  } else if (cand.policy === 'SNIP' || durSec <= 35) {
    score -= 90;
  }

  if (durSec >= 60 && durSec <= 600) {
    score += 25;
  } else if (durSec > 900) {
    score -= 120; // Avoid 1-hour loops or DJ sets
  }

  // Duration closeness to canonical catalog duration
  if (expectedDur > 40 && durSec > 40) {
    const diff = Math.abs(durSec - expectedDur);
    if (diff <= 5) score += 60;
    else if (diff <= 15) score += 45;
    else if (diff <= 30) score += 20;
    else if (diff > 60) score -= 45;
  }

  // Title & Artist overlap
  const titleTokens = targetTitle.split(' ').filter((w) => w.length > 1);
  const matchedTokens = titleTokens.filter((w) => candTitle.includes(w));
  if (titleTokens.length > 0) {
    score += Math.round((matchedTokens.length / titleTokens.length) * 50);
  }
  if (candTitle === targetTitle || candTitle.includes(`${targetArtist} ${targetTitle}`)) {
    score += 25;
  }
  if (targetArtist && (candTitle.includes(targetArtist) || candUser.includes(targetArtist))) {
    score += 30;
  }

  // Penalize unwanted edits unless target title explicitly mentions them
  const rawLower = (cand.title || '').toLowerCase();
  const targetLower = title.toLowerCase();
  for (const mod of UNWANTED_MODIFIER_WORDS) {
    if (rawLower.includes(mod) && !targetLower.includes(mod)) {
      score -= 45;
    }
  }

  // Slight preference for tracks with non-snipped playable progressive or AAC HLS transcoding
  const hasFullTranscoding = transcodings.some((tr) => !tr.snipped && isPlayableScTranscoding(tr));
  if (hasFullTranscoding) score += 15;

  return score;
}

async function resolveScTranscoding(track: SoundCloudTrack): Promise<StreamResolution | null> {
  const cid = await getSoundCloudClientId(false);
  const playable = (track.media?.transcodings ?? []).filter(isPlayableScTranscoding);
  if (playable.length === 0) return null;

  const nonSnipped = playable.filter((tr) => !tr.snipped);
  const candidates = nonSnipped.length ? nonSnipped : playable;

  // Prefer progressive MP3/MP4 first, then HLS AAC (audio/mp4), then HLS MP3 (audio/mpegurl)
  const ordered = [...candidates].sort((a, b) => {
    const rank = (tr: SoundCloudTranscoding) => {
      if (tr.format?.protocol === 'progressive') return 0;
      if (tr.format?.protocol === 'hls' && tr.format?.mime_type?.includes('mp4')) return 1;
      if (tr.format?.protocol === 'hls') return 2;
      return 3;
    };
    return rank(a) - rank(b);
  });

  for (const tr of ordered) {
    try {
      const sep = tr.url.includes('?') ? '&' : '?';
      const resolved = await fetchJson<{ url?: string }>(`${tr.url}${sep}client_id=${cid}`, undefined, 4500);
      if (!resolved.url || !isValidExternalMediaUrl(resolved.url)) continue;

      const resolvedLower = resolved.url.toLowerCase();
      if (
        resolvedLower.includes('/cbcs/') ||
        resolvedLower.includes('/ctr/') ||
        resolvedLower.includes('skd://')
      ) {
        continue;
      }

      const isHls = tr.format?.protocol === 'hls' || resolvedLower.includes('.m3u8');
      const isFull =
        track.policy !== 'SNIP' &&
        !tr.snipped &&
        !resolvedLower.includes('/preview/') &&
        (track.duration || 0) > 40000;

      if (isHls && !HAS_FFMPEG) {
        return {
          streamUrl: `/api/hls-proxy?url=${encodeURIComponent(resolved.url)}`,
          mode: 'hls',
          source: 'soundcloud',
          fullLength: isFull,
          durationSec: Math.round((track.duration || 0) / 1000),
        };
      }

      return {
        streamUrl: isHls
          ? `/api/hls-audio?url=${encodeURIComponent(resolved.url)}`
          : `/api/audio-proxy?url=${encodeURIComponent(resolved.url)}`,
        mode: 'audio',
        source: 'soundcloud',
        fullLength: isFull,
        durationSec: Math.round((track.duration || 0) / 1000),
      };
    } catch {
      // Try next transcoding
    }
  }
  return null;
}

export async function resolveAudioStream(params: {
  title: string;
  artist: string;
  durationSec?: number;
  scTrackId?: number;
  previewUrl?: string;
}): Promise<StreamResolution> {
  const { title, artist, durationSec = 0, scTrackId, previewUrl } = params;
  const cacheKey = `stream:v2:${scTrackId || ''}:${normalizeText(title)}:${normalizeText(artist)}`;

  return withCache(cacheKey, 5 * 60 * 1000, async () => {
    const cleanArtist = artist.split(/,|&|feat\.|ft\./i)[0]?.trim() || artist;
    const cleanTitle = title
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || title;

    // 1. Direct SoundCloud track ID if known
    if (scTrackId) {
      try {
        const cid = await getSoundCloudClientId(false);
        const scTrack = await fetchJson<SoundCloudTrack>(
          `https://api-v2.soundcloud.com/tracks/${scTrackId}?client_id=${cid}`,
          undefined,
          4500,
        );
        const res = await resolveScTranscoding(scTrack);
        if (res) return res;
      } catch {
        // Continue to search
      }
    }

    // 2. SoundCloud search & smart scoring (clean non-DRM candidates)
    try {
      const queries = [`${cleanArtist} ${title}`];
      if (cleanTitle.toLowerCase() !== title.toLowerCase()) {
        queries.push(`${cleanArtist} ${cleanTitle}`);
      }

      for (const q of queries) {
        const results = await searchSoundCloudRaw(q, 14);
        const ranked = results
          .map((cand) => ({ cand, score: scoreSoundCloudCandidate(cand, title, artist, durationSec) }))
          .filter((x) => x.score > 15)
          .sort((a, b) => b.score - a.score);

        for (const item of ranked.slice(0, 4)) {
          const res = await resolveScTranscoding(item.cand);
          if (res && res.fullLength) {
            return res;
          }
        }
      }
    } catch {
      // Fall through to JioSaavn
    }

    // 3. JioSaavn full-track fallback
    const saavnRes = await resolveJioSaavnStream(cleanTitle, cleanArtist, durationSec);
    if (saavnRes) return saavnRes;

    // 4. Verified preview fallback (provided or fetched from iTunes & Deezer in parallel)
    let fallbackPreview = previewUrl && isValidExternalMediaUrl(previewUrl) ? previewUrl : undefined;
    if (!fallbackPreview) {
      const [itunesId, itunesUs, dz] = await Promise.allSettled([
        scrapeItunesSearch(`${cleanArtist} ${cleanTitle}`, 'id', 'GLOBAL', 4),
        scrapeItunesSearch(`${cleanArtist} ${cleanTitle}`, 'us', 'GLOBAL', 4),
        scrapeDeezerSearch(`${cleanArtist} ${cleanTitle}`, 'GLOBAL', 4),
      ]);
      const pool = [
        ...(itunesId.status === 'fulfilled' ? itunesId.value : []),
        ...(itunesUs.status === 'fulfilled' ? itunesUs.value : []),
        ...(dz.status === 'fulfilled' ? dz.value : []),
      ];
      fallbackPreview = pool.find((t) => t.previewUrl && isValidExternalMediaUrl(t.previewUrl))?.previewUrl;
    }

    if (fallbackPreview && isValidExternalMediaUrl(fallbackPreview)) {
      return {
        streamUrl: `/api/audio-proxy?url=${encodeURIComponent(fallbackPreview)}`,
        mode: 'audio',
        source: 'preview',
        fullLength: false,
        durationSec: 30,
      };
    }

    throw new Error('No playable audio stream found for this track');
  });
}

// ============================================================================
// High-Level Discovery, Charts, Genres, Search, Artist, Album, Lyrics
// ============================================================================

function interleaveLists(lists: Track[][]): Track[] {
  const out: Track[] = [];
  const maxLen = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      if (i < list.length) out.push(list[i]);
    }
  }
  return out;
}

export async function getDiscoverCatalog(scope: RegionScope = 'all'): Promise<DiscoverPayload> {
  return withCache(`discover:${scope}`, 12 * 60 * 1000, async () => {
    const [
      appleIdRes,
      appleJpRes,
      appleUsRes,
      deezerGlobalRes,
      ytmIdRes,
      ytmAsiaRes,
      tulusRes,
      dewa19Res,
      slankRes,
      sheilaRes,
      noahRes,
      bernadyaRes,
      hindiaRes,
      justinBieberRes,
      brunoMarsRes,
      newjeansRes,
      yoasobiRes,
      jayChouRes,
    ] = await Promise.allSettled([
      scrapeAppleChart('id', 'ID', 25),
      scrapeAppleChart('jp', 'ASIA', 20),
      scrapeAppleChart('us', 'GLOBAL', 15),
      scrapeDeezerChart(25),
      scrapeYTMusicSearch('Lagu Hits Indonesia Terbaru', 'ID', 'ID'),
      scrapeYTMusicSearch('K-Pop J-Pop Hits', 'KR', 'ASIA'),
      scrapeItunesSearch('Tulus', 'id', 'ID', 8),
      scrapeItunesSearch('Dewa 19', 'id', 'ID', 8),
      scrapeItunesSearch('Slank', 'id', 'ID', 8),
      scrapeItunesSearch('Sheila On 7', 'id', 'ID', 8),
      scrapeItunesSearch('NOAH', 'id', 'ID', 6),
      scrapeItunesSearch('Bernadya', 'id', 'ID', 6),
      scrapeItunesSearch('Hindia', 'id', 'ID', 8),
      scrapeItunesSearch('Justin Bieber', 'us', 'GLOBAL', 8),
      scrapeItunesSearch('Bruno Mars', 'us', 'GLOBAL', 6),
      scrapeItunesSearch('NewJeans', 'us', 'ASIA', 6),
      scrapeItunesSearch('YOASOBI', 'jp', 'ASIA', 6),
      scrapeItunesSearch('Jay Chou', 'tw', 'ASIA', 6),
    ]);

    const val = <T,>(r: PromiseSettledResult<T[]>) => (r.status === 'fulfilled' ? r.value : []);

    const tulus = val(tulusRes);
    const dewa19 = val(dewa19Res);
    const slank = val(slankRes);
    const sheila = val(sheilaRes);
    const noah = val(noahRes);
    const bernadya = val(bernadyaRes);
    const hindia = val(hindiaRes);
    const justin = val(justinBieberRes);
    const bruno = val(brunoMarsRes);
    const newjeans = val(newjeansRes);
    const yoasobi = val(yoasobiRes);
    const jayChou = val(jayChouRes);

    const indonesiaTop = deduplicateTracks([
      ...interleaveLists([tulus, dewa19, sheila, bernadya, slank]),
      ...val(appleIdRes),
      ...val(ytmIdRes),
    ]).slice(0, 30);

    const indonesiaLegends = deduplicateTracks(
      interleaveLists([dewa19, sheila, slank, noah, tulus]),
    ).slice(0, 24);

    const indonesiaIndie = deduplicateTracks([
      ...hindia,
      ...(await scrapeItunesSearch('Reality Club', 'id', 'ID', 6).catch(() => [])),
      ...(await scrapeItunesSearch('Sal Priadi', 'id', 'ID', 6).catch(() => [])),
    ]).slice(0, 18);

    const asiaSpotlight = deduplicateTracks([
      ...interleaveLists([newjeans, yoasobi, jayChou]),
      ...val(appleJpRes),
      ...val(ytmAsiaRes),
    ]).slice(0, 25);

    const globalTop = deduplicateTracks([
      ...interleaveLists([justin, bruno]),
      ...val(deezerGlobalRes),
      ...val(appleUsRes),
    ]).slice(0, 30);

    // Spotify-style Quick Mixes right at the top of Home
    const quickMixCandidates: Array<{ id: string; title: string; subtitle: string; tracks: Track[] }> = [
      { id: 'mix-tulus', title: 'Tulus Essentials', subtitle: 'Pop Indonesia', tracks: tulus },
      { id: 'mix-dewa19', title: 'Dewa 19 Classics', subtitle: 'Rock Legenda', tracks: dewa19 },
      { id: 'mix-sheila', title: 'Sheila On 7 Hits', subtitle: 'Nostalgia Band', tracks: sheila },
      { id: 'mix-slank', title: 'Slank Anthology', subtitle: 'Rock Indonesia', tracks: slank },
      { id: 'mix-justin', title: 'Justin Bieber Radio', subtitle: 'Global Pop', tracks: justin },
      { id: 'mix-newjeans', title: 'NewJeans & K-Pop', subtitle: 'Asian Spotlight', tracks: newjeans },
      { id: 'mix-hindia', title: 'Hindia & Indo Indie', subtitle: 'Indie Pilihan', tracks: hindia },
      { id: 'mix-yoasobi', title: 'YOASOBI & J-Pop', subtitle: 'Tokyo Charts', tracks: yoasobi },
    ];

    const quickMixes: QuickMix[] = quickMixCandidates
      .filter((m) => m.tracks.length > 0)
      .map((m) => ({
        id: m.id,
        title: m.title,
        subtitle: m.subtitle,
        artwork: m.tracks[0]?.artwork || '',
        tracks: m.tracks,
      }));

    // Prominent famous artists + chartmakers
    const artistMap = new Map<string, ArtistSummary>();
    const addArtistFromList = (list: Track[], forcedName?: string) => {
      const t = list[0];
      if (!t || !t.artwork) return;
      const primary = forcedName || t.artist.split(/,|&|feat\.|ft\./i)[0]?.trim() || t.artist;
      const key = normalizeText(primary);
      if (!key || artistMap.has(key)) return;
      artistMap.set(key, {
        id: `artist-${encodeURIComponent(primary)}`,
        name: primary,
        artwork: t.artwork,
        genre: t.genre,
        region: t.region,
      });
    };

    if (scope !== 'asia' && scope !== 'global') {
      addArtistFromList(dewa19, 'Dewa 19');
      addArtistFromList(tulus, 'Tulus');
      addArtistFromList(sheila, 'Sheila On 7');
      addArtistFromList(slank, 'Slank');
      addArtistFromList(bernadya, 'Bernadya');
      addArtistFromList(hindia, 'Hindia');
      addArtistFromList(noah, 'NOAH');
    }
    if (scope !== 'id') {
      addArtistFromList(justin, 'Justin Bieber');
      addArtistFromList(bruno, 'Bruno Mars');
      addArtistFromList(newjeans, 'NewJeans');
      addArtistFromList(yoasobi, 'YOASOBI');
      addArtistFromList(jayChou, 'Jay Chou');
    }

    const pool =
      scope === 'id'
        ? [...indonesiaTop, ...indonesiaIndie]
        : scope === 'asia'
          ? asiaSpotlight
          : scope === 'global'
            ? globalTop
            : [...indonesiaTop, ...asiaSpotlight, ...globalTop];

    for (const t of pool) {
      const primary = t.artist.split(/,|&|feat\.|ft\./i)[0]?.trim() || t.artist;
      const key = normalizeText(primary);
      if (!key || artistMap.has(key) || !t.artwork) continue;
      artistMap.set(key, {
        id: `artist-${encodeURIComponent(primary)}`,
        name: primary,
        artwork: t.artwork,
        genre: t.genre,
        region: t.region,
      });
    }

    // Extract Featured Albums from real scraped tracks
    const albumMap = new Map<string, AlbumSummary>();
    for (const t of [...indonesiaLegends, ...indonesiaTop, ...globalTop, ...asiaSpotlight]) {
      if (!t.album || t.album === 'Single' || t.album === 'Top Charts' || t.album === 'SoundCloud') continue;
      const primaryArtist = t.artist.split(/,|&|feat\.|ft\./i)[0]?.trim() || t.artist;
      const key = `${normalizeText(t.album)}::${normalizeText(primaryArtist)}`;
      if (albumMap.has(key) || !t.artwork) continue;
      albumMap.set(key, {
        id: `album-${encodeURIComponent(t.album)}-${encodeURIComponent(primaryArtist)}`,
        title: t.album,
        artist: primaryArtist,
        artwork: t.artwork,
        releaseYear: t.releaseYear,
      });
    }

    const featured =
      scope === 'id'
        ? tulus[0] || dewa19[0] || indonesiaTop[0] || null
        : scope === 'asia'
          ? newjeans[0] || yoasobi[0] || asiaSpotlight[0] || null
          : scope === 'global'
            ? justin[0] || bruno[0] || globalTop[0] || null
            : tulus[0] || justin[0] || dewa19[0] || indonesiaTop[0] || null;

    return {
      featured,
      quickMixes,
      indonesiaTop,
      indonesiaLegends,
      indonesiaIndie,
      asiaSpotlight,
      globalTop,
      trendingArtists: Array.from(artistMap.values()).slice(0, 16),
      featuredAlbums: Array.from(albumMap.values()).slice(0, 14),
      fetchedAt: new Date().toISOString(),
    };
  });
}

const GENRE_QUERIES: Record<
  string,
  {
    queries: Array<{ q: string; country: 'id' | 'jp' | 'kr' | 'us' | 'tw'; region: 'ID' | 'ASIA' | 'GLOBAL' }>;
    ytmQuery: string;
    ytmGl: 'ID' | 'KR' | 'JP' | 'US';
  }
> = {
  'indo-legends': {
    queries: [
      { q: 'Dewa 19', country: 'id', region: 'ID' },
      { q: 'Slank', country: 'id', region: 'ID' },
      { q: 'Sheila On 7', country: 'id', region: 'ID' },
      { q: 'NOAH', country: 'id', region: 'ID' },
      { q: 'Padi', country: 'id', region: 'ID' },
    ],
    ytmQuery: 'Lagu Band Legendaris Indonesia',
    ytmGl: 'ID',
  },
  'pop-indonesia': {
    queries: [
      { q: 'Tulus', country: 'id', region: 'ID' },
      { q: 'Bernadya', country: 'id', region: 'ID' },
      { q: 'Mahalini', country: 'id', region: 'ID' },
      { q: 'Juicy Luicy', country: 'id', region: 'ID' },
      { q: 'Raisa', country: 'id', region: 'ID' },
    ],
    ytmQuery: 'Pop Indonesia Terpopuler',
    ytmGl: 'ID',
  },
  'indo-indie': {
    queries: [
      { q: 'Hindia', country: 'id', region: 'ID' },
      { q: 'Sal Priadi', country: 'id', region: 'ID' },
      { q: 'Reality Club', country: 'id', region: 'ID' },
      { q: 'Sheila On 7', country: 'id', region: 'ID' },
      { q: 'Fourtwnty', country: 'id', region: 'ID' },
    ],
    ytmQuery: 'Indie Indonesia Terbaik',
    ytmGl: 'ID',
  },
  'dangdut-koplo': {
    queries: [
      { q: 'Denny Caknan', country: 'id', region: 'ID' },
      { q: 'Happy Asmara', country: 'id', region: 'ID' },
      { q: 'Guyon Waton', country: 'id', region: 'ID' },
      { q: 'Ndarboy Genk', country: 'id', region: 'ID' },
    ],
    ytmQuery: 'Dangdut Koplo Viral',
    ytmGl: 'ID',
  },
  kpop: {
    queries: [
      { q: 'NewJeans', country: 'us', region: 'ASIA' },
      { q: 'aespa', country: 'us', region: 'ASIA' },
      { q: 'IVE', country: 'us', region: 'ASIA' },
      { q: 'SEVENTEEN', country: 'us', region: 'ASIA' },
      { q: 'BLACKPINK', country: 'us', region: 'ASIA' },
    ],
    ytmQuery: 'K-Pop Top Hits',
    ytmGl: 'KR',
  },
  'jpop-anime': {
    queries: [
      { q: 'YOASOBI', country: 'jp', region: 'ASIA' },
      { q: 'Kenshi Yonezu', country: 'jp', region: 'ASIA' },
      { q: 'Fujii Kaze', country: 'jp', region: 'ASIA' },
      { q: 'Ado', country: 'jp', region: 'ASIA' },
      { q: 'Official HIGE DANdism', country: 'jp', region: 'ASIA' },
    ],
    ytmQuery: 'J-Pop Anime Hits',
    ytmGl: 'JP',
  },
  mandopop: {
    queries: [
      { q: 'Jay Chou', country: 'tw', region: 'ASIA' },
      { q: 'Eric Chou', country: 'tw', region: 'ASIA' },
      { q: 'JJ Lin', country: 'tw', region: 'ASIA' },
      { q: 'Mayday', country: 'tw', region: 'ASIA' },
    ],
    ytmQuery: 'Mandopop Hits',
    ytmGl: 'US',
  },
  'global-pop': {
    queries: [
      { q: 'Taylor Swift', country: 'us', region: 'GLOBAL' },
      { q: 'Sabrina Carpenter', country: 'us', region: 'GLOBAL' },
      { q: 'Billie Eilish', country: 'us', region: 'GLOBAL' },
      { q: 'Bruno Mars', country: 'us', region: 'GLOBAL' },
      { q: 'The Weeknd', country: 'us', region: 'GLOBAL' },
    ],
    ytmQuery: 'Global Pop Hits',
    ytmGl: 'US',
  },
  'rnb-soul': {
    queries: [
      { q: 'NIKI', country: 'us', region: 'GLOBAL' },
      { q: 'SZA', country: 'us', region: 'GLOBAL' },
      { q: 'Daniel Caesar', country: 'us', region: 'GLOBAL' },
      { q: 'Frank Ocean', country: 'us', region: 'GLOBAL' },
    ],
    ytmQuery: 'R&B Soul Essentials',
    ytmGl: 'US',
  },
  hiphop: {
    queries: [
      { q: 'Kendrick Lamar', country: 'us', region: 'GLOBAL' },
      { q: 'Drake', country: 'us', region: 'GLOBAL' },
      { q: 'Rich Brian', country: 'us', region: 'GLOBAL' },
      { q: 'Travis Scott', country: 'us', region: 'GLOBAL' },
    ],
    ytmQuery: 'Hip-Hop Essentials',
    ytmGl: 'US',
  },
  'lofi-chill': {
    queries: [
      { q: 'keshi', country: 'us', region: 'ASIA' },
      { q: 'joji', country: 'us', region: 'ASIA' },
      { q: 'wave to earth', country: 'us', region: 'ASIA' },
      { q: 'Nujabes', country: 'us', region: 'ASIA' },
    ],
    ytmQuery: 'Lofi Chill Beats',
    ytmGl: 'US',
  },
};

export async function getGenreTracks(genreId: string): Promise<Track[]> {
  const cfg = GENRE_QUERIES[genreId];
  if (!cfg) {
    return (await getDiscoverCatalog('all')).indonesiaTop;
  }

  return withCache(`genre:${genreId}`, 15 * 60 * 1000, async () => {
    const settled = await Promise.allSettled([
      ...cfg.queries.map((q) => scrapeItunesSearch(q.q, q.country, q.region, 7)),
      scrapeYTMusicSearch(cfg.ytmQuery, cfg.ytmGl, cfg.queries[0].region),
    ]);

    const lists: Track[][] = [];
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value.length > 0) {
        lists.push(r.value);
      }
    }
    return deduplicateTracks(interleaveLists(lists)).slice(0, 30);
  });
}

export async function searchCatalog(query: string): Promise<SearchPayload> {
  const clean = query.trim();
  if (!clean) {
    return { query: '', tracks: [], artists: [], albums: [] };
  }

  return withCache(`search:${clean.toLowerCase()}`, 8 * 60 * 1000, async () => {
    const [ytmId, itunesId, itunesUs, deezer, sc] = await Promise.allSettled([
      scrapeYTMusicSearch(clean, 'ID', 'GLOBAL'),
      scrapeItunesSearch(clean, 'id', 'ID', 15),
      scrapeItunesSearch(clean, 'us', 'GLOBAL', 12),
      scrapeDeezerSearch(clean, 'GLOBAL', 12),
      scrapeSoundCloudTracks(clean, 'GLOBAL', 8),
    ]);

    const grab = (r: PromiseSettledResult<Track[]>) => (r.status === 'fulfilled' ? r.value : []);

    // Prioritize crisp catalog metadata (iTunes + Deezer + YTMusic) and include SoundCloud indie/remixes
    const merged = deduplicateTracks([
      ...grab(itunesId),
      ...grab(deezer),
      ...grab(ytmId),
      ...grab(itunesUs),
      ...grab(sc),
    ]).slice(0, 40);

    const artistMap = new Map<string, ArtistSummary>();
    const albumMap = new Map<string, AlbumSummary>();

    for (const t of merged) {
      const artistName = t.artist.split(/,|&|feat\.|ft\./i)[0]?.trim() || t.artist;
      const aKey = normalizeText(artistName);
      if (aKey && !artistMap.has(aKey) && t.artwork) {
        artistMap.set(aKey, {
          id: `artist-${encodeURIComponent(artistName)}`,
          name: artistName,
          artwork: t.artwork,
          genre: t.genre,
          region: t.region,
        });
      }

      if (t.album && t.album !== 'Single' && t.album !== 'SoundCloud' && t.album !== 'Top Charts') {
        const albKey = `${normalizeText(t.album)}::${aKey}`;
        if (!albumMap.has(albKey) && t.artwork) {
          albumMap.set(albKey, {
            id: `album-${encodeURIComponent(t.album)}-${encodeURIComponent(artistName)}`,
            title: t.album,
            artist: artistName,
            artwork: t.artwork,
            releaseYear: t.releaseYear,
          });
        }
      }
    }

    return {
      query: clean,
      tracks: merged,
      artists: Array.from(artistMap.values()).slice(0, 8),
      albums: Array.from(albumMap.values()).slice(0, 8),
    };
  });
}

interface YtmArtistProfileData {
  name?: string;
  bannerArtwork?: string;
  bio?: string;
  monthlyListenersText?: string;
  subscribersText?: string;
  playCountByTitle: Map<string, string>;
  topTracks: Track[];
  albums: AlbumSummary[];
  singles: AlbumSummary[];
  videos: ArtistVideoItem[];
  relatedArtists: ArtistRelatedItem[];
}

async function scrapeYTMusicArtistProfile(artistName: string): Promise<YtmArtistProfileData | null> {
  return withCache(`ytm_artist_profile:${artistName.toLowerCase()}`, 20 * 60 * 1000, async () => {
    const searchRes = await fetchJson<unknown>(
      'https://music.youtube.com/youtubei/v1/search?prettyPrint=false',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://music.youtube.com',
          Referer: 'https://music.youtube.com/',
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB_REMIX',
              clientVersion: '1.20241101.01.00',
              hl: 'en',
              gl: 'ID',
            },
          },
          query: artistName,
          params: 'EgWKAQIgAWoMEAMQBBAJEAoQBRAV',
        }),
      },
      7000,
    );

    const renderers: Record<string, unknown>[] = [];
    collectYtmRenderers(searchRes, renderers);

    let browseId: string | undefined;
    const targetNorm = normalizeText(artistName);
    for (const r of renderers) {
      const flexCols = (r.flexColumns as Array<{ musicResponsiveListItemFlexColumnRenderer?: { text?: unknown } }>) ?? [];
      const candidateName = extractTextRuns(flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text);
      const navId = (
        r.navigationEndpoint as { browseEndpoint?: { browseId?: string } } | undefined
      )?.browseEndpoint?.browseId;
      if (navId && navId.startsWith('UC')) {
        if (!browseId) browseId = navId;
        if (normalizeText(candidateName) === targetNorm || normalizeText(candidateName).includes(targetNorm)) {
          browseId = navId;
          break;
        }
      }
    }

    if (!browseId) {
      const fallbackMatch = JSON.stringify(searchRes).match(/"browseId":"(UC[^"]+)"/);
      browseId = fallbackMatch?.[1];
    }
    if (!browseId) return null;

    const browseRes = await fetchJson<Record<string, unknown>>(
      'https://music.youtube.com/youtubei/v1/browse?prettyPrint=false',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://music.youtube.com',
          Referer: 'https://music.youtube.com/',
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB_REMIX',
              clientVersion: '1.20241101.01.00',
              hl: 'en',
              gl: 'ID',
            },
          },
          browseId,
        }),
      },
      7500,
    );

    const headerWrapper = browseRes.header as
      | {
          musicImmersiveHeaderRenderer?: Record<string, unknown>;
          musicVisualHeaderRenderer?: Record<string, unknown>;
        }
      | undefined;
    const header =
      headerWrapper?.musicImmersiveHeaderRenderer || headerWrapper?.musicVisualHeaderRenderer;

    const resolvedName = extractTextRuns(header?.title) || artistName;
    const rawMonthly = extractTextRuns(header?.monthlyListenerCount);
    const monthlyListenersText = rawMonthly
      ? rawMonthly.replace(/\s*monthly audience/i, '').trim()
      : undefined;
    const subscribersText =
      extractTextRuns(
        (
          header?.subscriptionButton as
            | { subscribeButtonRenderer?: { subscriberCountText?: unknown } }
            | undefined
        )?.subscribeButtonRenderer?.subscriberCountText,
      ) || undefined;
    const bio = extractTextRuns(header?.description) || undefined;

    const headerThumbs = (
      header?.thumbnail as {
        musicThumbnailRenderer?: { thumbnail?: { thumbnails?: Array<{ url?: string }> } };
      }
    )?.musicThumbnailRenderer?.thumbnail?.thumbnails;
    const bannerArtwork = headerThumbs?.[headerThumbs.length - 1]?.url || '';

    const sections =
      (
        browseRes.contents as {
          singleColumnBrowseResultsRenderer?: {
            tabs?: Array<{
              tabRenderer?: {
                content?: {
                  sectionListRenderer?: { contents?: Array<Record<string, unknown>> };
                };
              };
            }>;
          };
        }
      )?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer
        ?.contents ?? [];

    const playCountByTitle = new Map<string, string>();
    const topTracks: Track[] = [];
    const albums: AlbumSummary[] = [];
    const singles: AlbumSummary[] = [];
    const videos: ArtistVideoItem[] = [];
    const relatedArtists: ArtistRelatedItem[] = [];

    for (const sec of sections) {
      if (sec.musicShelfRenderer) {
        const shelf = sec.musicShelfRenderer as { contents?: Array<Record<string, unknown>> };
        for (const entry of shelf.contents ?? []) {
          const r = entry.musicResponsiveListItemRenderer as Record<string, unknown> | undefined;
          if (!r) continue;
          const videoId = (r.playlistItemData as { videoId?: string } | undefined)?.videoId;
          const flexCols =
            (r.flexColumns as Array<{
              musicResponsiveListItemFlexColumnRenderer?: { text?: unknown };
            }>) ?? [];
          const title = extractTextRuns(flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text);
          const col1 = extractTextRuns(flexCols[1]?.musicResponsiveListItemFlexColumnRenderer?.text);
          const col2 = extractTextRuns(flexCols[2]?.musicResponsiveListItemFlexColumnRenderer?.text);
          const col3 = extractTextRuns(flexCols[3]?.musicResponsiveListItemFlexColumnRenderer?.text);

          const playsCandidate = [col1, col2, col3].find((c) => /\bplays?\b/i.test(c));
          const playCountText = playsCandidate?.trim();
          const albumCandidate =
            col3 && !/\bplays?\b/i.test(col3)
              ? col3
              : col2 && !/\bplays?\b/i.test(col2)
                ? col2
                : 'Single';

          if (title && playCountText) {
            playCountByTitle.set(normalizeText(title), playCountText);
          }

          const thumbs = (
            r.thumbnail as {
              musicThumbnailRenderer?: { thumbnail?: { thumbnails?: Array<{ url?: string }> } };
            }
          )?.musicThumbnailRenderer?.thumbnail?.thumbnails;
          const art = (thumbs?.[thumbs.length - 1]?.url || '').replace(
            /=w\d+-h\d+[^=]*/,
            '=w544-h544-l90-rj',
          );

          if (title && videoId) {
            topTracks.push({
              id: `ytm-${videoId}`,
              title,
              artist: col1 && !/\bplays?\b/i.test(col1) ? col1 : resolvedName,
              album: albumCandidate,
              durationSec: 0,
              artwork: art,
              region: inferRegion(resolvedName, '', 'GLOBAL'),
              genre: 'Music',
              source: 'ytmusic',
              playCountText,
            });
          }
        }
      }

      if (sec.musicCarouselShelfRenderer) {
        const carousel = sec.musicCarouselShelfRenderer as {
          header?: { musicCarouselShelfBasicHeaderRenderer?: { title?: unknown } };
          contents?: Array<{ musicTwoRowItemRenderer?: Record<string, unknown> }>;
        };
        const shelfTitle = extractTextRuns(
          carousel.header?.musicCarouselShelfBasicHeaderRenderer?.title,
        ).toLowerCase();

        for (const item of carousel.contents ?? []) {
          const card = item.musicTwoRowItemRenderer;
          if (!card) continue;
          const cardTitle = extractTextRuns(card.title);
          const cardSub = extractTextRuns(card.subtitle);
          const thumbs = (
            card.thumbnailRenderer as {
              musicThumbnailRenderer?: { thumbnail?: { thumbnails?: Array<{ url?: string }> } };
            }
          )?.musicThumbnailRenderer?.thumbnail?.thumbnails;
          const cardArt = (thumbs?.[thumbs.length - 1]?.url || '').replace(
            /=w\d+-h\d+[^=]*/,
            '=w544-h544-l90-rj',
          );
          const navBrowseId = (
            card.navigationEndpoint as { browseEndpoint?: { browseId?: string } } | undefined
          )?.browseEndpoint?.browseId;

          if (!cardTitle) continue;

          if (shelfTitle === 'albums') {
            albums.push({
              id: `ytm-alb-${encodeURIComponent(navBrowseId || cardTitle)}`,
              title: cardTitle,
              artist: resolvedName,
              artwork: cardArt,
              releaseYear: cardSub.match(/\b(19|20)\d{2}\b/)?.[0],
              releaseType: 'Album',
            });
          } else if (shelfTitle.includes('single')) {
            singles.push({
              id: `ytm-sgl-${encodeURIComponent(navBrowseId || cardTitle)}`,
              title: cardTitle,
              artist: resolvedName,
              artwork: cardArt,
              releaseYear: cardSub.match(/\b(19|20)\d{2}\b/)?.[0],
              releaseType: cardSub.toLowerCase().includes('ep') ? 'EP' : 'Single',
            });
          } else if (shelfTitle.includes('video') || shelfTitle.includes('live')) {
            const vidId = (
              card.navigationEndpoint as { watchEndpoint?: { videoId?: string } } | undefined
            )?.watchEndpoint?.videoId;
            videos.push({
              id: `ytm-vid-${vidId || encodeURIComponent(cardTitle)}`,
              title: cardTitle,
              subtitle: cardSub,
              thumbnail: thumbs?.[thumbs.length - 1]?.url || cardArt,
            });
          } else if (shelfTitle.includes('fans might also like') || shelfTitle.includes('similar')) {
            relatedArtists.push({
              id: `rel-${encodeURIComponent(navBrowseId || cardTitle)}`,
              name: cardTitle,
              artwork: cardArt,
              monthlyListenersText: cardSub
                ? cardSub.replace(/\s*monthly audience/i, '').trim()
                : undefined,
            });
          }
        }
      }
    }

    return {
      name: resolvedName,
      bannerArtwork,
      bio,
      monthlyListenersText,
      subscribersText,
      playCountByTitle,
      topTracks,
      albums,
      singles,
      videos,
      relatedArtists,
    };
  });
}

async function scrapeDeezerArtistStats(
  artistName: string,
): Promise<{ nbFan?: number; nbAlbum?: number; picture?: string } | null> {
  return withCache(`deezer_artist:${artistName.toLowerCase()}`, 20 * 60 * 1000, async () => {
    const data = await fetchJson<{
      data?: Array<{
        id?: number;
        name?: string;
        nb_fan?: number;
        nb_album?: number;
        picture_xl?: string;
        picture_big?: string;
      }>;
    }>(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=5`, undefined, 6000);

    const targetNorm = normalizeText(artistName);
    const list = data.data ?? [];
    const exact =
      list.find((a) => normalizeText(a.name || '') === targetNorm) ||
      list.find((a) => normalizeText(a.name || '').includes(targetNorm)) ||
      list[0];
    if (!exact) return null;
    return {
      nbFan: exact.nb_fan,
      nbAlbum: exact.nb_album,
      picture: exact.picture_xl || exact.picture_big,
    };
  });
}

export async function getArtistDetail(artistName: string): Promise<ArtistDetailPayload> {
  const clean = artistName.trim();
  return withCache(`artist_v2:${clean.toLowerCase()}`, 15 * 60 * 1000, async () => {
    const [itunesId, itunesUs, deezer, ytm, ytmProfileRes, dzStatsRes] = await Promise.allSettled([
      scrapeItunesSearch(clean, 'id', 'ID', 20),
      scrapeItunesSearch(clean, 'us', 'GLOBAL', 15),
      scrapeDeezerSearch(clean, 'GLOBAL', 15),
      scrapeYTMusicSearch(clean, 'ID', 'GLOBAL'),
      scrapeYTMusicArtistProfile(clean),
      scrapeDeezerArtistStats(clean),
    ]);

    const grab = (r: PromiseSettledResult<Track[]>) => (r.status === 'fulfilled' ? r.value : []);
    const ytmProfile = ytmProfileRes.status === 'fulfilled' ? ytmProfileRes.value : null;
    const dzStats = dzStatsRes.status === 'fulfilled' ? dzStatsRes.value : null;
    const targetNorm = normalizeText(clean);

    const all = deduplicateTracks([
      ...(ytmProfile?.topTracks ?? []),
      ...grab(itunesId),
      ...grab(deezer),
      ...grab(itunesUs),
      ...grab(ytm),
    ]);
    const matching = all.filter(
      (t) =>
        normalizeText(t.artist).includes(targetNorm) ||
        targetNorm.includes(normalizeText(t.artist.split(/,|&/)[0] || '')),
    );
    const baseTracks = (matching.length >= 3 ? matching : all).slice(0, 25);

    // Attach scraped real play counts & fill durations from matching catalog entries
    const topTracks = baseTracks.map((t) => {
      if (!t.playCountText && ytmProfile?.playCountByTitle) {
        const matchedPlays = ytmProfile.playCountByTitle.get(normalizeText(t.title));
        if (matchedPlays) {
          return { ...t, playCountText: matchedPlays };
        }
      }
      return t;
    });

    const albumMap = new Map<string, AlbumSummary>();
    for (const alb of ytmProfile?.albums ?? []) {
      const key = normalizeText(alb.title);
      if (key && !albumMap.has(key)) {
        albumMap.set(key, alb);
      }
    }
    for (const t of topTracks) {
      if (!t.album || t.album === 'Single' || t.album === 'SoundCloud') continue;
      const key = normalizeText(t.album);
      if (!albumMap.has(key) && t.artwork) {
        albumMap.set(key, {
          id: `album-${encodeURIComponent(t.album)}-${encodeURIComponent(clean)}`,
          title: t.album,
          artist: clean,
          artwork: t.artwork,
          releaseYear: t.releaseYear,
          releaseType: 'Album',
          collectionId: t.collectionId,
        });
      }
    }

    const albumsList = Array.from(albumMap.values()).slice(0, 14);
    const singlesList = (ytmProfile?.singles ?? []).slice(0, 12);

    return {
      name: ytmProfile?.name || clean,
      artwork: dzStats?.picture || topTracks[0]?.artwork || '',
      bannerArtwork: ytmProfile?.bannerArtwork || dzStats?.picture || topTracks[0]?.artwork || '',
      genre: topTracks[0]?.genre || 'Music',
      region: inferRegion(clean, topTracks[0]?.genre || '', 'GLOBAL'),
      verified: Boolean(ytmProfile?.monthlyListenersText || (dzStats?.nbFan && dzStats.nbFan > 100)),
      bio: ytmProfile?.bio,
      monthlyListenersText: ytmProfile?.monthlyListenersText,
      subscribersText: ytmProfile?.subscribersText,
      fansCount: dzStats?.nbFan,
      totalAlbumsCount:
        dzStats?.nbAlbum || albumsList.length + singlesList.length || undefined,
      topTracks,
      albums: albumsList,
      singles: singlesList,
      videos: (ytmProfile?.videos ?? []).slice(0, 10),
      relatedArtists: (ytmProfile?.relatedArtists ?? []).slice(0, 10),
    };
  });
}

export async function getAlbumDetail(title: string, artist: string): Promise<AlbumDetailPayload> {
  const query = `${artist} ${title}`.trim();
  return withCache(`album_v2:${query.toLowerCase()}`, 15 * 60 * 1000, async () => {
    // 1. Try finding the exact iTunes collection for ordered tracklist + record label
    let collectionMeta: {
      collectionId?: number;
      copyright?: string;
      releaseDate?: string;
      primaryGenreName?: string;
      artworkUrl100?: string;
      trackCount?: number;
    } | null = null;
    let lookupTracks: Track[] = [];

    try {
      const albSearch = await fetchJson<ItunesSearchResult>(
        `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=5`,
        undefined,
        6000,
      );
      const titleNorm = normalizeText(title);
      const albHit =
        (albSearch.results ?? []).find((a) => normalizeText(a.collectionName || '') === titleNorm) ||
        (albSearch.results ?? [])[0];
      if (albHit?.collectionId) {
        collectionMeta = albHit;
        const lookup = await fetchJson<ItunesSearchResult>(
          `https://itunes.apple.com/lookup?id=${albHit.collectionId}&entity=song`,
          undefined,
          6500,
        );
        const rows = lookup.results ?? [];
        const colRow = rows.find((r) => r.wrapperType === 'collection');
        if (colRow) {
          collectionMeta = { ...collectionMeta, ...colRow };
        }
        lookupTracks = rows
          .filter((r) => r.wrapperType === 'track' && r.trackId && r.trackName)
          .sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0))
          .map((r) => ({
            id: `itunes-${r.trackId}`,
            title: r.trackName!,
            artist: r.artistName || artist,
            album: r.collectionName || title,
            durationSec: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : 0,
            artwork: upscaleItunesArt(r.artworkUrl100 || collectionMeta?.artworkUrl100),
            region: inferRegion(r.artistName || artist, r.primaryGenreName || '', 'GLOBAL'),
            genre: r.primaryGenreName || collectionMeta?.primaryGenreName || 'Music',
            source: 'itunes' as const,
            previewUrl: r.previewUrl,
            releaseYear: r.releaseDate?.slice(0, 4),
            explicit: r.trackExplicitness === 'explicit',
            trackNumber: r.trackNumber,
            collectionId: r.collectionId,
          }));
      }
    } catch {
      // Fallback to multi-source track search
    }

    let tracks = lookupTracks;
    if (tracks.length === 0) {
      const [itunesId, itunesUs, deezer] = await Promise.allSettled([
        scrapeItunesSearch(query, 'id', 'ID', 20),
        scrapeItunesSearch(query, 'us', 'GLOBAL', 20),
        scrapeDeezerSearch(query, 'GLOBAL', 15),
      ]);
      const grab = (r: PromiseSettledResult<Track[]>) => (r.status === 'fulfilled' ? r.value : []);
      const all = deduplicateTracks([...grab(itunesId), ...grab(itunesUs), ...grab(deezer)]);
      const titleNorm = normalizeText(title);
      const filtered = all.filter(
        (t) =>
          normalizeText(t.album).includes(titleNorm) || titleNorm.includes(normalizeText(t.album)),
      );
      tracks = (filtered.length >= 2 ? filtered : all).slice(0, 20);
    }

    const totalDurationSec = tracks.reduce((acc, t) => acc + (t.durationSec || 0), 0);
    const releaseDate = collectionMeta?.releaseDate?.slice(0, 10);

    return {
      title,
      artist,
      artwork: upscaleItunesArt(collectionMeta?.artworkUrl100) || tracks[0]?.artwork || '',
      releaseYear: releaseDate?.slice(0, 4) || tracks[0]?.releaseYear,
      releaseDate,
      genre: collectionMeta?.primaryGenreName || tracks[0]?.genre,
      recordLabel: collectionMeta?.copyright,
      trackCount: collectionMeta?.trackCount || tracks.length,
      totalDurationSec,
      tracks,
    };
  });
}

function parseLrcLines(lrc: string): SyncedLyricLine[] {
  const lines: SyncedLyricLine[] = [];
  const regex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)/;
  for (const rawLine of lrc.split('\n')) {
    const m = rawLine.match(regex);
    if (!m) continue;
    const min = Number(m[1]);
    const sec = Number(m[2]);
    const frac = m[3] ? Number(m[3].padEnd(3, '0')) / 1000 : 0;
    const text = m[4].trim();
    if (text) {
      lines.push({ timeSec: min * 60 + sec + frac, text });
    }
  }
  return lines;
}

interface LrclibItem {
  trackName?: string;
  artistName?: string;
  duration?: number;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}

export async function getTrackLyrics(params: {
  title: string;
  artist: string;
  album?: string;
  durationSec?: number;
}): Promise<LyricsPayload> {
  const { title, artist, album, durationSec } = params;
  const cleanArtist = artist.split(/,|&|feat\.|ft\./i)[0]?.trim() || artist;
  const cleanTitle = title
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+-\s+(remastered|live|acoustic|single|radio edit|version).*$/i, '')
    .trim();

  return withCache(`lyrics:${normalizeText(cleanTitle)}:${normalizeText(cleanArtist)}`, 60 * 60 * 1000, async () => {
    try {
      const qs = new URLSearchParams({
        track_name: cleanTitle,
        artist_name: cleanArtist,
      });
      if (album && album !== 'Single' && album !== 'Top Charts') qs.set('album_name', album);
      if (durationSec && durationSec > 0) qs.set('duration', String(durationSec));

      const data = await fetchJson<LrclibItem>(`https://lrclib.net/api/get?${qs.toString()}`, undefined, 6000);

      if (data.syncedLyrics) {
        const lines = parseLrcLines(data.syncedLyrics);
        if (lines.length > 0) {
          return {
            found: true,
            synced: true,
            lines,
            plainText: data.plainLyrics || lines.map((l) => l.text).join('\n'),
            sourceName: 'Audixify Lyrics',
          };
        }
      }
      if (data.plainLyrics) {
        return {
          found: true,
          synced: false,
          lines: [],
          plainText: data.plainLyrics,
          sourceName: 'Audixify Lyrics',
        };
      }
    } catch {
      // Fallback to LRCLIB search with smart scoring
    }

    try {
      const results = await fetchJson<LrclibItem[]>(
        `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanArtist} ${cleanTitle}`)}`,
        undefined,
        6000,
      );

      const targetTitleNorm = normalizeText(cleanTitle);
      const targetArtistNorm = normalizeText(cleanArtist);

      const scored = results
        .filter((r) => r.syncedLyrics || r.plainLyrics)
        .map((r) => {
          let score = 0;
          const rTitle = normalizeText(r.trackName || '');
          const rArtist = normalizeText(r.artistName || '');
          if (rTitle === targetTitleNorm) score += 45;
          else if (rTitle.includes(targetTitleNorm) || targetTitleNorm.includes(rTitle)) score += 20;
          if (rArtist.includes(targetArtistNorm) || targetArtistNorm.includes(rArtist)) score += 35;
          if (r.syncedLyrics) score += 25;
          if (durationSec && r.duration) {
            const diff = Math.abs(r.duration - durationSec);
            if (diff <= 4) score += 30;
            else if (diff <= 12) score += 15;
            else if (diff > 45) score -= 25;
          }
          if (/\blive\b|\bkaraoke\b|\bcover\b/i.test(r.trackName || '')) score -= 40;
          return { r, score };
        })
        .sort((a, b) => b.score - a.score);

      const best = scored[0]?.score > 20 ? scored[0].r : undefined;
      if (best?.syncedLyrics) {
        const lines = parseLrcLines(best.syncedLyrics);
        if (lines.length > 0) {
          return {
            found: true,
            synced: true,
            lines,
            plainText: best.plainLyrics || lines.map((l) => l.text).join('\n'),
            sourceName: 'Audixify Lyrics',
          };
        }
      }
      if (best?.plainLyrics) {
        return {
          found: true,
          synced: false,
          lines: [],
          plainText: best.plainLyrics,
          sourceName: 'Audixify Lyrics',
        };
      }
    } catch {
      // Not found
    }

    return {
      found: false,
      synced: false,
      lines: [],
      plainText: '',
    };
  });
}

// ============================================================================
// Direct Native Music Video Stream Scraper (HLS & MP4, zero 3P iframe UI)
// ============================================================================

interface DailymotionListItem {
  id: string;
  title?: string;
  duration?: number;
  thumbnail_720_url?: string;
  'owner.username'?: string;
}

interface DailymotionMetadata {
  duration?: number;
  qualities?: Record<string, Array<{ type?: string; url?: string }>>;
  thumbnails?: Record<string, string>;
}

const MV_PENALTY_KEYWORDS = [
  'cover',
  'karaoke',
  'guitar chord',
  'chords',
  'tutorial',
  'reaction',
  'remix',
  'berita',
  'news',
  'pemerintah',
  'wawancara',
  'interview',
  'teaser',
  'trailer',
  'shorts',
  'tiktok',
];

function scoreMvTitleMatch(
  candidateTitle: string,
  candidateOwner: string,
  targetTitle: string,
  targetArtist: string,
  durationSec = 0,
): number {
  const candNorm = normalizeText(candidateTitle);
  const ownerNorm = normalizeText(candidateOwner);
  const titleNorm = normalizeText(targetTitle);
  const artistNorm = normalizeText(targetArtist);

  if (!candNorm || !titleNorm || !artistNorm) return -1000;

  const artistTokens = artistNorm.split(' ').filter((w) => w.length >= 2);
  const titleTokens = titleNorm.split(' ').filter((w) => w.length >= 2);

  const artistMatched =
    artistTokens.length > 0 &&
    artistTokens.every((tok) => candNorm.includes(tok) || ownerNorm.includes(tok));
  const titleMatched =
    titleTokens.length > 0 && titleTokens.every((tok) => candNorm.includes(tok));

  // Require strong overlap on BOTH artist and title
  if (!artistMatched || !titleMatched) return -500;

  let score = 60;
  const rawLower = candidateTitle.toLowerCase();
  if (rawLower.includes('official') || rawLower.includes('music video')) score += 35;
  if (rawLower.includes('mv') || rawLower.includes('video klip')) score += 20;

  if (durationSec >= 90 && durationSec <= 540) score += 25;
  else if (durationSec > 0 && durationSec < 50) score -= 90;
  else if (durationSec > 720) score -= 70;

  for (const bad of MV_PENALTY_KEYWORDS) {
    if (rawLower.includes(bad) && !targetTitle.toLowerCase().includes(bad)) {
      score -= 45;
    }
  }
  if (rawLower.includes('lirik') || rawLower.includes('lyrics')) score -= 18;

  return score;
}

export async function getMusicVideo(title: string, artist: string): Promise<MusicVideoResult> {
  const cleanArtist = artist.split(/,|&|feat\.|ft\./i)[0]?.trim() || artist;
  const cleanTitle = title
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+-\s+(remastered|live|acoustic|single|radio edit|version).*$/i, '')
    .trim();

  return withCache(`mv_native:${normalizeText(cleanTitle)}:${normalizeText(cleanArtist)}`, 20 * 60 * 1000, async () => {
    // 1. Direct HLS Music Video via Dailymotion metadata stream
    try {
      const dmData = await fetchJson<{ list?: DailymotionListItem[] }>(
        `https://api.dailymotion.com/videos?search=${encodeURIComponent(`${cleanArtist} ${cleanTitle}`)}&fields=id,title,duration,thumbnail_720_url,owner.username&limit=12`,
        undefined,
        6500,
      );

      const candidates = (dmData.list ?? [])
        .map((item) => ({
          item,
          score: scoreMvTitleMatch(
            item.title || '',
            item['owner.username'] || '',
            cleanTitle,
            cleanArtist,
            item.duration || 0,
          ),
        }))
        .filter((x) => x.score >= 30)
        .sort((a, b) => b.score - a.score);

      for (const { item } of candidates.slice(0, 3)) {
        try {
          const meta = await fetchJson<DailymotionMetadata>(
            `https://www.dailymotion.com/player/metadata/video/${encodeURIComponent(item.id)}`,
            undefined,
            6500,
          );
          const autoStream = meta.qualities?.auto?.find(
            (q) => q.url && isValidExternalMediaUrl(q.url),
          )?.url;
          if (autoStream) {
            const rawMvTitle = (item.title || '').trim();
            const cleanMvTitle =
              rawMvTitle && !rawMvTitle.includes(' ') && rawMvTitle.includes('+')
                ? rawMvTitle.replace(/\+/g, ' ').trim()
                : rawMvTitle || `${cleanTitle} — ${cleanArtist}`;
            return {
              found: true,
              streamUrl: `/api/hls-proxy?url=${encodeURIComponent(autoStream)}`,
              streamType: 'hls',
              title: cleanMvTitle,
              thumbnail: item.thumbnail_720_url || meta.thumbnails?.['720'] || '',
              durationSec: meta.duration || item.duration || 0,
            };
          }
        } catch {
          // Try next candidate
        }
      }
    } catch {
      // Fall through to Apple Music Video MP4 catalog
    }

    // 2. Direct 1080p MP4/M4V Music Video via iTunes MusicVideo catalog
    try {
      const itData = await fetchJson<{
        results?: Array<{
          trackName?: string;
          artistName?: string;
          previewUrl?: string;
          artworkUrl100?: string;
          trackTimeMillis?: number;
        }>;
      }>(
        `https://itunes.apple.com/search?term=${encodeURIComponent(`${cleanArtist} ${cleanTitle}`)}&entity=musicVideo&limit=6`,
        undefined,
        6500,
      );

      const match = (itData.results ?? []).find((r) => {
        if (!r.previewUrl || !isValidExternalMediaUrl(r.previewUrl)) return false;
        const rTitle = normalizeText(r.trackName || '');
        const rArtist = normalizeText(r.artistName || '');
        const tNorm = normalizeText(cleanTitle);
        const aNorm = normalizeText(cleanArtist);
        return (
          (rTitle === tNorm || rTitle.includes(tNorm) || tNorm.includes(rTitle)) &&
          (rArtist.includes(aNorm) || aNorm.includes(rArtist))
        );
      });

      if (match?.previewUrl) {
        return {
          found: true,
          streamUrl: `/api/audio-proxy?url=${encodeURIComponent(match.previewUrl)}`,
          streamType: 'mp4',
          title: match.trackName || cleanTitle,
          thumbnail: upscaleItunesArt(match.artworkUrl100),
          durationSec: match.trackTimeMillis ? Math.round(match.trackTimeMillis / 1000) : 0,
        };
      }
    } catch {
      // Not found
    }

    return {
      found: false,
      streamUrl: null,
      streamType: null,
      title: '',
      thumbnail: '',
    };
  });
}

export async function getReleaseRadar(artistNames: string[]): Promise<ReleaseRadarPayload> {
  const cleanArtists = Array.from(
    new Set(
      artistNames
        .map((a) => a.trim())
        .filter((a) => a.length >= 2 && a.length <= 80),
    ),
  ).slice(0, 10);

  if (cleanArtists.length === 0) {
    return {
      tracks: [],
      releases: [],
      artistsChecked: [],
      fetchedAt: new Date().toISOString(),
    };
  }

  const cacheKey = `release_radar:${cleanArtists.map((a) => a.toLowerCase()).sort().join('|')}`;
  return withCache(cacheKey, 10 * 60 * 1000, async () => {
    const songResults = await Promise.allSettled(
      cleanArtists.map(async (artist) => {
        const [idTracks, usTracks] = await Promise.allSettled([
          fetchJson<ItunesSearchResult>(
            `https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=song&country=id&limit=10`,
            undefined,
            5500,
          ),
          fetchJson<ItunesSearchResult>(
            `https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=song&country=us&limit=8`,
            undefined,
            5500,
          ),
        ]);

        const artistNorm = normalizeText(artist);
        const rawItems = [
          ...(idTracks.status === 'fulfilled' ? idTracks.value.results ?? [] : []),
          ...(usTracks.status === 'fulfilled' ? usTracks.value.results ?? [] : []),
        ];

        return rawItems
          .filter((r) => r.trackId && r.trackName && r.artistName)
          .filter((r) => {
            const candArtist = normalizeText(r.artistName || '');
            return (
              candArtist === artistNorm ||
              candArtist.includes(artistNorm) ||
              artistNorm.includes(candArtist)
            );
          })
          .map((r) => ({
            releaseTs: r.releaseDate ? Date.parse(r.releaseDate) || 0 : 0,
            track: {
              id: `itunes-${r.trackId}`,
              title: r.trackName!,
              artist: r.artistName!,
              album: r.collectionName || 'Single',
              durationSec: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : 0,
              artwork: upscaleItunesArt(r.artworkUrl100),
              region: inferRegion(r.artistName || artist, r.primaryGenreName || '', 'GLOBAL'),
              genre: r.primaryGenreName || 'Music',
              source: 'itunes' as const,
              previewUrl: r.previewUrl,
              releaseYear: r.releaseDate?.slice(0, 4),
              explicit: r.trackExplicitness === 'explicit',
              collectionId: r.collectionId,
            } satisfies Track,
          }));
      }),
    );

    const datedEntries: Array<{ releaseTs: number; track: Track }> = [];
    for (const res of songResults) {
      if (res.status === 'fulfilled') {
        datedEntries.push(...res.value);
      }
    }

    datedEntries.sort((a, b) => b.releaseTs - a.releaseTs);

    const uniqueTracks = deduplicateTracks(datedEntries.map((x) => x.track)).slice(0, 24);
    const albumSeen = new Set<string>();
    const releases: AlbumSummary[] = [];
    for (const t of uniqueTracks) {
      const key = `${normalizeText(t.album)}::${normalizeText(t.artist)}`;
      if (!t.album || albumSeen.has(key) || !t.artwork) continue;
      albumSeen.add(key);
      releases.push({
        id: `radar-alb-${encodeURIComponent(t.album)}-${encodeURIComponent(t.artist)}`,
        title: t.album,
        artist: t.artist,
        artwork: t.artwork,
        releaseYear: t.releaseYear,
        releaseType: t.album.toLowerCase().includes('single') ? 'Single' : 'Album',
        collectionId: t.collectionId,
      });
      if (releases.length >= 10) break;
    }

    return {
      tracks: uniqueTracks,
      releases,
      artistsChecked: cleanArtists,
      fetchedAt: new Date().toISOString(),
    };
  });
}

function extractBestLyricSnippet(rawLyrics: string, queryNorm: string, queryTokens: string[]): {
  score: number;
  snippet: string;
} {
  const cleanLines = rawLyrics
    .replace(/\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 3);

  if (cleanLines.length === 0) return { score: 0, snippet: '' };

  const fullNorm = normalizeText(cleanLines.join(' '));
  let globalScore = 0;

  if (queryNorm.length >= 4 && fullNorm.includes(queryNorm)) {
    globalScore += 140;
  }

  let matchedTokensTotal = 0;
  for (const tok of queryTokens) {
    if (fullNorm.includes(tok)) matchedTokensTotal++;
  }
  const tokenCoverage = queryTokens.length > 0 ? matchedTokensTotal / queryTokens.length : 0;
  globalScore += Math.round(tokenCoverage * 80);

  let bestWindowScore = -1;
  let bestSnippet = '';

  for (let i = 0; i < cleanLines.length; i++) {
    const line1 = cleanLines[i];
    const twoLines = i + 1 < cleanLines.length ? `${line1}\n${cleanLines[i + 1]}` : line1;
    const norm1 = normalizeText(line1);
    const norm2 = normalizeText(twoLines);

    let lineScore = 0;
    if (queryNorm.length >= 4 && norm1.includes(queryNorm)) {
      lineScore += 200;
    } else if (queryNorm.length >= 4 && norm2.includes(queryNorm)) {
      lineScore += 165;
    }

    let lineTokenHits = 0;
    for (const tok of queryTokens) {
      if (norm1.includes(tok)) lineTokenHits += 2;
      else if (norm2.includes(tok)) lineTokenHits += 1;
    }
    lineScore += lineTokenHits * 25;

    if (lineScore > bestWindowScore) {
      bestWindowScore = lineScore;
      bestSnippet = lineScore >= 165 || norm1.length >= 38 ? line1 : twoLines;
    }
  }

  // Require genuine lyric match, not accidental 1-word coincidence on long queries
  if (queryTokens.length >= 3 && tokenCoverage < 0.5 && globalScore < 130) {
    return { score: 0, snippet: '' };
  }
  if (queryTokens.length >= 1 && tokenCoverage === 0) {
    return { score: 0, snippet: '' };
  }

  return {
    score: globalScore + Math.max(0, bestWindowScore),
    snippet: bestSnippet || cleanLines[0],
  };
}

export async function searchTracksByLyrics(query: string): Promise<LyricSearchPayload> {
  const clean = query.trim();
  if (clean.length < 2) {
    return { query: clean, hits: [] };
  }

  const queryNorm = normalizeText(clean);
  const queryTokens = queryNorm.split(' ').filter((w) => w.length >= 2);

  return withCache(`lyricsearch:v2:${queryNorm}`, 10 * 60 * 1000, async () => {
    const [lrclibDirectRes, itunesIdRes, itunesUsRes, ytmRes] = await Promise.allSettled([
      fetchJson<Array<LrclibItem & { albumName?: string }>>(
        `https://lrclib.net/api/search?q=${encodeURIComponent(clean)}`,
        undefined,
        6500,
      ),
      scrapeItunesSearch(clean, 'id', 'ID', 8),
      scrapeItunesSearch(clean, 'us', 'GLOBAL', 6),
      scrapeYTMusicSearch(clean, 'ID', 'ID'),
    ]);

    const seenPairs = new Set<string>();
    const candidates: Array<{
      trackName: string;
      artistName: string;
      albumName: string;
      durationSec: number;
      synced: boolean;
      snippet: string;
      score: number;
      prefetchedTrack?: Track;
    }> = [];

    const makePairKey = (title: string, artist: string) =>
      `${normalizeText(title)}::${normalizeText(artist.split(/,|&|feat\.|ft\./i)[0] || artist)}`;

    // 1. Direct LRCLIB hits (already have full lyrics text)
    const rawItems = lrclibDirectRes.status === 'fulfilled' ? lrclibDirectRes.value : [];
    for (const item of rawItems) {
      const trackName = (item.trackName || '').trim();
      const artistName = (item.artistName || '').trim();
      const lyricText = item.plainLyrics || item.syncedLyrics || '';
      if (!trackName || !artistName || !lyricText) continue;

      if (/\b(karaoke|instrumental|8d audio|nightcore|sped up|slowed)\b/i.test(trackName)) {
        continue;
      }

      const { score, snippet } = extractBestLyricSnippet(lyricText, queryNorm, queryTokens);
      if (score <= 35 || !snippet) continue;

      const pairKey = makePairKey(trackName, artistName);
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      candidates.push({
        trackName,
        artistName,
        albumName: (item.albumName || '').trim(),
        durationSec: Math.round(Number(item.duration) || 0),
        synced: Boolean(item.syncedLyrics),
        snippet,
        score: score + (item.syncedLyrics ? 15 : 0),
      });
    }

    // 2. Candidate songs from iTunes & YT Music (which index full lyric bodies!)
    const catalogPool = [
      ...(itunesIdRes.status === 'fulfilled' ? itunesIdRes.value : []),
      ...(itunesUsRes.status === 'fulfilled' ? itunesUsRes.value : []),
      ...(ytmRes.status === 'fulfilled' ? ytmRes.value : []),
    ];

    const unverifiedTracks: Track[] = [];
    const seenCandidateKeys = new Set<string>(seenPairs);
    for (const tr of catalogPool) {
      if (!tr?.title || !tr?.artist) continue;
      if (/\b(karaoke|instrumental|8d audio|nightcore|sped up|slowed|cover)\b/i.test(tr.title)) {
        continue;
      }
      const key = makePairKey(tr.title, tr.artist);
      if (seenCandidateKeys.has(key)) continue;
      seenCandidateKeys.add(key);
      unverifiedTracks.push(tr);
      if (unverifiedTracks.length >= 10) break;
    }

    // Verify each candidate's actual lyrics via getTrackLyrics + extractBestLyricSnippet
    if (unverifiedTracks.length > 0) {
      const verifiedResults = await Promise.allSettled(
        unverifiedTracks.map(async (tr) => {
          const lyrics = await getTrackLyrics({
            title: tr.title,
            artist: tr.artist,
            album: tr.album,
            durationSec: tr.durationSec || undefined,
          });
          if (!lyrics.found) return null;
          const fullText =
            lyrics.plainText || lyrics.lines.map((l) => l.text).join('\n');
          if (!fullText) return null;
          const { score, snippet } = extractBestLyricSnippet(
            fullText,
            queryNorm,
            queryTokens,
          );
          if (score <= 35 || !snippet) return null;
          return {
            trackName: tr.title,
            artistName: tr.artist,
            albumName: tr.album,
            durationSec: tr.durationSec,
            synced: lyrics.synced,
            snippet,
            score: score + (lyrics.synced ? 15 : 0) + 10,
            prefetchedTrack: tr,
          };
        }),
      );

      for (const res of verifiedResults) {
        if (res.status === 'fulfilled' && res.value) {
          const pairKey = makePairKey(res.value.trackName, res.value.artistName);
          if (!seenPairs.has(pairKey)) {
            seenPairs.add(pairKey);
            candidates.push(res.value);
          }
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const topCandidates = candidates.slice(0, 10);

    const enrichedHits = await Promise.all(
      topCandidates.map(async (cand): Promise<LyricSearchHit> => {
        if (cand.prefetchedTrack && cand.prefetchedTrack.artwork) {
          return {
            track: cand.prefetchedTrack,
            matchedSnippet: cand.snippet,
            synced: cand.synced,
          };
        }

        const searchTerm = `${cand.artistName.split(/,|&|feat\./i)[0]?.trim() || cand.artistName} ${cand.trackName}`;
        const [idHits, usHits] = await Promise.allSettled([
          scrapeItunesSearch(searchTerm, 'id', 'GLOBAL', 4),
          scrapeItunesSearch(searchTerm, 'us', 'GLOBAL', 4),
        ]);
        const pool = [
          ...(idHits.status === 'fulfilled' ? idHits.value : []),
          ...(usHits.status === 'fulfilled' ? usHits.value : []),
        ];

        const targetTitle = normalizeText(cand.trackName);
        const targetArtist = normalizeText(cand.artistName.split(/,|&/)[0] || cand.artistName);
        const matchedTrack =
          pool.find((t) => {
            const tTitle = normalizeText(t.title);
            const tArtist = normalizeText(t.artist);
            return (
              (tTitle.includes(targetTitle) || targetTitle.includes(tTitle)) &&
              (tArtist.includes(targetArtist) || targetArtist.includes(tArtist))
            );
          }) || pool[0] || cand.prefetchedTrack;

        const finalTrack: Track = matchedTrack
          ? {
              ...matchedTrack,
              durationSec: matchedTrack.durationSec || cand.durationSec,
            }
          : {
              id: `lyric-${crypto.createHash('sha1').update(`${cand.artistName}:${cand.trackName}`).digest('hex').slice(0, 12)}`,
              title: cand.trackName,
              artist: cand.artistName,
              album: cand.albumName || 'Single',
              durationSec: cand.durationSec || 210,
              artwork: '',
              region: inferRegion(cand.artistName, '', 'GLOBAL'),
              genre: 'Music',
              source: 'itunes',
            };

        return {
          track: finalTrack,
          matchedSnippet: cand.snippet,
          synced: cand.synced,
        };
      }),
    );

    return {
      query: clean,
      hits: enrichedHits,
    };
  });
}

