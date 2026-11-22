import { memo } from 'react';
import { Film, Heart, Pause, Play } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import type { Track } from '../types/music';
import { formatRegionLabel } from '../utils/format';
import { Artwork } from './Artwork';

interface TrackCardProps {
  track: Track;
  contextList?: Track[];
  onArtistClick?: (artistName: string) => void;
}

export const TrackCard = memo(function TrackCard({
  track,
  contextList,
  onArtistClick,
}: TrackCardProps) {
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    playTrack,
    togglePlayPause,
    openMusicVideo,
    isLiked,
    toggleLike,
  } = usePlayer();

  const isCurrent = currentTrack?.id === track.id;
  const liked = isLiked(track.id);

  const handlePlay = () => {
    if (isCurrent) {
      togglePlayPause();
    } else {
      playTrack(track, contextList);
    }
  };

  return (
    <div className="group flex flex-col w-full min-w-0 rounded-[22px] p-2.5 ios-glass-card hover:-translate-y-0.5 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]">
      <div className="relative w-full aspect-square rounded-2xl overflow-hidden mb-2.5">
        <button
          type="button"
          onClick={handlePlay}
          aria-label={`Play ${track.title} by ${track.artist}`}
          className="w-full h-full block focus-visible:outline-2 focus-visible:outline-[#FF4D2E] active:scale-[0.98] transition-transform duration-150"
        >
          <Artwork
            src={track.artwork}
            alt={track.title}
            className="w-full h-full transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.035]"
            rounded="rounded-2xl"
          />
        </button>

        {/* Bottom gradient scrim on hover */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

        {/* Watch MV quick button on hover */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openMusicVideo(track, contextList);
          }}
          title="Watch Music Video"
          aria-label={`Watch music video for ${track.title}`}
          className="absolute bottom-2.5 left-2.5 h-8 px-2.5 rounded-full flex items-center gap-1 bg-black/70 border border-white/20 text-white text-[11px] font-medium opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 active:scale-95 transition-all duration-200 hover:bg-black/85"
        >
          <Film className="w-3 h-3" />
          <span>MV</span>
        </button>

        {/* Floating Play / Pause Button */}
        <button
          type="button"
          onClick={handlePlay}
          aria-label={isCurrent && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
          className={`absolute bottom-2.5 right-2.5 w-10 h-10 rounded-full flex items-center justify-center shadow-[0_6px_18px_rgba(255,77,46,0.4)] active:scale-90 transition-all duration-200 ${
            isCurrent
              ? 'bg-[#FF4D2E] text-white opacity-100 translate-y-0'
              : 'bg-[#FF4D2E] text-white opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0'
          }`}
        >
          {isCurrent && isBuffering ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : isCurrent && isPlaying ? (
            <Pause className="w-4 h-4 fill-white" />
          ) : (
            <Play className="w-4 h-4 fill-white ml-0.5" />
          )}
        </button>

        {/* Subtle Like button on hover */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleLike(track);
          }}
          aria-label={liked ? `Unlike ${track.title}` : `Like ${track.title}`}
          className={`absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center bg-black/60 border border-white/15 active:scale-90 transition-all duration-200 ${
            liked ? 'opacity-100 text-[#FF4D2E]' : 'opacity-0 group-hover:opacity-100 text-white/90 hover:text-white'
          }`}
        >
          <Heart className={`w-3.5 h-3.5 ${liked ? 'fill-current' : ''}`} />
        </button>
      </div>

      <button
        type="button"
        onClick={handlePlay}
        className={`flex items-center gap-1.5 text-left text-sm font-semibold max-w-full hover:underline ${
          isCurrent ? 'text-[#FF4D2E]' : 'text-zinc-900 dark:text-zinc-100'
        }`}
      >
        <span className="truncate">{track.title}</span>
        {track.explicit && (
          <span
            title="Explicit"
            className="shrink-0 inline-flex items-center justify-center w-3.5 h-3.5 rounded-[4px] bg-zinc-400/30 dark:bg-white/15 text-[9px] font-bold text-zinc-700 dark:text-zinc-300"
          >
            E
          </span>
        )}
      </button>

      <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 truncate mt-1">
        {onArtistClick ? (
          <button
            type="button"
            onClick={() => onArtistClick(track.artist.split(/,|&|feat\.|ft\./i)[0]?.trim() || track.artist)}
            className="hover:text-zinc-900 dark:hover:text-zinc-200 hover:underline truncate"
          >
            {track.artist}
          </button>
        ) : (
          <span className="truncate">{track.artist}</span>
        )}
        <span aria-hidden="true">·</span>
        <span className="shrink-0">{formatRegionLabel(track.region)}</span>
      </div>
    </div>
  );
});
