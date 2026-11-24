import { useEffect, useState } from 'react';
import { Disc3, Film, Layers, ListPlus, Pause, Play, Radio, RefreshCw, Sparkles } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import type { DiscoverPayload, GenreDefinition, RegionScope, Track } from '../types/music';
import { apiFetch } from '../utils/apiFetch';
import { formatDuration, formatRegionLabel } from '../utils/format';
import { Artwork } from './Artwork';
import { ReleaseRadarSection } from './ReleaseRadarSection';
import { TrackCard } from './TrackCard';
import { TrackRow } from './TrackRow';

const GENRES: GenreDefinition[] = [
  { id: 'all', label: 'All Feed', regionLabel: 'All' },
  { id: 'indo-legends', label: 'Legenda & Band Indo', regionLabel: 'Indonesia' },
  { id: 'pop-indonesia', label: 'Pop Indonesia', regionLabel: 'Indonesia' },
  { id: 'indo-indie', label: 'Indo Indie', regionLabel: 'Indonesia' },
  { id: 'dangdut-koplo', label: 'Dangdut & Koplo', regionLabel: 'Indonesia' },
  { id: 'kpop', label: 'K-Pop', regionLabel: 'Asia' },
  { id: 'jpop-anime', label: 'J-Pop & Anime', regionLabel: 'Asia' },
  { id: 'mandopop', label: 'Mandopop', regionLabel: 'Asia' },
  { id: 'global-pop', label: 'Global Pop', regionLabel: 'Global' },
  { id: 'rnb-soul', label: 'R&B & Soul', regionLabel: 'Global' },
  { id: 'hiphop', label: 'Hip-Hop', regionLabel: 'Global' },
  { id: 'lofi-chill', label: 'Lo-Fi & Chill', regionLabel: 'Global' },
];

const REGION_OPTIONS: Array<{ id: RegionScope; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'id', label: 'Indonesia' },
  { id: 'asia', label: 'Asia' },
  { id: 'global', label: 'Global' },
];

interface DiscoverViewProps {
  data: DiscoverPayload | null;
  loading: boolean;
  error: string | null;
  regionScope: RegionScope;
  onRegionChange: (scope: RegionScope) => void;
  onRetry: () => void;
  onOpenCharts: () => void;
  onArtistClick: (name: string) => void;
  onAlbumClick: (title: string, artist: string) => void;
  onOpenCollageStudio?: () => void;
  onOpenListenTogether?: () => void;
  onOpenTikTokEvent?: () => void;
}

