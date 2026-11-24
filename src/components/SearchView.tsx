import { LayoutGroup, motion } from 'motion/react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Clock,
  Disc3,
  ListPlus,
  Mic2,
  Pause,
  Play,
  Quote,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import type { LyricSearchPayload, SearchPayload } from '../types/music';
import { apiFetch } from '../utils/apiFetch';
import { formatDuration, formatRegionLabel } from '../utils/format';
import { IOS_SPRING_SNAPPY } from '../utils/motion';
import { Artwork } from './Artwork';
import { TrackRow } from './TrackRow';

interface SearchViewProps {
  query: string;
  results: SearchPayload | null;
  loading: boolean;
  error: string | null;
  onQuickQuery: (q: string) => void;
  onArtistClick: (name: string) => void;
  onAlbumClick: (title: string, artist: string) => void;
}

const RECENT_SEARCHES_KEY = 'audixify_recent_searches_v1';

const SUGGESTED_SEARCHES = [
  'Dewa 19',
  'Tulus',
  'Sheila On 7',
  'Slank',
  'Justin Bieber',
  'Bernadya',
  'Hindia',
  'NewJeans',
  'YOASOBI',
  'Bruno Mars',
];

const SUGGESTED_LYRIC_LINES = [
  'separuh nafasku terbang bersama dirimu',
  'hati-hati di jalan',
  'dan bila esok datang kembali',
  'aku yang dulu bukanlah yang sekarang',
  'baby you light up my world',
  'kau begitu sempurna dimataku',
];

type SearchMode = 'catalog' | 'lyrics';
type SearchTab = 'all' | 'songs' | 'artists' | 'albums';

function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 8)
      : [];
  } catch {
    return [];
  }
}

function HighlightedLyricSnippet({ snippet, query }: { snippet: string; query: string }) {
  const tokens = useMemo(
    () =>
      Array.from(
        new Set(
          query
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .split(/\s+/)
            .filter((t) => t.length >= 2),
        ),
      ),
    [query],
  );

  if (!tokens.length) return <>{snippet}</>;

  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'giu');
  const parts = snippet.split(regex);

  return (
    <>
      {parts.map((part, idx) => {
        const isMatch = tokens.some((t) => part.toLowerCase() === t);
        return isMatch ? (
          <mark
            key={idx}
            className="bg-[#FF4D2E]/18 text-[#FF4D2E] dark:text-[#FF7A5E] font-semibold px-0.5 rounded"
          >
            {part}
          </mark>
        ) : (
          <Fragment key={idx}>{part}</Fragment>
        );
      })}
    </>
  );
}

