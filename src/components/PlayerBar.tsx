import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart3,
  Compass,
  Film,
  Heart,
  Library,
  Maximize2,
  Mic2,
  Moon,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Sliders,
  User,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { usePlayer, usePlayerProgress } from '../context/PlayerContext';
import { formatDuration } from '../utils/format';
import { IOS_SPRING_SNAPPY } from '../utils/motion';
import { Artwork } from './Artwork';
import { LiveSpectrumBars } from './LiveSpectrumBars';
import type { NavDestination } from './Sidebar';

interface PlayerBarProps {
  activeView: NavDestination;
  onNavigate: (view: NavDestination) => void;
  onArtistClick: (name: string) => void;
  onOpenListenTogether?: () => void;
}

function PlayerBarScrubber({ fallbackDuration }: { fallbackDuration: number }) {
  const { currentTime, duration } = usePlayerProgress();
  const { seekTo, showRemainingTime, toggleRemainingTime } = usePlayer();
  const effectiveDuration = duration > 0 ? duration : fallbackDuration;
  const progressPct =
    effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;
  const remainingSec = Math.max(0, effectiveDuration - currentTime);

  return (
    <div className="w-full flex items-center gap-2.5">
      <span className="text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400 w-9 text-right">
        {formatDuration(currentTime)}
      </span>
      <input
        type="range"
        min={0}
        max={effectiveDuration || 100}
        value={Math.min(currentTime, effectiveDuration || 100)}
        onChange={(e) => seekTo(Number(e.target.value))}
        aria-label="Seek audio progress"
        className="flex-1 ios-slider"
        style={{
          background: `linear-gradient(to right, #FF4D2E ${progressPct}%, rgba(161,161,170,0.28) ${progressPct}%)`,
        }}
      />
      <button
        type="button"
        onClick={toggleRemainingTime}
        title="Click to toggle remaining / total time"
        aria-label="Toggle remaining time"
        className="text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white w-11 text-left transition-colors"
      >
        {showRemainingTime ? `-${formatDuration(remainingSec)}` : formatDuration(effectiveDuration)}
      </button>
    </div>
  );
}

