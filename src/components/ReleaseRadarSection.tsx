import { useEffect, useMemo, useState } from 'react';
import { Disc3, Play, Radio, RefreshCw } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import type { ReleaseRadarPayload } from '../types/music';
import { apiFetch } from '../utils/apiFetch';
import { Artwork } from './Artwork';
import { TrackCard } from './TrackCard';

interface ReleaseRadarSectionProps {
  onArtistClick: (name: string) => void;
  onAlbumClick?: (title: string, artist: string) => void;
}

export function ReleaseRadarSection({ onArtistClick, onAlbumClick }: ReleaseRadarSectionProps) {
  const { followedArtists, playTrack } = usePlayer();
  const [data, setData] = useState<ReleaseRadarPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const artistKey = useMemo(
    () =>
      followedArtists
        .slice(0, 10)
        .map((a) => a.name.trim())
        .filter(Boolean)
        .join(','),
    [followedArtists],
  );

  useEffect(() => {
    if (!artistKey) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    apiFetch(`/api/release-radar?artists=${encodeURIComponent(artistKey)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load release radar');
        return (await res.json()) as ReleaseRadarPayload;
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setError('Unable to refresh Release Radar right now.');
        setLoading(false);
      });

    return () => controller.abort();
  }, [artistKey, reloadTick]);

  if (followedArtists.length === 0) {
    return (
      <section className="rounded-[24px] ios-glass-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#FF4D2E]/15 text-[#FF4D2E] flex items-center justify-center shrink-0">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display text-base font-bold text-zinc-950 dark:text-white">
              Release Radar
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Follow artis favoritmu (seperti Tulus, Bernadya, Dewa 19, atau Hindia) untuk
              mendapatkan update rilis &amp; lagu terbaru mereka di sini.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3.5 cv-section" aria-label="Release Radar">
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#FF4D2E]/15 text-[#FF4D2E] flex items-center justify-center shrink-0">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-lg md:text-xl font-bold text-zinc-950 dark:text-white">
              Release Radar
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Rilisan terbaru dari {followedArtists.length} artis yang kamu follow
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setReloadTick((n) => n + 1)}
            disabled={loading}
            aria-label="Refresh Release Radar"
            className="w-8 h-8 rounded-full ios-glass-pill flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:text-[#FF4D2E] active:scale-90 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {data && data.tracks.length > 0 && (
            <button
              type="button"
              onClick={() => playTrack(data.tracks[0], data.tracks)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shadow-sm"
            >
              <Play className="w-3 h-3 fill-white" />
              <span>Play Radar</span>
            </button>
          )}
        </div>
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 animate-pulse">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-square rounded-2xl ios-glass-card" />
              <div className="h-3.5 w-3/4 rounded bg-black/[0.06] dark:bg-white/[0.06]" />
            </div>
          ))}
        </div>
      ) : error && !data ? (
        <div className="rounded-2xl ios-glass-card p-5 text-xs text-zinc-500 dark:text-zinc-400">
          {error}
        </div>
      ) : data && data.tracks.length > 0 ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {data.tracks.slice(0, 10).map((track) => (
              <TrackCard
                key={`radar-${track.id}`}
                track={track}
                contextList={data.tracks}
                onArtistClick={onArtistClick}
              />
            ))}
          </div>

          {onAlbumClick && data.releases.length > 0 && (
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1 no-scrollbar">
              {data.releases.slice(0, 8).map((rel) => (
                <button
                  key={rel.id}
                  type="button"
                  onClick={() => onAlbumClick(rel.title, rel.artist)}
                  className="shrink-0 flex items-center gap-2.5 pr-3.5 pl-1.5 py-1.5 rounded-full ios-glass-card hover:border-[#FF4D2E]/40 active:scale-95 transition-all"
                >
                  <Artwork
                    src={rel.artwork}
                    alt={rel.title}
                    className="w-8 h-8"
                    rounded="rounded-full"
                    thumb
                  />
                  <div className="text-left max-w-[160px]">
                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {rel.title}
                    </div>
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate flex items-center gap-1">
                      <Disc3 className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">
                        {rel.artist}
                        {rel.releaseYear ? ` · ${rel.releaseYear}` : ''}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl ios-glass-card p-5 text-xs text-zinc-500 dark:text-zinc-400">
          Belum ada rilisan baru ditemukan dari artis yang kamu follow.
        </div>
      )}
    </section>
  );
}