export function SearchView({
  query,
  results,
  loading,
  error,
  onQuickQuery,
  onArtistClick,
  onAlbumClick,
}: SearchViewProps) {
  const { currentTrack, isPlaying, playTrack, togglePlayPause, addToQueue } = usePlayer();
  const [mode, setMode] = useState<SearchMode>('catalog');
  const [tab, setTab] = useState<SearchTab>('all');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => loadRecentSearches());
  const [lyricInput, setLyricInput] = useState(query);
  const [lyricResults, setLyricResults] = useState<LyricSearchPayload | null>(null);
  const [lyricLoading, setLyricLoading] = useState(false);
  const [lyricError, setLyricError] = useState<string | null>(null);

  useEffect(() => {
    setLyricInput(query);
  }, [query]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) return;
    if (mode === 'catalog' && results && results.tracks.length + results.artists.length > 0) {
      setRecentSearches((prev) => {
        const next = [trimmed, ...prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 8);
        try {
          localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    }
  }, [query, results, mode]);

  // Debounced live lyric search when in 'lyrics' mode
  useEffect(() => {
    if (mode !== 'lyrics') return;
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setLyricResults(null);
      setLyricError(null);
      setLyricLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLyricLoading(true);
      setLyricError(null);
      apiFetch(`/api/lyrics-search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error('Pencarian lirik sedang sibuk');
          return (await res.json()) as LyricSearchPayload;
        })
        .then((payload) => {
          setLyricResults(payload);
          setLyricLoading(false);
          if (payload.hits.length > 0) {
            setRecentSearches((prev) => {
              const next = [trimmed, ...prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 8);
              try {
                localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
              } catch {}
              return next;
            });
          }
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return;
          setLyricError('Gagal mencocokkan lirik. Coba penggalan baris lirik yang lebih spesifik.');
          setLyricLoading(false);
        });
    }, 340);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [mode, query]);

  const clearRecentSearches = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {}
  };

  const handleLyricSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onQuickQuery(lyricInput.trim());
  };

  const modeSwitcher = (
    <LayoutGroup id="search-mode-pills">
      <div className="inline-flex items-center gap-0.5 p-1 rounded-full ios-glass-pill w-fit">
        <button
          type="button"
          onClick={() => setMode('catalog')}
          className={`relative inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            mode === 'catalog'
              ? 'text-zinc-950 dark:text-white'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          {mode === 'catalog' && (
            <motion.span
              layoutId="search-mode-active"
              transition={IOS_SPRING_SNAPPY}
              className="absolute inset-0 rounded-full bg-white/95 dark:bg-white/[0.16] shadow-xs"
            />
          )}
          <Search className="w-3.5 h-3.5 relative z-10" />
          <span className="relative z-10">Katalog Lagu</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('lyrics')}
          className={`relative inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            mode === 'lyrics'
              ? 'text-zinc-950 dark:text-white'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          {mode === 'lyrics' && (
            <motion.span
              layoutId="search-mode-active"
              transition={IOS_SPRING_SNAPPY}
              className="absolute inset-0 rounded-full bg-white/95 dark:bg-white/[0.16] shadow-xs"
            />
          )}
          <Mic2 className="w-3.5 h-3.5 relative z-10 text-[#FF4D2E]" />
          <span className="relative z-10">Cari dari Lirik</span>
        </button>
      </div>
    </LayoutGroup>
  );

  // Empty query landing state
  if (!query.trim()) {
    return (
      <div className="py-6 md:py-10 max-w-3xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl md:text-3xl font-bold text-zinc-950 dark:text-white">
              {mode === 'lyrics' ? 'Cari Lagu dari Penggalan Lirik' : 'Search the full catalog'}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {mode === 'lyrics'
                ? 'Ingat sepenggal liriknya saja? Masukkan 2–8 kata lirik untuk menemukan judul dan penyanyinya secara akurat.'
                : 'Find Indonesian, Asian, and international songs, artists, and albums scraped live across multiple music sources.'}
            </p>
          </div>
          {modeSwitcher}
        </div>

        {mode === 'lyrics' && (
          <form onSubmit={handleLyricSubmit} className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Quote className="w-4 h-4 text-[#FF4D2E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={lyricInput}
                onChange={(e) => {
                  setLyricInput(e.target.value);
                  onQuickQuery(e.target.value);
                }}
                placeholder="Ketik sepenggal lirik, misal: separuh nafasku terbang..."
                className="w-full h-11 pl-10 pr-4 rounded-2xl ios-glass text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#FF4D2E]/50"
              />
            </div>
            <button
              type="submit"
              className="px-5 h-11 rounded-2xl bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shrink-0"
            >
              Temukan Lagu
            </button>
          </form>
        )}

        {recentSearches.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                <Clock className="w-3.5 h-3.5 text-[#FF4D2E]" />
                <span>Recent searches</span>
              </div>
              <button
                type="button"
                onClick={clearRecentSearches}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                <X className="w-3 h-3" />
                <span>Clear</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentSearches.map((term) => (
                <button
                  key={`recent-q-${term}`}
                  type="button"
                  onClick={() => onQuickQuery(term)}
                  className="px-4 py-2 rounded-full text-xs font-medium ios-glass-pill text-zinc-800 dark:text-zinc-200 hover:text-[#FF4D2E] hover:bg-white/80 dark:hover:bg-white/[0.12] active:scale-95 transition-all"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2.5">
          <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            {mode === 'lyrics' ? 'Coba cari dengan lirik ini' : 'Popular searches'}
          </div>
          <div className="flex flex-wrap gap-2">
            {(mode === 'lyrics' ? SUGGESTED_LYRIC_LINES : SUGGESTED_SEARCHES).map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => onQuickQuery(term)}
                className="px-4 py-2 rounded-full text-xs font-medium ios-glass-pill text-zinc-800 dark:text-zinc-200 hover:text-[#FF4D2E] hover:bg-white/80 dark:hover:bg-white/[0.12] active:scale-95 transition-all"
              >
                {mode === 'lyrics' ? `“${term}”` : term}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Lyric finder results mode
  if (mode === 'lyrics') {
    const hits = lyricResults?.hits ?? [];
    const lyricContextTracks = hits.map((h) => h.track);

    return (
      <div className="space-y-6 pb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#FF4D2E] uppercase tracking-wider mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Accurate Lyric Match</span>
            </div>
            <h1 className="font-display text-xl md:text-2xl font-bold text-zinc-950 dark:text-white">
              Lirik cocok untuk &ldquo;{query}&rdquo;
            </h1>
          </div>
          {modeSwitcher}
        </div>

        <form onSubmit={handleLyricSubmit} className="flex flex-col sm:flex-row gap-2.5 max-w-2xl">
          <div className="relative flex-1">
            <Quote className="w-4 h-4 text-[#FF4D2E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={lyricInput}
              onChange={(e) => {
                setLyricInput(e.target.value);
                onQuickQuery(e.target.value);
              }}
              placeholder="Ketik baris lirik lebih panjang untuk hasil makin akurat..."
              className="w-full h-10 pl-10 pr-8 rounded-2xl ios-glass text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#FF4D2E]/50"
            />
            {lyricInput && (
              <button
                type="button"
                onClick={() => {
                  setLyricInput('');
                  onQuickQuery('');
                }}
                aria-label="Clear lyric query"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="px-4 h-10 rounded-2xl bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shrink-0"
          >
            Cari Lirik
          </button>
        </form>

        {query.trim().length < 3 ? (
          <div className="rounded-[24px] ios-glass p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Masukkan minimal 3 huruf dari baris lirik agar pencocokan akurat.
          </div>
        ) : lyricLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="h-24 rounded-[22px] ios-glass-card animate-pulse" />
            ))}
          </div>
        ) : lyricError ? (
          <div className="rounded-[24px] ios-glass p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {lyricError}
          </div>
        ) : hits.length === 0 ? (
          <div className="rounded-[24px] ios-glass p-10 text-center space-y-2">
            <Mic2 className="w-8 h-8 text-zinc-400 mx-auto" />
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Belum ada baris lirik yang cocok persis
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Coba ketik 3–6 kata dari bagian chorus/reff lagu, atau pindah ke tab Katalog Lagu.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {hits.map((hit) => {
              const t = hit.track;
              const isCurrent = currentTrack?.id === t.id;
              return (
                <div
                  key={`${t.id}-${hit.matchedSnippet.slice(0, 18)}`}
                  className={`rounded-[24px] ios-glass-card p-4 flex flex-col gap-3 transition-all ${
                    isCurrent ? 'ring-1 ring-[#FF4D2E]/60' : ''
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <button
                      type="button"
                      onClick={() => (isCurrent ? togglePlayPause() : playTrack(t, lyricContextTracks))}
                      aria-label={`Play ${t.title}`}
                      className="relative group shrink-0 rounded-2xl overflow-hidden active:scale-95 transition-transform"
                    >
                      <Artwork src={t.artwork} alt={t.title} className="w-16 h-16" rounded="rounded-2xl" thumb />
                      <span
                        className={`absolute inset-0 bg-black/45 flex items-center justify-center transition-opacity ${
                          isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        {isCurrent && isPlaying ? (
                          <Pause className="w-5 h-5 text-white fill-white" />
                        ) : (
                          <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                        )}
                      </span>
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => (isCurrent ? togglePlayPause() : playTrack(t, lyricContextTracks))}
                          className={`text-left text-sm font-bold truncate hover:underline ${
                            isCurrent ? 'text-[#FF4D2E]' : 'text-zinc-950 dark:text-white'
                          }`}
                        >
                          {t.title}
                        </button>
                        {hit.synced && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 text-[10px] font-semibold">
                            Synced
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => onArtistClick(t.artist.split(/,|&/)[0]?.trim() || t.artist)}
                        className="text-xs text-zinc-600 dark:text-zinc-300 hover:underline truncate block mt-0.5"
                      >
                        {t.artist}
                      </button>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                        {t.album} · {formatDuration(t.durationSec)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => addToQueue(t)}
                      aria-label={`Add ${t.title} to queue`}
                      title="Add to queue"
                      className="p-2 rounded-full ios-glass-pill text-zinc-500 hover:text-[#FF4D2E] active:scale-90 transition-all shrink-0"
                    >
                      <ListPlus className="w-4 h-4" />
                    </button>
                  </div>

                  <blockquote className="rounded-2xl bg-black/[0.04] dark:bg-white/[0.05] border-l-2 border-[#FF4D2E] px-3.5 py-2.5 text-xs text-zinc-700 dark:text-zinc-200 leading-relaxed whitespace-pre-line">
                    <HighlightedLyricSnippet snippet={hit.matchedSnippet} query={query} />
                  </blockquote>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Standard Catalog Search mode
  const tracks = results?.tracks ?? [];
  const artists = results?.artists ?? [];
  const albums = results?.albums ?? [];

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-xl md:text-2xl font-bold text-zinc-950 dark:text-white">
            Results for &ldquo;{query}&rdquo;
          </h1>
          {modeSwitcher}
        </div>

        <LayoutGroup id="search-tab-pills">
          <div className="inline-flex items-center gap-0.5 p-1 rounded-full ios-glass-pill self-start">
            {(['all', 'songs', 'artists', 'albums'] as SearchTab[]).map((t) => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`relative px-3.5 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                    active
                      ? 'text-zinc-950 dark:text-white'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="search-active-pill"
                      transition={IOS_SPRING_SNAPPY}
                      className="absolute inset-0 rounded-full bg-white/95 dark:bg-white/[0.16] shadow-xs"
                    />
                  )}
                  <span className="relative z-10">{t}</span>
                </button>
              );
            })}
          </div>
        </LayoutGroup>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="h-14 rounded-2xl ios-glass-card animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-[24px] ios-glass p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {error}
        </div>
      ) : tracks.length === 0 && artists.length === 0 ? (
        <div className="rounded-[24px] ios-glass p-10 text-center space-y-3">
          <Search className="w-8 h-8 text-zinc-400 mx-auto" />
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            No matching songs or artists found
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Mencari berdasarkan potongan lirik lagu? Coba mode Cari dari Lirik.
          </p>
          <button
            type="button"
            onClick={() => setMode('lyrics')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] transition-colors"
          >
            <Mic2 className="w-3.5 h-3.5" />
            <span>Cari &ldquo;{query}&rdquo; di Lirik Akurat</span>
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Artists */}
          {(tab === 'all' || tab === 'artists') && artists.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-base font-bold text-zinc-900 dark:text-zinc-100">
                Artists
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3.5">
                {artists.slice(0, tab === 'artists' ? 12 : 6).map((artist) => (
                  <button
                    key={artist.id}
                    type="button"
                    onClick={() => onArtistClick(artist.name)}
                    className="group p-3 rounded-[22px] ios-glass-card text-center hover:-translate-y-0.5 active:scale-[0.97] transition-all"
                  >
                    <Artwork
                      src={artist.artwork}
                      alt={artist.name}
                      className="w-20 h-20 mx-auto mb-2.5 transition-transform duration-300 group-hover:scale-[1.04]"
                      rounded="rounded-full"
                      thumb
                    />
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-[#FF4D2E]">
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

          {/* Albums */}
          {(tab === 'all' || tab === 'albums') && albums.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-base font-bold text-zinc-900 dark:text-zinc-100">
                Albums
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3.5">
                {albums.slice(0, tab === 'albums' ? 12 : 6).map((album) => (
                  <button
                    key={album.id}
                    type="button"
                    onClick={() => onAlbumClick(album.title, album.artist)}
                    className="group p-2.5 rounded-[22px] ios-glass-card text-left hover:-translate-y-0.5 active:scale-[0.97] transition-all"
                  >
                    <Artwork
                      src={album.artwork}
                      alt={album.title}
                      className="w-full aspect-square mb-2.5 transition-transform duration-300 group-hover:scale-[1.03]"
                      rounded="rounded-2xl"
                    />
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-[#FF4D2E]">
                      {album.title}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5 flex items-center gap-1">
                      <Disc3 className="w-3 h-3 shrink-0" />
                      <span className="truncate">{album.artist}</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Songs */}
          {(tab === 'all' || tab === 'songs') && tracks.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-base font-bold text-zinc-900 dark:text-zinc-100">
                Songs
              </h2>
              <div className="rounded-[26px] ios-glass divide-y divide-black/[0.05] dark:divide-white/[0.06] p-1.5">
                {tracks.map((track, idx) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    index={idx}
                    contextList={tracks}
                    onArtistClick={onArtistClick}
                    onAlbumClick={onAlbumClick}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
