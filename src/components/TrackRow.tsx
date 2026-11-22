import { memo, useEffect, useRef, useState } from 'react';
import {
  Film,
  Heart,
  ListPlus,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { useSharedPlaylistsContext } from '../context/SharedPlaylistsContext';
import type { Track } from '../types/music';
import { formatDuration, formatRegionLabel } from '../utils/format';
import { Artwork } from './Artwork';

interface TrackRowProps {
  track: Track;
  index?: number;
  contextList?: Track[];
  showPlayCount?: boolean;
  useTrackNumber?: boolean;
  onArtistClick?: (artistName: string) => void;
  onAlbumClick?: (albumTitle: string, artistName: string) => void;
  onRemoveFromPlaylist?: () => void;
}

export const TrackRow = memo(function TrackRow({
  track,
  index,
  contextList,
  showPlayCount = false,
  useTrackNumber = false,
  onArtistClick,
  onAlbumClick,
  onRemoveFromPlaylist,
}: TrackRowProps) {
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    playTrack,
    togglePlayPause,
    openMusicVideo,
    isLiked,
    toggleLike,
    addToQueue,
    playNextInQueue,
    playlists,
    addTrackToPlaylist,
    createPlaylist,
    showToast,
  } = usePlayer();
  const { sharedPlaylists, addTrackToSharedPlaylist } = useSharedPlaylistsContext();

  const [menuOpen, setMenuOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isCurrent = currentTrack?.id === track.id;
  const liked = isLiked(track.id);

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  const handlePlayClick = () => {
    if (isCurrent) {
      togglePlayPause();
    } else {
      playTrack(track, contextList);
    }
  };

  const handleCreateAndAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    createPlaylist(newPlaylistName.trim(), '', track);
    setNewPlaylistName('');
    setMenuOpen(false);
  };

  const displayNum = useTrackNumber && track.trackNumber
    ? track.trackNumber
    : typeof index === 'number'
      ? index + 1
      : null;

  return (
    <div
      className={`group relative flex items-center gap-3 px-2.5 sm:px-3 py-2 rounded-2xl transition-colors duration-150 ${
        isCurrent
          ? 'bg-white/75 dark:bg-white/[0.11] shadow-xs'
          : 'hover:bg-white/55 dark:hover:bg-white/[0.06]'
      }`}
    >
      {/* Index or Play state */}
      {displayNum !== null && (
        <button
          type="button"
          onClick={handlePlayClick}
          aria-label={isCurrent && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
          className="w-7 h-7 shrink-0 flex items-center justify-center text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400"
        >
          {isCurrent && isPlaying ? (
            <span className="flex items-end gap-[2px] h-3.5" aria-hidden="true">
              <span className="w-[2.5px] h-full bg-[#FF4D2E] rounded-full animate-eq-1" />
              <span className="w-[2.5px] h-full bg-[#FF4D2E] rounded-full animate-eq-2" />
              <span className="w-[2.5px] h-full bg-[#FF4D2E] rounded-full animate-eq-3" />
            </span>
          ) : (
            <>
              <span className={`group-hover:hidden ${isCurrent ? 'text-[#FF4D2E] font-medium' : ''}`}>
                {String(displayNum).padStart(2, '0')}
              </span>
              <span className="hidden group-hover:flex items-center justify-center text-zinc-900 dark:text-zinc-100">
                <Play className="w-3.5 h-3.5 fill-current" />
              </span>
            </>
          )}
        </button>
      )}

      {/* Artwork with hover play trigger (thumb={true} saves ~9x texture RAM) */}
      <button
        type="button"
        onClick={handlePlayClick}
        aria-label={`Play ${track.title} by ${track.artist}`}
        className="relative shrink-0 rounded-xl overflow-hidden focus-visible:outline-2 focus-visible:outline-[#FF4D2E] active:scale-95 transition-transform"
      >
        <Artwork src={track.artwork} alt={track.title} className="w-11 h-11" rounded="rounded-xl" thumb />
        <div
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
        </div>
      </button>

      {/* Title & Artist */}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={handlePlayClick}
          className={`flex items-center gap-1.5 text-left text-sm font-medium max-w-full hover:underline ${
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
        <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
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
          {showPlayCount && track.playCountText ? (
            <>
              <span aria-hidden="true" className="md:hidden">·</span>
              <span className="md:hidden font-mono tabular-nums text-[11px] text-zinc-500 dark:text-zinc-400 shrink-0">
                {track.playCountText}
              </span>
            </>
          ) : (
            <>
              <span aria-hidden="true">·</span>
              <span className="shrink-0">{formatRegionLabel(track.region)}</span>
            </>
          )}
        </div>
      </div>

      {/* Per-song Play Count column (Artist Profile Desktop) */}
      {showPlayCount && (
        <div className="hidden md:block w-28 text-right text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0">
          {track.playCountText || '—'}
        </div>
      )}

      {/* Album column (desktop) */}
      <div className="hidden lg:block w-44 xl:w-56 min-w-0">
        {track.album && track.album !== 'Single' && onAlbumClick ? (
          <button
            type="button"
            onClick={() => onAlbumClick(track.album, track.artist)}
            className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:underline truncate block max-w-full text-left"
          >
            {track.album}
          </button>
        ) : (
          <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate block">
            {track.album || 'Single'}
          </span>
        )}
      </div>

      {/* Actions & Duration */}
      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
        <button
          type="button"
          onClick={() => openMusicVideo(track, contextList)}
          title="Watch Music Video"
          aria-label={`Watch music video for ${track.title}`}
          className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-full text-zinc-400 hover:text-[#FF4D2E] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
        >
          <Film className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => toggleLike(track)}
          aria-label={liked ? `Remove ${track.title} from liked songs` : `Like ${track.title}`}
          className={`min-w-[38px] min-h-[38px] flex items-center justify-center rounded-full transition-all ${
            liked
              ? 'text-[#FF4D2E]'
              : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
          }`}
        >
          <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
        </button>

        <span className="w-11 text-right text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400 hidden sm:inline-block">
          {track.durationSec > 0 ? formatDuration(track.durationSec) : '—'}
        </span>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={`More options for ${track.title}`}
            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 bottom-full mb-1.5 z-40 w-60 rounded-[22px] ios-glass p-1.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  openMusicVideo(track, contextList);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-zinc-800 dark:text-zinc-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
              >
                <Film className="w-3.5 h-3.5 text-[#FF4D2E]" />
                <span>Watch Music Video</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  playNextInQueue(track);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-zinc-800 dark:text-zinc-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Play Next</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  addToQueue(track);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-zinc-800 dark:text-zinc-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
              >
                <ListPlus className="w-3.5 h-3.5" />
                <span>Add to Queue</span>
              </button>

              {onRemoveFromPlaylist && (
                <button
                  type="button"
                  onClick={() => {
                    onRemoveFromPlaylist();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove from Playlist</span>
                </button>
              )}

              <div className="my-1 border-t border-black/[0.06] dark:border-white/[0.08]" />
              <div className="px-3 py-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Add to Playlist
              </div>

              {playlists.length > 0 && (
                <div className="max-h-32 overflow-y-auto space-y-0.5">
                  {playlists.map((pl) => (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => {
                        addTrackToPlaylist(pl.id, track);
                        setMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-left text-zinc-800 dark:text-zinc-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] truncate"
                    >
                      <span className="truncate">{pl.name}</span>
                      <Plus className="w-3 h-3 shrink-0 text-zinc-400" />
                    </button>
                  ))}
                </div>
              )}

              {sharedPlaylists.length > 0 && (
                <>
                  <div className="my-1 border-t border-black/[0.06] dark:border-white/[0.08]" />
                  <div className="px-3 py-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                    <Users className="w-3 h-3 text-[#FF4D2E]" />
                    <span>Playlist Bersama</span>
                  </div>
                  <div className="max-h-28 overflow-y-auto space-y-0.5">
                    {sharedPlaylists.map((spl) => (
                      <button
                        key={spl.id}
                        type="button"
                        onClick={() => {
                          void addTrackToSharedPlaylist(spl.id, track).then((status) => {
                            if (status === 'added') showToast(`Added to ${spl.name}`);
                            else if (status === 'exists') showToast(`Already in ${spl.name}`);
                          });
                          setMenuOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-left text-zinc-800 dark:text-zinc-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] truncate"
                      >
                        <span className="truncate">{spl.name}</span>
                        <Plus className="w-3 h-3 shrink-0 text-[#FF4D2E]" />
                      </button>
                    ))}
                  </div>
                </>
              )}

              <form onSubmit={handleCreateAndAdd} className="mt-1 flex items-center gap-1 px-1.5 pb-1">
                <input
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="New playlist..."
                  className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-black/[0.04] dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:border-[#FF4D2E]"
                />
                <button
                  type="submit"
                  className="px-2 py-1.5 rounded-lg bg-[#FF4D2E] text-white font-medium hover:bg-[#E63E21] shrink-0"
                >
                  Add
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
