export type RegionScope = 'all' | 'id' | 'asia' | 'global';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSec: number;
  artwork: string;
  region: 'ID' | 'ASIA' | 'GLOBAL';
  genre: string;
  source: 'ytmusic' | 'itunes' | 'deezer' | 'soundcloud';
  previewUrl?: string;
  scTrackId?: number;
  releaseYear?: string;
  rank?: number;
  playCountText?: string;
  explicit?: boolean;
  trackNumber?: number;
  collectionId?: number;
}

export interface ArtistSummary {
  id: string;
  name: string;
  artwork: string;
  genre: string;
  region: 'ID' | 'ASIA' | 'GLOBAL';
  monthlyListenersText?: string;
}

export interface AlbumSummary {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  releaseYear?: string;
  trackCount?: number;
  releaseType?: 'Album' | 'Single' | 'EP';
  collectionId?: number;
}

export interface ArtistRelatedItem {
  id: string;
  name: string;
  artwork: string;
  monthlyListenersText?: string;
}

export interface ArtistVideoItem {
  id: string;
  title: string;
  subtitle: string;
  thumbnail: string;
}

export interface QuickMix {
  id: string;
  title: string;
  subtitle: string;
  artwork: string;
  tracks: Track[];
}

export interface DiscoverPayload {
  featured: Track | null;
  quickMixes: QuickMix[];
  indonesiaTop: Track[];
  indonesiaLegends: Track[];
  indonesiaIndie: Track[];
  asiaSpotlight: Track[];
  globalTop: Track[];
  trendingArtists: ArtistSummary[];
  featuredAlbums: AlbumSummary[];
  fetchedAt: string;
}

export interface SearchPayload {
  query: string;
  tracks: Track[];
  artists: ArtistSummary[];
  albums: AlbumSummary[];
}

export interface ArtistDetailPayload {
  name: string;
  artwork: string;
  bannerArtwork?: string;
  genre: string;
  region?: 'ID' | 'ASIA' | 'GLOBAL';
  verified?: boolean;
  bio?: string;
  monthlyListenersText?: string;
  subscribersText?: string;
  fansCount?: number;
  totalAlbumsCount?: number;
  topTracks: Track[];
  albums: AlbumSummary[];
  singles?: AlbumSummary[];
  videos?: ArtistVideoItem[];
  relatedArtists?: ArtistRelatedItem[];
}

export interface AlbumDetailPayload {
  title: string;
  artist: string;
  artwork: string;
  releaseYear?: string;
  releaseDate?: string;
  genre?: string;
  recordLabel?: string;
  trackCount?: number;
  totalDurationSec?: number;
  tracks: Track[];
}

export interface StreamResolution {
  streamUrl: string;
  mode: 'hls' | 'audio' | 'ytmusic';
  source: 'soundcloud' | 'jiosaavn' | 'dailymotion' | 'bilibili' | 'ytmusic' | 'preview';
  fullLength: boolean;
  durationSec?: number;
  videoId?: string;
  fallbackVideoIds?: string[];
}

export interface MusicVideoResult {
  found: boolean;
  streamUrl: string | null;
  streamType: 'hls' | 'mp4' | null;
  title: string;
  thumbnail: string;
  durationSec?: number;
}

export interface SyncedLyricLine {
  timeSec: number;
  text: string;
}

export interface LyricsPayload {
  found: boolean;
  synced: boolean;
  lines: SyncedLyricLine[];
  plainText: string;
  sourceName?: string;
}

export interface UserPlaylist {
  id: string;
  name: string;
  description: string;
  tracks: Track[];
  createdAt: string;
}

export interface GenreDefinition {
  id: string;
  label: string;
  regionLabel: string;
}

export interface ReleaseRadarPayload {
  tracks: Track[];
  releases: AlbumSummary[];
  artistsChecked: string[];
  fetchedAt: string;
}

export interface LyricSearchHit {
  track: Track;
  matchedSnippet: string;
  synced: boolean;
}

export interface LyricSearchPayload {
  query: string;
  hits: LyricSearchHit[];
}
