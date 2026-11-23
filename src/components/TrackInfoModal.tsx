import { AnimatePresence, motion } from 'motion/react';
import { Disc3, Film, Info, Play, Radio, User, X } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { formatDuration, formatRegionLabel } from '../utils/format';
import { getTrackPlayCount } from '../utils/listeningStats';
import { IOS_SPRING_SHEET } from '../utils/motion';
import { Artwork } from './Artwork';

interface TrackInfoModalProps {
  onArtistClick: (name: string) => void;
  onAlbumClick: (title: string, artist: string) => void;
}

export function TrackInfoModal({ onArtistClick, onAlbumClick }: TrackInfoModalProps) {
  const {
    trackInfoTarget,
    setTrackInfoTarget,
    currentTrack,
    streamInfo,
    startArtistRadio,
    openMusicVideo,
    playNextInQueue,
  } = usePlayer();

  const track = trackInfoTarget;
  const playCount = track ? getTrackPlayCount(track.id) : 0;
  const isPlayingThis = Boolean(track && currentTrack?.id === track.id);

  return (
    <AnimatePresence>
      {track && (
        <motion.div
          key="track-info-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setTrackInfoTarget(null)}
          className="fixed inset-0 z-[78] flex items-end sm:items-center justify-center p-2.5 sm:p-5 bg-black/55"
          role="dialog"
          aria-modal="true"
          aria-label="Track Details and Credits"
        >
          <motion.div
            initial={{ y: 36, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 28, opacity: 0, scale: 0.96 }}
            transition={IOS_SPRING_SHEET}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-[28px] ios-glass p-5 sm:p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-[#FF4D2E]" />
                <h2 className="font-display text-base font-bold text-zinc-950 dark:text-white">
                  Track Info &amp; Credits
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setTrackInfoTarget(null)}
                aria-label="Close track details"
                className="w-8 h-8 rounded-full ios-glass-pill flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3.5">
              <Artwork
                src={track.artwork}
                alt={track.title}
                className="w-16 h-16 shrink-0 shadow-md"
                rounded="rounded-2xl"
                thumb
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <h3 className="font-display text-base font-bold text-zinc-950 dark:text-white truncate">
                  {track.title}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    const mainArtist = track.artist.split(/,|&|feat\.|ft\./i)[0]?.trim() || track.artist;
                    setTrackInfoTarget(null);
                    onArtistClick(mainArtist);
                  }}
                  className="text-xs font-medium text-[#FF4D2E] hover:underline truncate block text-left"
                >
                  {track.artist}
                </button>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                  {track.album || 'Single'}
                </p>
              </div>
            </div>

            <div className="rounded-2xl ios-glass-card divide-y divide-black/[0.05] dark:divide-white/[0.07] text-xs">
              <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                <span className="text-zinc-500 dark:text-zinc-400">Album / Release</span>
                {track.album && track.album !== 'Single' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setTrackInfoTarget(null);
                      onAlbumClick(track.album, track.artist);
                    }}
                    className="font-medium text-zinc-900 dark:text-zinc-100 hover:text-[#FF4D2E] truncate max-w-[60%] text-right"
                  >
                    {track.album}
                  </button>
                ) : (
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">Single</span>
                )}
              </div>

              <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                <span className="text-zinc-500 dark:text-zinc-400">Genre &amp; Region</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {track.genre || 'Music'} · {formatRegionLabel(track.region)}
                </span>
              </div>

              <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                <span className="text-zinc-500 dark:text-zinc-400">Duration</span>
                <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                  {track.durationSec > 0 ? formatDuration(track.durationSec) : 'Auto'}
                </span>
              </div>

              {track.releaseYear && (
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-zinc-500 dark:text-zinc-400">Release Year</span>
                  <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                    {track.releaseYear}
                  </span>
                </div>
              )}

              <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                <span className="text-zinc-500 dark:text-zinc-400">Catalog Source</span>
                <span className="font-mono uppercase text-[11px] text-zinc-900 dark:text-zinc-100">
                  {isPlayingThis && streamInfo
                    ? `${streamInfo.source} (${streamInfo.fullLength ? 'Full' : '30s Preview'})`
                    : track.source}
                </span>
              </div>

              <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                <span className="text-zinc-500 dark:text-zinc-400">Your Plays</span>
                <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                  {playCount > 0 ? `${playCount}x played` : 'Not played yet'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  void startArtistRadio(track);
                  setTrackInfoTarget(null);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shadow-sm"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Artist Radio</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  openMusicVideo(track);
                  setTrackInfoTarget(null);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full ios-glass-pill text-xs font-semibold text-zinc-800 dark:text-zinc-100 active:scale-95 transition-all"
              >
                <Film className="w-3.5 h-3.5 text-[#FF4D2E]" />
                <span>Watch MV</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  playNextInQueue(track);
                  setTrackInfoTarget(null);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full ios-glass-pill text-xs font-medium text-zinc-700 dark:text-zinc-200 active:scale-95 transition-all"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Play Next</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const mainArtist = track.artist.split(/,|&|feat\.|ft\./i)[0]?.trim() || track.artist;
                  setTrackInfoTarget(null);
                  onArtistClick(mainArtist);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full ios-glass-pill text-xs font-medium text-zinc-700 dark:text-zinc-200 active:scale-95 transition-all"
              >
                <User className="w-3.5 h-3.5" />
                <span>Open Artist</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
