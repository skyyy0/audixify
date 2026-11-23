import { useState } from 'react';
import { Play } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import type { DiscoverPayload } from '../types/music';
import { TrackRow } from './TrackRow';

interface ChartsViewProps {
  data: DiscoverPayload | null;
  loading: boolean;
  onArtistClick: (name: string) => void;
  onAlbumClick: (title: string, artist: string) => void;
}

type ChartTab = 'id' | 'asia' | 'global';

export function ChartsView({ data, loading, onArtistClick, onAlbumClick }: ChartsViewProps) {
  const { playTrack } = usePlayer();
  const [tab, setTab] = useState<ChartTab>('id');

  const tabs: Array<{ id: ChartTab; label: string; subtitle: string }> = [
    { id: 'id', label: 'Indonesia Top 25', subtitle: 'Most played songs across Indonesia' },
    { id: 'asia', label: 'Asia Spotlight', subtitle: 'K-Pop, J-Pop, C-Pop, and regional charts' },
    { id: 'global', label: 'Global Top 25', subtitle: 'Worldwide chart leaders' },
  ];

  const activeMeta = tabs.find((t) => t.id === tab)!;
  const list =
    !data
      ? []
      : tab === 'id'
        ? data.indonesiaTop ?? []
        : tab === 'asia'
          ? data.asiaSpotlight ?? []
          : data.globalTop ?? [];

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-zinc-950 dark:text-white">
            Regional Charts
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{activeMeta.subtitle}</p>
        </div>

        {list.length > 0 && (
          <button
            type="button"
            onClick={() => playTrack(list[0], list)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#FF4D2E] text-white text-sm font-semibold hover:bg-[#E63E21] active:scale-95 transition-transform self-start sm:self-auto whitespace-nowrap shadow-md"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Play Chart</span>
          </button>
        )}
      </div>

      {/* Segmented Liquid Glass Chart Tabs */}
      <div className="inline-flex items-center gap-1 p-1 rounded-full ios-glass-pill overflow-x-auto max-w-full">
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap active:scale-95 transition-[background-color,color,transform] duration-250 ease-[cubic-bezier(0.22,1.14,0.36,1)] ${
                active
                  ? 'bg-white/95 dark:bg-white/[0.16] text-zinc-950 dark:text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 12 }).map((_, idx) => (
            <div key={idx} className="h-14 rounded-2xl ios-glass-card animate-pulse" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-[24px] ios-glass-surface p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No chart entries available right now.
        </div>
      ) : (
        <div key={tab} className="rounded-[26px] ios-glass-surface divide-y divide-black/[0.05] dark:divide-white/[0.06] p-1.5 audixify-view-enter">
          {list.map((track, idx) => (
            <TrackRow
              key={track.id}
              track={track}
              index={idx}
              contextList={list}
              onArtistClick={onArtistClick}
              onAlbumClick={onAlbumClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
