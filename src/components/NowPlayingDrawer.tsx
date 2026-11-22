import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Film,
  Headphones,
  Heart,
  ListMusic,
  ListPlus,
  Mic2,
  Moon,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  Sliders,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlayer, usePlayerProgress } from '../context/PlayerContext';
import type { LyricsPayload } from '../types/music';
import { apiFetch } from '../utils/apiFetch';
import { formatDuration } from '../utils/format';
import { IOS_SPRING, IOS_SPRING_SHEET, IOS_SPRING_SNAPPY } from '../utils/motion';
import { Artwork } from './Artwork';
import { NativeMvPlayer, type NativeMvPlayerHandle } from './NativeMvPlayer';
import { ShareLyricsModal } from './ShareLyricsModal';

interface NowPlayingDrawerProps {
  onArtistClick: (name: string) => void;
}

export function NowPlayingDrawer({ onArtistClick }: NowPlayingDrawerProps) {
  const {
    currentTrack,
    queue,
    queueIndex,
    isPlaying,
    isBuffering,
    streamInfo,
    streamError,
    mediaMode,
    setMediaMode,
    mvData,
    mvLoading,
    shuffle,
    repeat,
    sleepEndsAt,
    sleepAfterTrack,
    setSleepTimer,
    nowPlayingOpen,
    setNowPlayingOpen,
    togglePlayPause,
    nextTrack,
    prevTrack,
    seekTo,
    toggleShuffle,
    cycleRepeat,
    playFromQueueIndex,
    removeFromQueue,
    shuffleQueue,
    clearQueue,
    addToQueue,
    isLiked,
    toggleLike,
    showToast,
    eqSettings,
    setEqModalOpen,
    showRemainingTime,
    toggleRemainingTime,
  } = usePlayer();
  const { currentTime, duration } = usePlayerProgress();
  const { preferences } = useAuth();
  const syncedTextClass =
    preferences.lyricsSize === 'compact'
      ? 'text-base sm:text-lg'
      : preferences.lyricsSize === 'large'
        ? 'text-xl sm:text-2xl'
        : 'text-lg sm:text-xl';
  const plainTextClass =
    preferences.lyricsSize === 'compact'
      ? 'text-xs sm:text-sm'
      : preferences.lyricsSize === 'large'
        ? 'text-base sm:text-lg'
        : 'text-sm sm:text-base';

  const [tab, setTab] = useState<'lyrics' | 'queue'>('lyrics');
  const [lyrics, setLyrics] = useState<LyricsPayload | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [videoTime, setVideoTime] = useState(0);
  const [manualScrollPaused, setManualScrollPaused] = useState(false);
  const [sleepMenuOpen, setSleepMenuOpen] = useState(false);
  const [shareLyricsOpen, setShareLyricsOpen] = useState(false);
  const [shareInitialLine, setShareInitialLine] = useState(0);

  const activeLineRef = useRef<HTMLButtonElement | null>(null);
  const lyricsBoxRef = useRef<HTMLDivElement | null>(null);
  const mvPlayerRef = useRef<NativeMvPlayerHandle | null>(null);
  const sleepMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVideoTime(0);
    setManualScrollPaused(false);
  }, [currentTrack?.id, mediaMode]);

  useEffect(() => {
    if (!nowPlayingOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNowPlayingOpen(false);
      } else if (
        e.key === ' ' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'BUTTON'
      ) {
        e.preventDefault();
        togglePlayPause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nowPlayingOpen, setNowPlayingOpen, togglePlayPause]);

  useEffect(() => {
    if (!sleepMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (sleepMenuRef.current && !sleepMenuRef.current.contains(e.target as Node)) {
        setSleepMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [sleepMenuOpen]);

  useEffect(() => {
    if (!currentTrack || !nowPlayingOpen) return;

    const controller = new AbortController();
    setLyricsLoading(true);
    setLyrics(null);
    const qs = new URLSearchParams({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album || '',
      durationSec: String(currentTrack.durationSec || 0),
    });

    apiFetch(`/api/lyrics?${qs.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('Lyrics fetch failed');
        return (await res.json()) as LyricsPayload;
      })
      .then((data) => {
        setLyrics({
          found: Boolean(data?.found),
          synced: Boolean(data?.synced),
          lines: Array.isArray(data?.lines) ? data.lines : [],
          plainText: typeof data?.plainText === 'string' ? data.plainText : '',
          sourceName: data?.sourceName,
        });
        setLyricsLoading(false);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setLyrics({ found: false, synced: false, lines: [], plainText: '' });
        setLyricsLoading(false);
      });

    return () => controller.abort();
  }, [currentTrack?.id, nowPlayingOpen]);

  const activeTime = mediaMode === 'video' ? videoTime : currentTime;

  const activeLineIdx = useMemo(() => {
    if (!lyrics?.synced || !lyrics.lines.length) return -1;
    let idx = -1;
    for (let i = 0; i < lyrics.lines.length; i++) {
      if (activeTime >= lyrics.lines[i].timeSec - 0.3) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [lyrics, activeTime]);

  const shareableLyricLines = useMemo(() => {
    if (!lyrics?.found) return [];
    if (lyrics.synced && lyrics.lines.length > 0) {
      return lyrics.lines.map((l) => l.text).filter(Boolean);
    }
    if (lyrics.plainText) {
      return lyrics.plainText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    }
    return [];
  }, [lyrics]);

  const scrollToActiveLine = () => {
    const container = lyricsBoxRef.current;
    const activeEl = activeLineRef.current;
    if (!container || !activeEl) return;
    const targetTop =
      activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  };

  useEffect(() => {
    if (tab !== 'lyrics' || manualScrollPaused) return;
    scrollToActiveLine();
  }, [activeLineIdx, tab, manualScrollPaused]);

  const liked = currentTrack ? isLiked(currentTrack.id) : false;
  const effectiveDuration = duration > 0 ? duration : currentTrack?.durationSec || 0;
  const remainingSec = Math.max(0, effectiveDuration - currentTime);
  const progressPct =
    effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;
  const hasSleepTimer = Boolean(sleepEndsAt || sleepAfterTrack);

  const handleShareTrack = async () => {
    if (!currentTrack) return;
    const text = `${currentTrack.title} — ${currentTrack.artist} on Audixify`;
    try {
      if (navigator.share) {
        await navigator.share({ title: text, url: window.location.href });
        return;
      }
      await navigator.clipboard.writeText(text);
      showToast('Track info copied');
    } catch {
      showToast('Ready to share');
    }
  };

  return (
    <AnimatePresence>
      {nowPlayingOpen && currentTrack && (
        <motion.div
          key="now-playing-sheet"
          initial={{ y: '100%', opacity: 0.7 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0.7 }}
          transition={IOS_SPRING_SHEET}
          className="fixed inset-0 z-50 ios-ambient-canvas flex flex-col overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Now Playing"
        >
          {/* Fast lightweight ambient backdrop (replaces expensive blur-[100px] on low RAM) */}
          {currentTrack.artwork && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-20 dark:opacity-25 blur-2xl scale-110 bg-cover bg-center"
              style={{ backgroundImage: `url(${currentTrack.artwork})` }}
            />
          )}

          {/* Top iOS Sheet Handle + Floating Header */}
          <div className="relative z-10 px-4 pt-2 md:px-6 shrink-0 space-y-1.5">
            <div className="flex justify-center md:hidden">
              <span className="w-10 h-1 rounded-full bg-zinc-400/50 dark:bg-white/25" />
            </div>

            <div className="h-14 px-3 md:px-5 rounded-[22px] ios-glass flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setNowPlayingOpen(false)}
                aria-label="Close Now Playing"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white min-h-[40px] px-2 rounded-full hover:bg-black/[0.04] dark:hover:bg-white/[0.07] active:scale-95 transition-all"
              >
                <ChevronDown className="w-5 h-5" />
                <span className="hidden sm:inline">Back</span>
              </button>

              {/* Audio vs Video MV Switch */}
              <LayoutGroup id="sheet-media-mode">
                <div className="inline-flex items-center gap-0.5 p-1 rounded-full ios-glass-pill">
                  <button
                    type="button"
                    onClick={() => setMediaMode('audio')}
                    className={`relative inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      mediaMode === 'audio' ? 'text-zinc-950 dark:text-white' : 'text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {mediaMode === 'audio' && (
                      <motion.span
                        layoutId="now-playing-mode-pill"
                        transition={IOS_SPRING_SNAPPY}
                        className="absolute inset-0 rounded-full bg-white/95 dark:bg-white/[0.16] shadow-xs"
                      />
                    )}
                    <Headphones className="relative z-10 w-3.5 h-3.5" />
                    <span className="relative z-10">Audio</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMediaMode('video')}
                    className={`relative inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      mediaMode === 'video' ? 'text-zinc-950 dark:text-white' : 'text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {mediaMode === 'video' && (
                      <motion.span
                        layoutId="now-playing-mode-pill"
                        transition={IOS_SPRING_SNAPPY}
                        className="absolute inset-0 rounded-full bg-white/95 dark:bg-white/[0.16] shadow-xs"
                      />
                    )}
                    <Film className="relative z-10 w-3.5 h-3.5 text-[#FF4D2E]" />
                    <span className="relative z-10">Video MV</span>
                  </button>
                </div>
              </LayoutGroup>

              {/* Lyrics vs Queue Switch */}
              <LayoutGroup id="sheet-panel-tab">
                <div className="inline-flex items-center gap-0.5 p-1 rounded-full ios-glass-pill">
                  <button
                    type="button"
                    onClick={() => setTab('lyrics')}
                    className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      tab === 'lyrics' ? 'text-zinc-950 dark:text-white' : 'text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {tab === 'lyrics' && (
                      <motion.span
                        layoutId="now-playing-panel-pill"
                        transition={IOS_SPRING_SNAPPY}
                        className="absolute inset-0 rounded-full bg-white/95 dark:bg-white/[0.16] shadow-xs"
                      />
                    )}
                    <Mic2 className="relative z-10 w-3.5 h-3.5" />
                    <span className="relative z-10 hidden sm:inline">Lyrics</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('queue')}
                    className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      tab === 'queue' ? 'text-zinc-950 dark:text-white' : 'text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {tab === 'queue' && (
                      <motion.span
                        layoutId="now-playing-panel-pill"
                        transition={IOS_SPRING_SNAPPY}
                        className="absolute inset-0 rounded-full bg-white/95 dark:bg-white/[0.16] shadow-xs"
                      />
                    )}
                    <ListMusic className="relative z-10 w-3.5 h-3.5" />
                    <span className="relative z-10 hidden sm:inline">Queue ({queue.length})</span>
                  </button>
                </div>
              </LayoutGroup>
            </div>
          </div>

          {/* Main Content */}
          <div className="relative z-10 flex-1 overflow-y-auto px-4 py-5 md:px-10 md:py-7">
            <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
              {/* Left: Cover OR Video MV Stage + Controls */}
              <div className="lg:col-span-6 flex flex-col items-center lg:items-start space-y-5">
                <AnimatePresence mode="wait">
                  {mediaMode === 'video' ? (
                    <motion.div
                      key="mv-stage"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={IOS_SPRING}
                      className="w-full aspect-video rounded-[26px] overflow-hidden border border-white/20 bg-black shadow-2xl"
                    >
                      {mvLoading ? (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-white/80 text-sm">
                          <span className="w-6 h-6 border-2 border-white/30 border-t-[#FF4D2E] rounded-full animate-spin" />
                          <span>Loading Audixify Video Stream...</span>
                        </div>
                      ) : mvData?.found && mvData.streamUrl ? (
                        <NativeMvPlayer
                          ref={mvPlayerRef}
                          key={`${currentTrack.id}-${mvData.streamUrl}`}
                          mvData={mvData}
                          poster={currentTrack.artwork}
                          onTimeUpdate={setVideoTime}
                          onSwitchToAudio={() => setMediaMode('audio')}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-white/80 space-y-3">
                          <Film className="w-9 h-9 text-zinc-400" />
                          <p className="text-sm font-medium">Music Video unavailable for this track</p>
                          <button
                            type="button"
                            onClick={() => setMediaMode('audio')}
                            className="px-4 py-2 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold"
                          >
                            Switch to Audio Stream
                          </button>
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key={`art-${currentTrack.id}`}
                      initial={{ scale: 0.94, opacity: 0.6 }}
                      animate={{
                        scale: isPlaying ? 1 : 0.96,
                        opacity: 1,
                      }}
                      exit={{ scale: 0.94, opacity: 0.6 }}
                      transition={IOS_SPRING}
                      className="w-64 h-64 sm:w-80 sm:h-80 lg:w-full lg:max-w-[380px] lg:aspect-square rounded-[28px] p-1.5 ios-glass"
                    >
                      <Artwork
                        src={currentTrack.artwork}
                        alt={currentTrack.title}
                        className="w-full h-full shadow-2xl"
                        rounded="rounded-[22px]"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className={`w-full ${mediaMode === 'video' ? '' : 'max-w-[380px]'} space-y-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-950 dark:text-white truncate">
                          {currentTrack.title}
                        </h2>
                        {currentTrack.explicit && (
                          <span className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-[4px] bg-zinc-400/30 dark:bg-white/15 text-[10px] font-bold text-zinc-700 dark:text-zinc-300">
                            E
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNowPlayingOpen(false);
                          onArtistClick(currentTrack.artist.split(/,|&/)[0]?.trim() || currentTrack.artist);
                        }}
                        className="text-sm text-zinc-600 dark:text-zinc-300 hover:underline truncate block mt-0.5"
                      >
                        {currentTrack.artist}
                      </button>
                      {mediaMode === 'audio' && (
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1.5">
                          {streamError ? (
                            <span className="text-red-500">{streamError}</span>
                          ) : streamInfo ? (
                            <>
                              <span>{streamInfo.fullLength ? 'Full Audio Stream' : '30s Preview'}</span>
                              <span aria-hidden="true">·</span>
                              <span className="capitalize">{streamInfo.source}</span>
                            </>
                          ) : (
                            <span>Connecting audio stream...</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setEqModalOpen(true)}
                        title="5-Band Equalizer"
                        aria-label="Open 5-Band Equalizer"
                        className={`relative p-2 rounded-full ios-glass-pill active:scale-90 transition-all ${
                          eqSettings.enabled
                            ? 'text-[#FF4D2E]'
                            : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                        }`}
                      >
                        <Sliders className="w-4 h-4" />
                        {eqSettings.playbackRate !== 1 && (
                          <span className="absolute -top-1 -right-1 px-1 rounded-full bg-[#FF4D2E] text-white text-[9px] font-mono font-bold">
                            {eqSettings.playbackRate}x
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleLike(currentTrack)}
                        aria-label="Toggle favorite"
                        className={`p-2 rounded-full ios-glass-pill active:scale-90 transition-all ${
                          liked ? 'text-[#FF4D2E]' : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                        }`}
                      >
                        <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => addToQueue(currentTrack)}
                        aria-label="Add current track to queue"
                        className="p-2 rounded-full ios-glass-pill text-zinc-500 hover:text-zinc-900 dark:hover:text-white active:scale-90 transition-all"
                      >
                        <ListPlus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleShareTrack}
                        aria-label="Share current track"
                        className="p-2 rounded-full ios-glass-pill text-zinc-500 hover:text-zinc-900 dark:hover:text-white active:scale-90 transition-all"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {mediaMode === 'audio' && (
                    <>
                      {/* Scrubber */}
                      <div className="space-y-2">
                        <input
                          type="range"
                          min={0}
                          max={effectiveDuration || 100}
                          value={Math.min(currentTime, effectiveDuration || 100)}
                          onChange={(e) => seekTo(Number(e.target.value))}
                          aria-label="Seek audio position"
                          className="w-full ios-slider"
                          style={{
                            background: `linear-gradient(to right, #FF4D2E ${progressPct}%, rgba(161,161,170,0.28) ${progressPct}%)`,
                          }}
                        />
                        <div className="flex justify-between text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                          <span>{formatDuration(currentTime)}</span>
                          <button
                            type="button"
                            onClick={toggleRemainingTime}
                            title="Tap to toggle remaining / total time"
                            className="hover:text-zinc-900 dark:hover:text-white transition-colors"
                          >
                            {showRemainingTime
                              ? `-${formatDuration(remainingSec)}`
                              : formatDuration(effectiveDuration)}
                          </button>
                        </div>
                      </div>

                      {/* Transport with Shuffle, ±10s Skip, Repeat & Sleep Timer */}
                      <div className="flex items-center justify-between gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={toggleShuffle}
                          aria-label="Toggle shuffle"
                          className={`w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all ${
                            shuffle ? 'text-[#FF4D2E]' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                          }`}
                        >
                          <Shuffle className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <button
                            type="button"
                            onClick={prevTrack}
                            aria-label="Previous track"
                            className="w-11 h-11 rounded-full ios-glass-pill flex items-center justify-center text-zinc-700 dark:text-zinc-200 hover:bg-white/70 dark:hover:bg-white/[0.12] active:scale-90 transition-all"
                          >
                            <SkipBack className="w-4 h-4 fill-current" />
                          </button>

                          <button
                            type="button"
                            onClick={() => seekTo(Math.max(0, currentTime - 10))}
                            aria-label="Rewind 10 seconds"
                            title="-10s"
                            className="relative w-9 h-9 rounded-full flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white active:scale-90 transition-all"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={togglePlayPause}
                            aria-label={isPlaying ? 'Pause' : 'Play'}
                            className="w-16 h-16 rounded-full bg-[#FF4D2E] text-white flex items-center justify-center shadow-[0_10px_28px_rgba(255,77,46,0.42)] hover:bg-[#E63E21] hover:scale-105 active:scale-90 transition-transform"
                          >
                            {isBuffering ? (
                              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : isPlaying ? (
                              <Pause className="w-6 h-6 fill-white" />
                            ) : (
                              <Play className="w-6 h-6 fill-white ml-0.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => seekTo(currentTime + 10)}
                            aria-label="Forward 10 seconds"
                            title="+10s"
                            className="relative w-9 h-9 rounded-full flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white active:scale-90 transition-all"
                          >
                            <RotateCw className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={nextTrack}
                            aria-label="Next track"
                            className="w-11 h-11 rounded-full ios-glass-pill flex items-center justify-center text-zinc-700 dark:text-zinc-200 hover:bg-white/70 dark:hover:bg-white/[0.12] active:scale-90 transition-all"
                          >
                            <SkipForward className="w-4 h-4 fill-current" />
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={cycleRepeat}
                            aria-label={`Repeat mode: ${repeat}`}
                            className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all ${
                              repeat !== 'off' ? 'text-[#FF4D2E]' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                            }`}
                          >
                            {repeat === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
                          </button>

                          {/* Sleep Timer Popover */}
                          <div className="relative" ref={sleepMenuRef}>
                            <button
                              type="button"
                              onClick={() => setSleepMenuOpen((o) => !o)}
                              aria-label="Sleep Timer"
                              title="Sleep Timer"
                              className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all ${
                                hasSleepTimer ? 'text-[#FF4D2E]' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                              }`}
                            >
                              <Moon className="w-4 h-4" />
                            </button>

                            {sleepMenuOpen && (
                              <div className="absolute right-0 bottom-full mb-2 w-44 rounded-[20px] ios-glass p-1.5 text-xs z-40">
                                <div className="px-2.5 py-1.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                                  Sleep Timer
                                </div>
                                {[
                                  { label: 'Off', val: null },
                                  { label: '15 minutes', val: 15 },
                                  { label: '30 minutes', val: 30 },
                                  { label: '45 minutes', val: 45 },
                                  { label: '60 minutes', val: 60 },
                                  { label: 'After this song', val: 'track' as const },
                                ].map((opt) => (
                                  <button
                                    key={opt.label}
                                    type="button"
                                    onClick={() => {
                                      setSleepTimer(opt.val);
                                      setSleepMenuOpen(false);
                                    }}
                                    className="w-full text-left px-2.5 py-1.5 rounded-xl text-zinc-800 dark:text-zinc-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Right: Liquid Glass Lyrics or Queue */}
              <div
                ref={lyricsBoxRef}
                onWheel={() => {
                  if (lyrics?.synced && tab === 'lyrics') setManualScrollPaused(true);
                }}
                onTouchMove={() => {
                  if (lyrics?.synced && tab === 'lyrics') setManualScrollPaused(true);
                }}
                className="relative lg:col-span-6 rounded-[28px] ios-glass p-6 min-h-[380px] max-h-[68vh] overflow-y-auto"
              >
                {tab === 'lyrics' ? (
                  lyricsLoading ? (
                    <div className="space-y-3 animate-pulse py-6">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className="h-5 rounded-lg bg-black/[0.06] dark:bg-white/[0.06] w-3/4" />
                      ))}
                    </div>
                  ) : !lyrics?.found ? (
                    <div className="h-full flex flex-col items-center justify-center py-16 text-center space-y-2">
                      <Mic2 className="w-8 h-8 text-zinc-400" />
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        Lyrics not available for this track
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        No synchronized or plain lyrics entry was found for &ldquo;{currentTrack.title}&rdquo;.
                      </p>
                    </div>
                  ) : lyrics.synced ? (
                    <>
                      <div className="sticky top-0 z-20 flex items-center justify-end gap-2 pb-2 pointer-events-none">
                        {manualScrollPaused && (
                          <button
                            type="button"
                            onClick={() => {
                              setManualScrollPaused(false);
                              scrollToActiveLine();
                            }}
                            className="pointer-events-auto px-3 py-1.5 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold shadow-md active:scale-95 transition-transform"
                          >
                            Resume Sync
                          </button>
                        )}
                        {shareableLyricLines.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setShareInitialLine(Math.max(0, activeLineIdx));
                              setShareLyricsOpen(true);
                            }}
                            className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ios-glass-pill text-xs font-semibold text-zinc-800 dark:text-zinc-100 hover:text-[#FF4D2E] shadow-sm active:scale-95 transition-all"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-[#FF4D2E]" />
                            <span>Share Lyrics</span>
                          </button>
                        )}
                      </div>
                      <div className="space-y-3.5 py-2">
                        {lyrics.lines.map((line, i) => {
                          const active = i === activeLineIdx;
                          return (
                            <button
                              key={`${line.timeSec}-${i}`}
                              ref={active ? activeLineRef : undefined}
                              type="button"
                              onClick={() => {
                                setManualScrollPaused(false);
                                if (mediaMode === 'video') {
                                  mvPlayerRef.current?.seekTo(line.timeSec);
                                } else {
                                  seekTo(line.timeSec);
                                }
                              }}
                              className={`block w-full text-left font-display ${syncedTextClass} leading-snug transition-all duration-200 ${
                                active
                                  ? 'text-[#FF4D2E] font-bold scale-[1.01] origin-left opacity-100'
                                  : 'text-zinc-700 dark:text-zinc-300 opacity-55 hover:opacity-90'
                              }`}
                            >
                              {line.text}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="space-y-3">
                      {shareableLyricLines.length > 0 && (
                        <div className="sticky top-0 z-20 flex justify-end pointer-events-none">
                          <button
                            type="button"
                            onClick={() => {
                              setShareInitialLine(0);
                              setShareLyricsOpen(true);
                            }}
                            className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ios-glass-pill text-xs font-semibold text-zinc-800 dark:text-zinc-100 hover:text-[#FF4D2E] shadow-sm active:scale-95 transition-all"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-[#FF4D2E]" />
                            <span>Share Lyrics</span>
                          </button>
                        </div>
                      )}
                      <pre className={`whitespace-pre-wrap font-sans ${plainTextClass} leading-relaxed text-zinc-700 dark:text-zinc-300`}>
                        {lyrics.plainText}
                      </pre>
                    </div>
                  )
                ) : queue.length === 0 ? (
                  <div className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
                    Queue is empty.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-black/[0.06] dark:border-white/[0.08]">
                      <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                        Up Next ({queue.length})
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={shuffleQueue}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full ios-glass-pill text-[11px] font-medium text-zinc-700 dark:text-zinc-200 hover:text-[#FF4D2E] active:scale-95 transition-all"
                        >
                          <Shuffle className="w-3 h-3" />
                          <span>Shuffle Upcoming</span>
                        </button>
                        {queue.length > 1 && (
                          <button
                            type="button"
                            onClick={clearQueue}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full ios-glass-pill text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:text-red-500 active:scale-95 transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Clear</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      {queue.map((item, idx) => {
                        const active = idx === queueIndex;
                        return (
                          <div
                            key={`${item.id}-${idx}`}
                            className={`flex items-center gap-3 px-3 py-2 rounded-2xl transition-colors ${
                              active
                                ? 'bg-white/75 dark:bg-white/[0.11] shadow-xs'
                                : 'hover:bg-white/50 dark:hover:bg-white/[0.06]'
                            }`}
                          >
                            <span className="w-6 text-xs font-mono tabular-nums text-zinc-400">
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                            <button
                              type="button"
                              onClick={() => playFromQueueIndex(idx)}
                              className="flex items-center gap-3 min-w-0 flex-1 text-left"
                            >
                              <Artwork src={item.artwork} alt={item.title} className="w-10 h-10" rounded="rounded-xl" thumb />
                              <div className="min-w-0">
                                <div
                                  className={`text-sm font-medium truncate ${
                                    active ? 'text-[#FF4D2E]' : 'text-zinc-900 dark:text-zinc-100'
                                  }`}
                                >
                                  {item.title}
                                </div>
                                <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                  {item.artist}
                                </div>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => removeFromQueue(idx)}
                              aria-label={`Remove ${item.title} from queue`}
                              className="p-1.5 text-zinc-400 hover:text-red-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <ShareLyricsModal
            open={shareLyricsOpen}
            onClose={() => setShareLyricsOpen(false)}
            track={currentTrack}
            lyricLines={shareableLyricLines}
            initialLineIndex={shareInitialLine}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