export function DiscoverView({
  data,
  loading,
  error,
  regionScope,
  onRegionChange,
  onRetry,
  onOpenCharts,
  onArtistClick,
  onAlbumClick,
  onOpenCollageStudio,
  onOpenListenTogether,
  onOpenTikTokEvent,
}: DiscoverViewProps) {
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    playTrack,
    togglePlayPause,
    openMusicVideo,
    addToQueue,
    recentTracks,
  } = usePlayer();
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [genreTracks, setGenreTracks] = useState<Track[]>([]);
  const [genreLoading, setGenreLoading] = useState(false);
  const [genreError, setGenreError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedGenre === 'all') {
      setGenreTracks([]);
      setGenreError(null);
      return;
    }

    const controller = new AbortController();
    setGenreLoading(true);
    setGenreError(null);

    apiFetch(`/api/genre/${encodeURIComponent(selectedGenre)}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load genre tracks');
        return (await res.json()) as { tracks?: Track[] };
      })
      .then((json) => {
        setGenreTracks(json.tracks ?? []);
        setGenreLoading(false);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setGenreError('Unable to scrape tracks for this genre right now.');
        setGenreLoading(false);
      });

    return () => controller.abort();
  }, [selectedGenre]);

  if (loading && !data) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="h-16 rounded-2xl ios-glass-card" />
          ))}
        </div>
        <div className="h-52 rounded-[28px] ios-glass" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div key={idx} className="space-y-2">
              <div className="aspect-square rounded-2xl ios-glass-card" />
              <div className="h-4 w-3/4 rounded bg-black/[0.06] dark:bg-white/[0.06]" />
              <div className="h-3 w-1/2 rounded bg-black/[0.06] dark:bg-white/[0.06]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-[28px] ios-glass p-8 text-center max-w-lg mx-auto my-12">
        <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Catalog currently unreachable
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#FF4D2E] text-white text-sm font-medium hover:bg-[#E63E21] transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Retry Catalog Scrape</span>
        </button>
      </div>
    );
  }

  if (!data) return null;

  const indonesiaTop = data.indonesiaTop ?? [];
  const indonesiaLegends = data.indonesiaLegends ?? [];
  const indonesiaIndie = data.indonesiaIndie ?? [];
  const asiaSpotlight = data.asiaSpotlight ?? [];
  const globalTop = data.globalTop ?? [];
  const quickMixes = data.quickMixes ?? [];
  const trendingArtists = data.trendingArtists ?? [];
  const featuredAlbums = data.featuredAlbums ?? [];

  const featured = data.featured || indonesiaTop[0] || globalTop[0] || null;
  const isFeaturedPlaying = featured && currentTrack?.id === featured.id && isPlaying;
  const activeGenreMeta = GENRES.find((g) => g.id === selectedGenre);

  const quickSongsPool = (() => {
    const rawPool =
      regionScope === 'id'
        ? [...indonesiaTop, ...indonesiaLegends, ...indonesiaIndie]
        : regionScope === 'asia'
          ? asiaSpotlight
          : regionScope === 'global'
            ? globalTop
            : [
                ...indonesiaTop.slice(0, 5),
                ...indonesiaLegends.slice(0, 6),
                ...globalTop.slice(0, 4),
                ...asiaSpotlight.slice(0, 4),
                ...indonesiaIndie.slice(0, 3),
              ];
    const seenIds = new Set<string>();
    const unique: Track[] = [];
    for (const t of rawPool) {
      if (!t?.id || seenIds.has(t.id)) continue;
      seenIds.add(t.id);
      unique.push(t);
      if (unique.length >= 12) break;
    }
    return unique;
  })();

  const sections = [
    {
      key: 'id',
      title: 'Indonesia Top & Viral',
      subtitle: 'Tulus, Bernadya, Dewa 19, Sheila On 7, and today’s domestic charts',
      tracks: indonesiaTop,
    },
    {
      key: 'legends',
      title: 'Legenda Musik Indonesia',
      subtitle: 'Dewa 19, Slank, Sheila On 7, NOAH, and timeless classics',
      tracks: indonesiaLegends,
    },
    {
      key: 'global',
      title: 'Global Icons & Charts',
      subtitle: 'Justin Bieber, Bruno Mars, and worldwide hits',
      tracks: globalTop,
    },
    {
      key: 'asia',
      title: 'Asian Spotlight',
      subtitle: 'NewJeans, YOASOBI, Jay Chou, K-Pop & J-Pop hits',
      tracks: asiaSpotlight,
    },
    {
      key: 'id-indie',
      title: 'Indonesian Indie & Alternative',
      subtitle: 'Hindia, Reality Club, Sal Priadi, and acoustic essentials',
      tracks: indonesiaIndie,
    },
  ].filter((sec) => {
    if (sec.tracks.length === 0) return false;
    if (regionScope === 'id') return sec.key === 'id' || sec.key === 'legends' || sec.key === 'id-indie';
    if (regionScope === 'asia') return sec.key === 'asia';
    if (regionScope === 'global') return sec.key === 'global';
    return true;
  });

  return (
    <div className="space-y-8 pb-10">
      {/* Mobile/Tablet Region Switcher + Genre Filter Capsule Bar */}
      <section aria-label="Genres and regions" className="space-y-2.5">
        <div className="flex lg:hidden items-center gap-1 p-1 rounded-full ios-glass-pill w-fit">
          {REGION_OPTIONS.map((tab) => {
            const active = regionScope === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onRegionChange(tab.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap active:scale-95 transition-[background-color,color,transform] duration-250 ease-[cubic-bezier(0.22,1.14,0.36,1)] ${
                  active
                    ? 'bg-white/95 dark:bg-white/[0.16] text-zinc-950 dark:text-white shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {GENRES.map((genre) => {
            const active = selectedGenre === genre.id;
            return (
              <button
                key={genre.id}
                type="button"
                onClick={() => setSelectedGenre(genre.id)}
                className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap shrink-0 active:scale-95 transition-[background-color,color,transform] duration-250 ease-[cubic-bezier(0.22,1.14,0.36,1)] ${
                  active
                    ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-sm'
                    : 'ios-glass-pill text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                {genre.label}
              </button>
            );
          })}
        </div>
      </section>

      {selectedGenre !== 'all' ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-bold text-zinc-900 dark:text-zinc-100">
                {activeGenreMeta?.label}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {activeGenreMeta?.regionLabel} · Live scraped selection
              </p>
            </div>
            {genreTracks.length > 0 && (
              <button
                type="button"
                onClick={() => playTrack(genreTracks[0], genreTracks)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] active:scale-95 transition-all whitespace-nowrap shadow-md"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Play Mix</span>
              </button>
            )}
          </div>

          {genreLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div key={idx} className="h-14 rounded-2xl ios-glass-card animate-pulse" />
              ))}
            </div>
          ) : genreError ? (
            <div className="rounded-2xl ios-glass p-6 text-sm text-zinc-500 dark:text-zinc-400">
              {genreError}
            </div>
          ) : (
            <div className="rounded-[24px] ios-glass divide-y divide-black/[0.05] dark:divide-white/[0.06] p-1.5">
              {genreTracks.map((track, idx) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={idx}
                  contextList={genreTracks}
                  onArtistClick={onArtistClick}
                  onAlbumClick={onAlbumClick}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Spotify-Style Quick Picks Mix Grid */}
          {quickMixes.length > 0 && (
            <section className="space-y-3" aria-label="Quick picks">
              <h2 className="font-display text-lg md:text-xl font-bold text-zinc-950 dark:text-white">
                Made For You
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {quickMixes.map((mix) => {
                  const first = mix.tracks?.[0];
                  const activeMix = first && currentTrack?.id === first.id && isPlaying;
                  return (
                    <div
                      key={mix.id}
                      onClick={() => first && playTrack(first, mix.tracks)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          if (first) playTrack(first, mix.tracks);
                        }
                      }}
                      className="group flex items-center gap-3 pr-3 rounded-2xl overflow-hidden ios-glass-card cursor-pointer hover:-translate-y-0.5 active:scale-[0.985] transition-transform duration-200"
                    >
                      <Artwork
                        src={mix.artwork}
                        alt={mix.title}
                        className="w-14 h-14 shrink-0"
                        rounded="rounded-none"
                        thumb
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {mix.title}
                        </div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                          {mix.subtitle}
                        </div>
                      </div>
                      <span
                        className={`w-8 h-8 rounded-full bg-[#FF4D2E] text-white flex items-center justify-center shadow-md shrink-0 transition-all duration-200 ${
                          activeMix ? 'opacity-100 scale-100' : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'
                        }`}
                      >
                        {activeMix ? (
                          <Pause className="w-3.5 h-3.5 fill-white" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Focal Hero Spotlight */}
          {featured && (
            <section className="relative overflow-hidden rounded-[28px] ios-glass-surface p-5 md:p-7">
              {featured.artwork && (
                <div
                  aria-hidden="true"
                  className="hidden md:block pointer-events-none absolute -right-12 -top-12 w-72 h-72 rounded-full opacity-20 dark:opacity-25 blur-2xl bg-cover bg-center"
                  style={{ backgroundImage: `url(${featured.artwork})` }}
                />
              )}
              <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-6">
                <div className="p-1 rounded-[22px] ios-glass-card w-fit">
                  <Artwork
                    src={featured.artwork}
                    alt={featured.title}
                    className="w-32 h-32 md:w-40 md:h-40 shadow-lg"
                    rounded="rounded-[18px]"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                    <span className="text-[#FF4D2E] font-semibold">Featured Pick</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatRegionLabel(featured.region)}</span>
                    {featured.genre && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{featured.genre}</span>
                      </>
                    )}
                  </div>

                  <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-zinc-950 dark:text-white text-balance leading-tight">
                    {featured.title}
                  </h1>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-600 dark:text-zinc-300">
                    <button
                      type="button"
                      onClick={() => onArtistClick(featured.artist.split(/,|&/)[0]?.trim() || featured.artist)}
                      className="font-medium hover:text-zinc-950 dark:hover:text-white hover:underline"
                    >
                      {featured.artist}
                    </button>
                    {featured.album && featured.album !== 'Top Charts' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{featured.album}</span>
                      </>
                    )}
                    {featured.durationSec > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-xs">{formatDuration(featured.durationSec)}</span>
                      </>
                    )}
                  </div>

                  <div className="pt-2 flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        currentTrack?.id === featured.id
                          ? togglePlayPause()
                          : playTrack(featured, sections[0]?.tracks || indonesiaTop)
                      }
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#FF4D2E] text-white text-sm font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shadow-[0_8px_22px_rgba(255,77,46,0.35)] whitespace-nowrap"
                    >
                      {isFeaturedPlaying ? (
                        <>
                          <Pause className="w-4 h-4 fill-white" />
                          <span>Pause</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 fill-white" />
                          <span>Play Audio</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => openMusicVideo(featured, sections[0]?.tracks || indonesiaTop)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full ios-glass-pill text-zinc-900 dark:text-zinc-100 text-sm font-medium hover:bg-white/80 dark:hover:bg-white/[0.12] active:scale-95 transition-all whitespace-nowrap"
                    >
                      <Film className="w-4 h-4 text-[#FF4D2E]" />
                      <span>Watch MV</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => addToQueue(featured)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full ios-glass-pill text-zinc-700 dark:text-zinc-300 text-sm font-medium hover:bg-white/80 dark:hover:bg-white/[0.12] active:scale-95 transition-all whitespace-nowrap"
                    >
                      <ListPlus className="w-4 h-4" />
                      <span>Queue</span>
                    </button>
                    {onOpenCollageStudio && (
                      <button
                        type="button"
                        onClick={onOpenCollageStudio}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full ios-glass-pill text-zinc-700 dark:text-zinc-200 text-sm font-medium hover:bg-white/80 dark:hover:bg-white/[0.12] active:scale-95 transition-all whitespace-nowrap"
                      >
                        <Layers className="w-4 h-4 text-[#FF4D2E]" />
                        <span>Story Collage</span>
                      </button>
                    )}
                    {onOpenListenTogether && (
                      <button
                        type="button"
                        onClick={onOpenListenTogether}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full ios-glass-pill text-zinc-700 dark:text-zinc-200 text-sm font-medium hover:bg-white/80 dark:hover:bg-white/[0.12] active:scale-95 transition-all whitespace-nowrap"
                      >
                        <Radio className="w-4 h-4 text-[#FF4D2E]" />
                        <span>Listen Together</span>
                      </button>
                    )}
                    {onOpenTikTokEvent && (
                      <button
                        type="button"
                        onClick={onOpenTikTokEvent}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-amber-500/14 border border-amber-400/30 text-amber-700 dark:text-amber-300 text-sm font-semibold hover:bg-amber-500/20 active:scale-95 transition-all whitespace-nowrap"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>Event #audixify</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Spotify-style Popular Songs Compact Grid */}
          {quickSongsPool.length > 0 && (
            <section className="space-y-3.5 cv-section">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg md:text-xl font-bold text-zinc-950 dark:text-white">
                    Songs Everyone’s Playing
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Instant audio & music video playback
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenCharts}
                  className="text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-[#FF4D2E] whitespace-nowrap shrink-0"
                >
                  Open Charts
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {quickSongsPool.map((track) => {
                  const isCurrent = currentTrack?.id === track.id;
                  return (
                    <div
                      key={`qs-${track.id}`}
                      className={`group flex items-center gap-3 p-2 rounded-2xl ios-glass-card hover:-translate-y-0.5 transition-transform duration-200 ${
                        isCurrent ? 'ring-1 ring-[#FF4D2E]/50' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => (isCurrent ? togglePlayPause() : playTrack(track, quickSongsPool))}
                        aria-label={`Play ${track.title}`}
                        className="relative shrink-0 rounded-xl overflow-hidden active:scale-95 transition-transform"
                      >
                        <Artwork src={track.artwork} alt={track.title} className="w-12 h-12" rounded="rounded-xl" thumb />
                        <span
                          className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity duration-200 ${
                            isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          {isCurrent && isBuffering ? (
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : isCurrent && isPlaying ? (
                            <Pause className="w-4 h-4 text-white fill-white" />
                          ) : (
                            <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                          )}
                        </span>
                      </button>

                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => (isCurrent ? togglePlayPause() : playTrack(track, quickSongsPool))}
                          className={`block text-left text-sm font-semibold truncate max-w-full hover:underline ${
                            isCurrent ? 'text-[#FF4D2E]' : 'text-zinc-900 dark:text-zinc-100'
                          }`}
                        >
                          {track.title}
                        </button>
                        <button
                          type="button"
                          onClick={() => onArtistClick(track.artist.split(/,|&/)[0]?.trim() || track.artist)}
                          className="block text-left text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-full hover:underline"
                        >
                          {track.artist}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => openMusicVideo(track, quickSongsPool)}
                        title="Watch Music Video"
                        aria-label={`Watch music video for ${track.title}`}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-[#FF4D2E] hover:bg-black/[0.05] dark:hover:bg-white/[0.07] active:scale-90 shrink-0 transition-all"
                      >
                        <Film className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Release Radar from Followed Artists */}
          <ReleaseRadarSection onArtistClick={onArtistClick} onAlbumClick={onAlbumClick} />

          {/* Popular Artists Strip */}
          {trendingArtists.length > 0 && (
            <section className="space-y-3.5 cv-section">
              <div>
                <h2 className="font-display text-lg md:text-xl font-bold text-zinc-950 dark:text-white">
                  Popular Artists
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Tap any artist to view monthly listeners, top songs, albums & videos
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                {trendingArtists.slice(0, 8).map((artist) => (
                  <button
                    key={artist.id}
                    type="button"
                    onClick={() => onArtistClick(artist.name)}
                    className="group p-2.5 rounded-[22px] ios-glass-card text-center hover:-translate-y-0.5 active:scale-[0.97] transition-all"
                  >
                    <Artwork
                      src={artist.artwork}
                      alt={artist.name}
                      className="w-full aspect-square mb-2.5 transition-transform duration-300 group-hover:scale-[1.03]"
                      rounded="rounded-full"
                      thumb
                    />
                    <div className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-[#FF4D2E] transition-colors">
                      {artist.name}
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                      {formatRegionLabel(artist.region)}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Recently Played */}
          {recentTracks.length > 0 && (
            <section className="space-y-3.5 cv-section">
              <div>
                <h2 className="font-display text-lg md:text-xl font-bold text-zinc-950 dark:text-white">
                  Recently Played
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Pick up right where you left off
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
                {recentTracks.slice(0, 6).map((track) => (
                  <TrackCard
                    key={`recent-${track.id}`}
                    track={track}
                    contextList={recentTracks}
                    onArtistClick={onArtistClick}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Regional & Legend Track Grids */}
          {sections.map((section) => (
            <section key={section.key} className="space-y-3.5 cv-section">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg md:text-xl font-bold text-zinc-950 dark:text-white">
                    {section.title}
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{section.subtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={onOpenCharts}
                  className="text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-[#FF4D2E] whitespace-nowrap shrink-0"
                >
                  See All
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
                {section.tracks.slice(0, 10).map((track) => (
                  <TrackCard
                    key={track.id}
                    track={track}
                    contextList={section.tracks}
                    onArtistClick={onArtistClick}
                  />
                ))}
              </div>
            </section>
          ))}

          {/* Featured Albums Catalog */}
          {featuredAlbums.length > 0 && (
            <section className="space-y-3.5 cv-section">
              <div>
                <h2 className="font-display text-lg md:text-xl font-bold text-zinc-950 dark:text-white">
                  Popular Albums & EPs
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Full-length releases across Indonesia, Asia, and Global
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-3.5">
                {featuredAlbums.slice(0, 7).map((album) => (
                  <button
                    key={album.id}
                    type="button"
                    onClick={() => onAlbumClick(album.title, album.artist)}
                    className="group p-2.5 rounded-[22px] ios-glass-card text-left hover:-translate-y-0.5 active:scale-[0.97] transition-transform duration-150"
                  >
                    <Artwork
                      src={album.artwork}
                      alt={album.title}
                      className="w-full aspect-square mb-2.5 transition-transform duration-300 group-hover:scale-[1.03]"
                      rounded="rounded-2xl"
                      thumb
                    />
                    <div className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-[#FF4D2E]">
                      {album.title}
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5 flex items-center gap-1">
                      <Disc3 className="w-3 h-3 shrink-0" />
                      <span className="truncate">{album.artist}</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
