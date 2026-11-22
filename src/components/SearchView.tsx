import { LayoutGroup, motion } from 'motion/react';
import { useState } from 'react';
import { Disc3, Search } from 'lucide-react';
import type { SearchPayload } from '../types/music';
import { formatRegionLabel } from '../utils/format';
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

type SearchTab = 'all' | 'songs' | 'artists' | 'albums';

export function SearchView({
  query,
  results,
  loading,
  error,
  onQuickQuery,
  onArtistClick,
  onAlbumClick,
}: SearchViewProps) {
  const [tab, setTab] = useState<SearchTab>('all');

  if (!query.trim()) {
    return (
      <div className="py-10 max-w-2xl space-y-6">
        <div className="space-y-2">
          <h1 className="font-display text-2xl md:text-3xl font-bold text-zinc-950 dark:text-white">
            Search the full catalog
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Find Indonesian, Asian, and international songs, artists, and albums scraped live across multiple music sources.
          </p>
        </div>

        <div className="space-y-2.5">
          <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            Popular searches
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_SEARCHES.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => onQuickQuery(term)}
                className="px-4 py-2 rounded-full text-xs font-medium ios-glass-pill text-zinc-800 dark:text-zinc-200 hover:text-[#FF4D2E] hover:bg-white/80 dark:hover:bg-white/[0.12] active:scale-95 transition-all"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const tracks = results?.tracks ?? [];
  const artists = results?.artists ?? [];
  const albums = results?.albums ?? [];

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-zinc-950 dark:text-white">
            Results for &ldquo;{query}&rdquo;
          </h1>
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
        <div className="rounded-[24px] ios-glass p-10 text-center space-y-2">
          <Search className="w-8 h-8 text-zinc-400 mx-auto" />
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            No matching songs or artists found
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Try another song title, artist name, or spelling.
          </p>
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
