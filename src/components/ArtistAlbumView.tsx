import { LayoutGroup, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Disc3,
  Film,
  ListPlus,
  Play,
  Share2,
  Shuffle,
  UserPlus,
  Users,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import type { AlbumDetailPayload, ArtistDetailPayload, Track } from '../types/music';
import { apiFetch } from '../utils/apiFetch';
import {
  formatCompactCount,
  formatRegionLabel,
  formatTotalRuntime,
} from '../utils/format';
import { IOS_SPRING_SNAPPY } from '../utils/motion';
import { Artwork } from './Artwork';
import { TrackRow } from './TrackRow';

interface ArtistAlbumViewProps {
  mode: 'artist' | 'album';
  artistName: string;
  albumTitle?: string;
  onBack: () => void;
  onArtistClick: (name: string) => void;
  onAlbumClick: (title: string, artist: string) => void;
}

type DiscographyTab = 'albums' | 'singles' | 'videos';

export function ArtistAlbumView({
  mode,
  artistName,
  albumTitle,
  onBack,
  onArtistClick,
  onAlbumClick,
}: ArtistAlbumViewProps) {
  const {
    playTrack,
    playShuffled,
    openMusicVideo,
    addListToQueue,
    isFollowingArtist,
    toggleFollowArtist,
    showToast,
  } = usePlayer();

  const [artistData, setArtistData] = useState<ArtistDetailPayload | null>(null);
  const [albumData, setAlbumData] = useState<AlbumDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllTracks, setShowAllTracks] = useState(false);
  const [discoTab, setDiscoTab] = useState<DiscographyTab>('albums');
  const [bioExpanded, setBioExpanded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setShowAllTracks(false);
    setBioExpanded(false);
    setDiscoTab('albums');

    const url =
      mode === 'artist'
        ? `/api/artist?name=${encodeURIComponent(artistName)}`
        : `/api/album?title=${encodeURIComponent(albumTitle || '')}&artist=${encodeURIComponent(artistName)}`;

    apiFetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load details');
        return await res.json();
      })
      .then((json) => {
        if (mode === 'artist') {
          const data = json as ArtistDetailPayload;
          setArtistData(data);
          if ((data.albums ?? []).length === 0 && (data.singles ?? []).length > 0) {
            setDiscoTab('singles');
          }
        } else {
          setAlbumData(json as AlbumDetailPayload);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setError('Unable to load catalog details.');
        setLoading(false);
      });

    return () => controller.abort();
  }, [mode, artistName, albumTitle]);

  const tracks = mode === 'artist' ? artistData?.topTracks ?? [] : albumData?.tracks ?? [];
  const artwork = mode === 'artist' ? artistData?.artwork : albumData?.artwork;
  const heading =
    mode === 'artist'
      ? artistData?.name || artistName
      : albumData?.title || albumTitle || 'Album';

  const following = mode === 'artist' ? isFollowingArtist(heading) : false;

  const handleShare = async () => {
    const shareTitle =
      mode === 'artist' ? `${heading} on Audixify` : `${heading} by ${albumData?.artist || artistName}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, url: window.location.href });
        return;
      }
      await navigator.clipboard.writeText(`${shareTitle} — ${window.location.href}`);
      showToast('Link copied to clipboard');
    } catch {
      showToast(`Ready to share "${heading}"`);
    }
  };

  const handleWatchArtistVideo = (videoTitle: string, thumb: string) => {
    const cleanVidTitle = videoTitle.replace(/\s*\([^)]*\)\s*/g, '').trim();
    const syntheticTrack: Track =
      tracks.find((t) => cleanVidTitle.toLowerCase().includes(t.title.toLowerCase())) || {
        id: `mv-${encodeURIComponent(cleanVidTitle)}`,
        title: cleanVidTitle,
        artist: heading,
        album: 'Music Video',
        durationSec: 0,
        artwork: thumb || artwork || '',
        region: artistData?.region || 'GLOBAL',
        genre: artistData?.genre || 'Music',
        source: 'ytmusic',
      };
    openMusicVideo(syntheticTrack, tracks);
  };

  const visibleTracks = mode === 'artist' && !showAllTracks ? tracks.slice(0, 8) : tracks;
  const albums = artistData?.albums ?? [];
  const singles = artistData?.singles ?? [];
  const videos = artistData?.videos ?? [];
  const relatedArtists = artistData?.relatedArtists ?? [];

  const availableTabs: Array<{ id: DiscographyTab; label: string; count: number }> = [
    ...(albums.length > 0 ? [{ id: 'albums' as const, label: 'Albums', count: albums.length }] : []),
    ...(singles.length > 0 ? [{ id: 'singles' as const, label: 'Singles & EPs', count: singles.length }] : []),
    ...(videos.length > 0 ? [{ id: 'videos' as const, label: 'Videos', count: videos.length }] : []),
  ];

  const activeDiscoTab = availableTabs.some((t) => t.id === discoTab)
    ? discoTab
    : availableTabs[0]?.id || 'albums';

  return (
    <div className="space-y-7 pb-10">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full ios-glass-pill text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white active:scale-95 transition-all"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back</span>
      </button>

      {loading ? (
        <div className="space-y-6 animate-pulse">
          <div className="h-56 rounded-[28px] ios-glass-card" />
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-14 rounded-2xl ios-glass-card" />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="rounded-[24px] ios-glass p-8 text-center text-sm text-zinc-500">
          {error}
        </div>
      ) : (
        <>
          {/* Rich iOS Hero Header Card */}
          <header className="relative overflow-hidden rounded-[28px] ios-glass p-5 sm:p-7">
            {(artistData?.bannerArtwork || artwork) && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-20 dark:opacity-25 bg-cover bg-center scale-105"
                style={{
                  backgroundImage: `url(${artistData?.bannerArtwork || artwork})`,
                }}
              />
            )}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/90 via-white/65 to-white/40 dark:from-[#0B0D13]/95 dark:via-[#0B0D13]/75 dark:to-[#0B0D13]/45"
            />

            <div className="relative z-10 flex flex-col sm:flex-row sm:items-end gap-5 sm:gap-6">
              <div className="p-1 rounded-[26px] ios-glass-card w-fit shrink-0">
                <Artwork
                  src={artwork}
                  alt={heading}
                  className="w-32 h-32 sm:w-44 sm:h-44 shadow-xl"
                  rounded={mode === 'artist' ? 'rounded-[22px]' : 'rounded-[20px]'}
                />
              </div>

              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  {mode === 'artist' ? (
                    <>
                      {artistData?.verified && (
                        <span className="inline-flex items-center gap-1 text-[#FF4D2E] font-semibold">
                          <BadgeCheck className="w-4 h-4 fill-[#FF4D2E] text-white dark:text-zinc-950" />
                          <span>Verified Artist</span>
                        </span>
                      )}
                      {artistData?.verified && <span aria-hidden="true">·</span>}
                      <span>{artistData?.genre || 'Music'}</span>
                      {artistData?.region && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{formatRegionLabel(artistData.region)}</span>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <span>Album</span>
                      {albumData?.genre && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{albumData.genre}</span>
                        </>
                      )}
                      {albumData?.releaseYear && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{albumData.releaseYear}</span>
                        </>
                      )}
                    </>
                  )}
                </div>

                <h1 className="font-display text-2xl sm:text-4xl lg:text-5xl font-bold text-zinc-950 dark:text-white tracking-tight text-balance">
                  {heading}
                </h1>

                {/* Real Artist Monthly Listeners / Fans / Releases OR Album Runtime Stats */}
                {mode === 'artist' && artistData ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300">
                    {artistData.monthlyListenersText && (
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-[#FF4D2E]" />
                        <span className="font-mono tabular-nums font-bold text-zinc-950 dark:text-white">
                          {artistData.monthlyListenersText}
                        </span>
                        <span className="text-zinc-500 dark:text-zinc-400">monthly listeners</span>
                      </div>
                    )}
                    {artistData.fansCount ? (
                      <>
                        {artistData.monthlyListenersText && <span aria-hidden="true" className="text-zinc-400">·</span>}
                        <div>
                          <span className="font-mono tabular-nums font-semibold text-zinc-950 dark:text-white">
                            {formatCompactCount(artistData.fansCount)}
                          </span>{' '}
                          <span className="text-zinc-500 dark:text-zinc-400">fans</span>
                        </div>
                      </>
                    ) : null}
                    {artistData.subscribersText ? (
                      <>
                        <span aria-hidden="true" className="text-zinc-400">·</span>
                        <div>
                          <span className="font-mono tabular-nums font-semibold text-zinc-950 dark:text-white">
                            {artistData.subscribersText}
                          </span>{' '}
                          <span className="text-zinc-500 dark:text-zinc-400">subscribers</span>
                        </div>
                      </>
                    ) : null}
                    {artistData.totalAlbumsCount ? (
                      <>
                        <span aria-hidden="true" className="text-zinc-400">·</span>
                        <div>
                          <span className="font-mono tabular-nums font-semibold text-zinc-950 dark:text-white">
                            {artistData.totalAlbumsCount}
                          </span>{' '}
                          <span className="text-zinc-500 dark:text-zinc-400">releases</span>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                    <button
                      type="button"
                      onClick={() => onArtistClick(albumData?.artist || artistName)}
                      className="font-semibold hover:underline text-zinc-950 dark:text-white"
                    >
                      {albumData?.artist || artistName}
                    </button>
                    {albumData?.trackCount ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-xs">
                          {albumData.trackCount} songs
                        </span>
                      </>
                    ) : null}
                    {albumData?.totalDurationSec ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-xs">
                          {formatTotalRuntime(albumData.totalDurationSec)}
                        </span>
                      </>
                    ) : null}
                  </div>
                )}

                {/* Primary Actions Bar */}
                <div className="pt-2 flex flex-wrap items-center gap-2.5">
                  {tracks.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => playTrack(tracks[0], tracks)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#FF4D2E] text-white text-xs sm:text-sm font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shadow-[0_8px_20px_rgba(255,77,46,0.35)]"
                      >
                        <Play className="w-4 h-4 fill-white" />
                        <span>Play All</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => playShuffled(tracks)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full ios-glass-pill text-zinc-900 dark:text-zinc-100 text-xs sm:text-sm font-medium hover:bg-white/80 dark:hover:bg-white/[0.12] active:scale-95 transition-all"
                      >
                        <Shuffle className="w-4 h-4 text-[#FF4D2E]" />
                        <span>Shuffle</span>
                      </button>
                    </>
                  )}

                  {mode === 'artist' && artistData && (
                    <button
                      type="button"
                      onClick={() =>
                        toggleFollowArtist({
                          id: `artist-${encodeURIComponent(heading)}`,
                          name: heading,
                          artwork: artistData.artwork,
                          genre: artistData.genre,
                          region: artistData.region || 'GLOBAL',
                          monthlyListenersText: artistData.monthlyListenersText,
                        })
                      }
                      className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs sm:text-sm font-medium active:scale-95 transition-all ${
                        following
                          ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-sm'
                          : 'ios-glass-pill text-zinc-800 dark:text-zinc-200 hover:bg-white/80 dark:hover:bg-white/[0.12]'
                      }`}
                    >
                      {following ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Following</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4" />
                          <span>Follow</span>
                        </>
                      )}
                    </button>
                  )}

                  {mode === 'album' && tracks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => addListToQueue(tracks)}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full ios-glass-pill text-zinc-800 dark:text-zinc-200 text-xs sm:text-sm font-medium hover:bg-white/80 dark:hover:bg-white/[0.12] active:scale-95 transition-all"
                    >
                      <ListPlus className="w-4 h-4" />
                      <span>Queue Album</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleShare}
                    aria-label={`Share ${heading}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-full ios-glass-pill text-zinc-700 dark:text-zinc-300 text-xs sm:text-sm font-medium hover:bg-white/80 dark:hover:bg-white/[0.12] active:scale-95 transition-all"
                  >
                    <Share2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Share</span>
                  </button>
                </div>
              </div>
            </div>
          </header>

          {/* Popular Songs / Album Tracklist */}
          {tracks.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg sm:text-xl font-bold text-zinc-950 dark:text-white">
                    {mode === 'artist' ? 'Popular Songs' : 'Tracklist'}
                  </h2>
                  {mode === 'artist' && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Top streamed songs and listener counts
                    </p>
                  )}
                </div>
                {mode === 'artist' && tracks.length > 8 && (
                  <button
                    type="button"
                    onClick={() => setShowAllTracks((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#FF4D2E] hover:underline"
                  >
                    <span>{showAllTracks ? 'Show Top 8' : `Show All (${tracks.length})`}</span>
                    {showAllTracks ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>

              <div className="rounded-[26px] ios-glass p-1.5">
                {mode === 'artist' && (
                  <div className="hidden md:flex items-center gap-3 px-3 py-2 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 border-b border-black/[0.05] dark:border-white/[0.06]">
                    <span className="w-7 text-center">#</span>
                    <span className="w-11" />
                    <span className="flex-1">Title</span>
                    <span className="w-28 text-right">Listeners / Plays</span>
                    <span className="hidden lg:block w-44 xl:w-56">Album</span>
                    <span className="w-[126px] text-right pr-10">Time</span>
                  </div>
                )}

                <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                  {visibleTracks.map((track, idx) => (
                    <TrackRow
                      key={track.id}
                      track={track}
                      index={idx}
                      contextList={tracks}
                      showPlayCount={mode === 'artist'}
                      useTrackNumber={mode === 'album'}
                      onArtistClick={onArtistClick}
                      onAlbumClick={onAlbumClick}
                    />
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Artist Discography (Albums / Singles & EPs / Videos) */}
          {mode === 'artist' && artistData && availableTabs.length > 0 && (
            <section className="space-y-4 cv-section">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="font-display text-lg sm:text-xl font-bold text-zinc-950 dark:text-white">
                  Discography & Videos
                </h2>

                <LayoutGroup id="artist-discography-tabs">
                  <div className="inline-flex items-center gap-0.5 p-1 rounded-full ios-glass-pill self-start">
                    {availableTabs.map((t) => {
                      const active = activeDiscoTab === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setDiscoTab(t.id)}
                          className={`relative px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                            active
                              ? 'text-zinc-950 dark:text-white'
                              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="artist-disco-pill"
                              transition={IOS_SPRING_SNAPPY}
                              className="absolute inset-0 rounded-full bg-white/95 dark:bg-white/[0.16] shadow-xs"
                            />
                          )}
                          <span className="relative z-10">
                            {t.label} ({t.count})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </LayoutGroup>
              </div>

              {activeDiscoTab === 'videos' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {videos.map((vid) => (
                    <button
                      key={vid.id}
                      type="button"
                      onClick={() => handleWatchArtistVideo(vid.title, vid.thumbnail)}
                      className="group p-2.5 rounded-[22px] ios-glass-card text-left hover:-translate-y-0.5 active:scale-[0.98] transition-all"
                    >
                      <div className="relative aspect-video rounded-2xl overflow-hidden mb-2.5 bg-zinc-900">
                        <Artwork
                          src={vid.thumbnail}
                          alt={vid.title}
                          className="w-full h-full transition-transform duration-300 group-hover:scale-[1.03]"
                          rounded="rounded-2xl"
                        />
                        <span className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="w-11 h-11 rounded-full bg-[#FF4D2E] text-white flex items-center justify-center shadow-lg">
                            <Film className="w-5 h-5" />
                          </span>
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-[#FF4D2E]">
                        {vid.title}
                      </div>
                      {vid.subtitle && (
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                          {vid.subtitle}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3.5">
                  {(activeDiscoTab === 'singles' ? singles : albums).map((alb) => (
                    <button
                      key={alb.id}
                      type="button"
                      onClick={() => onAlbumClick(alb.title, artistData.name)}
                      className="group p-2.5 rounded-[22px] ios-glass-card text-left hover:-translate-y-0.5 active:scale-[0.97] transition-all"
                    >
                      <Artwork
                        src={alb.artwork}
                        alt={alb.title}
                        className="w-full aspect-square mb-2.5 transition-transform duration-300 group-hover:scale-[1.03]"
                        rounded="rounded-2xl"
                      />
                      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-[#FF4D2E]">
                        {alb.title}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1.5">
                        <Disc3 className="w-3 h-3 shrink-0" />
                        <span className="truncate">
                          {alb.releaseType || 'Album'}
                          {alb.releaseYear ? ` · ${alb.releaseYear}` : ''}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Fans Also Like */}
          {mode === 'artist' && relatedArtists.length > 0 && (
            <section className="space-y-3.5 cv-section">
              <h2 className="font-display text-lg sm:text-xl font-bold text-zinc-950 dark:text-white">
                Fans Also Like
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3.5">
                {relatedArtists.slice(0, 10).map((rel) => (
                  <button
                    key={rel.id}
                    type="button"
                    onClick={() => onArtistClick(rel.name)}
                    className="group p-3 rounded-[22px] ios-glass-card text-center hover:-translate-y-0.5 active:scale-[0.97] transition-all"
                  >
                    <Artwork
                      src={rel.artwork}
                      alt={rel.name}
                      className="w-24 h-24 mx-auto mb-2.5 transition-transform duration-300 group-hover:scale-[1.04]"
                      rounded="rounded-full"
                    />
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-[#FF4D2E]">
                      {rel.name}
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                      {rel.monthlyListenersText
                        ? `${rel.monthlyListenersText} monthly`
                        : 'Artist'}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* About Artist Bio & Stats Card */}
          {mode === 'artist' && artistData?.bio && (
            <section className="rounded-[26px] ios-glass p-5 sm:p-6 space-y-3 cv-section">
              <h2 className="font-display text-lg font-bold text-zinc-950 dark:text-white">
                About {artistData.name}
              </h2>
              <p
                className={`text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 ${
                  bioExpanded ? '' : 'line-clamp-3'
                }`}
              >
                {artistData.bio}
              </p>
              {artistData.bio.length > 180 && (
                <button
                  type="button"
                  onClick={() => setBioExpanded((v) => !v)}
                  className="text-xs font-semibold text-[#FF4D2E] hover:underline"
                >
                  {bioExpanded ? 'Show less' : 'Read full biography'}
                </button>
              )}
            </section>
          )}

          {/* Classic iOS Album Copyright & Release Footer */}
          {mode === 'album' && albumData && (albumData.releaseDate || albumData.recordLabel) && (
            <footer className="px-2 pt-2 text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
              {albumData.releaseDate && (
                <div className="font-mono tabular-nums">Released {albumData.releaseDate}</div>
              )}
              {albumData.recordLabel && <div>{albumData.recordLabel}</div>}
            </footer>
          )}
        </>
      )}
    </div>
  );
}