function MobileMiniProgressBar({ fallbackDuration }: { fallbackDuration: number }) {
  const { currentTime, duration } = usePlayerProgress();
  const effectiveDuration = duration > 0 ? duration : fallbackDuration;
  const pct = effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;
  return (
    <div className="md:hidden absolute bottom-0 inset-x-4 h-[2px] rounded-full overflow-hidden bg-black/10 dark:bg-white/10 pointer-events-none">
      <div
        className="h-full bg-[#FF4D2E] transition-[width] duration-200 ease-linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function PlayerBar({ activeView, onNavigate, onArtistClick, onOpenListenTogether }: PlayerBarProps) {
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    streamInfo,
    streamError,
    volume,
    muted,
    shuffle,
    repeat,
    sleepEndsAt,
    sleepAfterTrack,
    setNowPlayingOpen,
    openMusicVideo,
    togglePlayPause,
    nextTrack,
    prevTrack,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    isLiked,
    toggleLike,
    eqSettings,
    setEqModalOpen,
  } = usePlayer();

  const volPct = Math.round((muted ? 0 : volume) * 100);
  const liked = currentTrack ? isLiked(currentTrack.id) : false;
  const hasSleepTimer = Boolean(sleepEndsAt || sleepAfterTrack);

  const mobileTabs: Array<{ id: NavDestination; label: string; icon: typeof Compass }> = [
    { id: 'discover', label: 'Home', icon: Compass },
    { id: 'charts', label: 'Charts', icon: BarChart3 },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'library', label: 'Library', icon: Library },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <div className="shrink-0 z-30 px-2 pb-[max(0.375rem,env(safe-area-inset-bottom))] sm:px-3 md:pb-3 space-y-1.5">
      <AnimatePresence>
        {currentTrack ? (
          <motion.div
            key="floating-player-dock"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={IOS_SPRING_SNAPPY}
            className="relative rounded-[22px] md:rounded-[26px] ios-glass px-2.5 sm:px-3 lg:px-5 py-1.5 md:py-2 md:h-[76px] flex items-center justify-between gap-2 sm:gap-3 lg:gap-6 min-w-0"
          >
            <MobileMiniProgressBar fallbackDuration={currentTrack.durationSec || 0} />

            {/* Left: Track Info */}
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 md:flex-initial md:w-[28%]">
              <button
                type="button"
                onClick={() => setNowPlayingOpen(true)}
                aria-label="Expand Now Playing"
                className="relative group shrink-0 rounded-xl overflow-hidden shadow-md active:scale-95 transition-transform"
              >
                <Artwork
                  src={currentTrack.artwork}
                  alt={currentTrack.title}
                  className="w-10 h-10 md:w-12 md:h-12"
                  rounded="rounded-xl"
                  thumb
                />
                {isPlaying && !isBuffering && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-1 rounded-full border border-dashed border-[#FF4D2E]/35 audixify-disc-active"
                  />
                )}
                <span className="hidden md:flex absolute inset-0 bg-black/45 items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <Maximize2 className="w-4 h-4 text-white" />
                </span>
              </button>

              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setNowPlayingOpen(true)}
                  className="block text-left text-xs md:text-sm font-semibold text-zinc-950 dark:text-white truncate max-w-full hover:underline"
                >
                  {currentTrack.title}
                </button>
                <div className="flex items-center gap-1.5 text-[11px] md:text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  <button
                    type="button"
                    onClick={() => onArtistClick(currentTrack.artist.split(/,|&/)[0]?.trim() || currentTrack.artist)}
                    className="hover:text-zinc-900 dark:hover:text-zinc-200 hover:underline truncate"
                  >
                    {currentTrack.artist}
                  </button>
                  {streamError ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-red-500 truncate">{streamError}</span>
                    </>
                  ) : streamInfo && !streamInfo.fullLength ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="shrink-0">30s Preview</span>
                    </>
                  ) : null}
                </div>
              </div>

              <LiveSpectrumBars
                variant="mini"
                active={isPlaying}
                className="hidden xl:flex shrink-0"
              />

              <button
                type="button"
                onClick={() => toggleLike(currentTrack)}
                aria-label={liked ? 'Remove from liked songs' : 'Like song'}
                className={`hidden sm:flex min-w-[40px] min-h-[40px] items-center justify-center rounded-full active:scale-90 transition-all ${
                  liked ? 'text-[#FF4D2E]' : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
              </button>
            </div>

            {/* Center: Transport & Scrubber (Desktop) */}
            <div className="hidden md:flex flex-col items-center gap-1.5 flex-1 max-w-xl">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={toggleShuffle}
                  aria-label="Toggle shuffle"
                  className={`p-1.5 rounded-full active:scale-90 transition-all ${
                    shuffle ? 'text-[#FF4D2E]' : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  <Shuffle className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={prevTrack}
                  aria-label="Previous track"
                  className="p-1.5 rounded-full text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white active:scale-90 transition-all"
                >
                  <SkipBack className="w-4 h-4 fill-current" />
                </button>

                <button
                  type="button"
                  onClick={togglePlayPause}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  className="w-9 h-9 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shadow-md hover:scale-105 active:scale-90 transition-transform"
                >
                  {isBuffering ? (
                    <span className="w-4 h-4 border-2 border-zinc-400 border-t-current rounded-full animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={nextTrack}
                  aria-label="Next track"
                  className="p-1.5 rounded-full text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white active:scale-90 transition-all"
                >
                  <SkipForward className="w-4 h-4 fill-current" />
                </button>

                <button
                  type="button"
                  onClick={cycleRepeat}
                  aria-label={`Repeat mode: ${repeat}`}
                  className={`p-1.5 rounded-full active:scale-90 transition-all ${
                    repeat !== 'off' ? 'text-[#FF4D2E]' : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  {repeat === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
                </button>
              </div>

              <PlayerBarScrubber fallbackDuration={currentTrack.durationSec || 0} />
            </div>

            {/* Right: Watch MV, Lyrics & Volume */}
            <div className="flex items-center gap-1 md:w-auto lg:w-[26%] shrink-0 justify-end">
              {/* Mobile quick EQ + MV + Play + Next (>=40px touch targets) */}
              <div className="flex md:hidden items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setEqModalOpen(true)}
                  aria-label="Open 5-Band Equalizer"
                  className={`relative min-w-[38px] min-h-[40px] flex items-center justify-center rounded-full active:scale-90 transition-transform ${
                    eqSettings.enabled ? 'text-[#FF4D2E]' : 'text-zinc-600 dark:text-zinc-300'
                  }`}
                >
                  <Sliders className="w-4 h-4" />
                  {eqSettings.enabled && (
                    <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#FF4D2E]" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => openMusicVideo(currentTrack)}
                  aria-label="Watch Music Video"
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full text-zinc-700 dark:text-zinc-200 active:scale-90 transition-transform"
                >
                  <Film className="w-4 h-4 text-[#FF4D2E]" />
                </button>
                <button
                  type="button"
                  onClick={togglePlayPause}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full bg-[#FF4D2E] text-white shadow-sm active:scale-90 transition-transform"
                >
                  {isBuffering ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="w-4 h-4 fill-white" />
                  ) : (
                    <Play className="w-4 h-4 fill-white ml-0.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={nextTrack}
                  aria-label="Next track"
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center text-zinc-700 dark:text-zinc-300 active:scale-90 transition-transform"
                >
                  <SkipForward className="w-4 h-4 fill-current" />
                </button>
              </div>

              {/* Desktop Sleep Timer indicator (only if active) */}
              {hasSleepTimer && (
                <button
                  type="button"
                  onClick={() => setNowPlayingOpen(true)}
                  title="Sleep timer active"
                  aria-label="Sleep timer active"
                  className="hidden md:flex min-w-[32px] min-h-[32px] items-center justify-center rounded-full text-[#FF4D2E]"
                >
                  <Moon className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Desktop EQ, MV, Lyrics & Volume */}
              <button
                type="button"
                onClick={() => setEqModalOpen(true)}
                title="5-Band Equalizer (Shortcut: E)"
                aria-label="Open 5-Band Equalizer"
                className={`relative hidden md:flex min-w-[34px] min-h-[34px] items-center justify-center rounded-full active:scale-90 transition-all ${
                  eqSettings.enabled
                    ? 'text-[#FF4D2E] bg-[#FF4D2E]/10'
                    : 'text-zinc-500 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                <Sliders className="w-4 h-4" />
                {eqSettings.enabled && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#FF4D2E]" />
                )}
              </button>

              <button
                type="button"
                onClick={() => openMusicVideo(currentTrack)}
                aria-label="Watch Music Video"
                className="hidden md:inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-medium ios-glass-pill hover:bg-white/80 dark:hover:bg-white/[0.12] text-zinc-800 dark:text-zinc-200 active:scale-95 transition-all"
              >
                <Film className="w-3.5 h-3.5 text-[#FF4D2E]" />
                <span>MV</span>
              </button>

              {onOpenListenTogether && (
                <button
                  type="button"
                  onClick={onOpenListenTogether}
                  title="Listen Together Room"
                  aria-label="Open Listen Together"
                  className="hidden md:flex min-w-[34px] min-h-[34px] items-center justify-center rounded-full text-zinc-500 hover:text-[#FF4D2E] active:scale-90 transition-all"
                >
                  <Users className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setNowPlayingOpen(true)}
                aria-label="Open Lyrics and Queue"
                className="hidden md:flex min-w-[34px] min-h-[34px] items-center justify-center rounded-full text-zinc-500 hover:text-zinc-950 dark:hover:text-white active:scale-90 transition-all"
              >
                <Mic2 className="w-4 h-4" />
              </button>

              <div className="hidden md:flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  className="min-w-[30px] min-h-[30px] flex items-center justify-center text-zinc-500 hover:text-zinc-950 dark:hover:text-white"
                >
                  {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={muted ? 0 : volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  aria-label="Volume"
                  className="hidden lg:block w-20 ios-slider"
                  style={{
                    background: `linear-gradient(to right, #FF4D2E ${volPct}%, rgba(161,161,170,0.28) ${volPct}%)`,
                  }}
                />
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="hidden md:flex rounded-[22px] ios-glass px-5 h-12 items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>Select any song from Indonesia, Asia, or Global charts to stream audio or watch MV.</span>
            <span>Audixify · Built by sky</span>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Floating Liquid Glass Bottom Tab Capsule with GPU translate3d slider */}
      {(() => {
        const activeIdx = Math.max(
          0,
          mobileTabs.findIndex(
            (t) => activeView === t.id || (t.id === 'library' && activeView === 'playlist'),
          ),
        );
        return (
          <nav
            className="md:hidden relative grid grid-cols-5 h-[52px] rounded-[20px] ios-glass p-1 gap-0.5"
            aria-label="Mobile navigation"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/5)] p-0.5 transition-transform duration-300 ease-[cubic-bezier(0.25,1.18,0.38,1)] will-change-transform"
              style={{ transform: `translate3d(${activeIdx * 100}%, 0, 0)` }}
            >
              <div className="w-full h-full rounded-[15px] bg-white/90 dark:bg-white/[0.15] shadow-xs" />
            </div>

            {mobileTabs.map((tab) => {
              const Icon = tab.icon;
              const active =
                activeView === tab.id || (tab.id === 'library' && activeView === 'playlist');
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onNavigate(tab.id)}
                  className={`relative z-10 min-w-0 flex flex-col items-center justify-center gap-0.5 rounded-2xl px-0.5 text-[10px] font-medium active:scale-[0.88] transition-[transform,color] duration-200 ease-[cubic-bezier(0.22,1.15,0.36,1)] ${
                    active ? 'text-[#FF4D2E]' : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.25,1.26,0.38,1)] ${
                      active ? 'scale-110 -translate-y-[1px]' : 'scale-100'
                    }`}
                  />
                  <span className="truncate max-w-full leading-none">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        );
      })()}
    </div>
  );
}
