import type Hls from 'hls.js';
import {
  Film,
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { usePlayer } from '../context/PlayerContext';
import type { MusicVideoResult } from '../types/music';
import { formatDuration } from '../utils/format';

export interface NativeMvPlayerHandle {
  seekTo: (seconds: number) => void;
}

interface NativeMvPlayerProps {
  mvData: MusicVideoResult;
  poster?: string;
  onTimeUpdate?: (seconds: number) => void;
  onSwitchToAudio: () => void;
}

export const NativeMvPlayer = forwardRef<NativeMvPlayerHandle, NativeMvPlayerProps>(
  function NativeMvPlayer({ mvData, poster, onTimeUpdate, onSwitchToAudio }, ref) {
    const { volume, muted, setVolume, toggleMute } = usePlayer();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const hlsRef = useRef<Hls | null>(null);

    const [playing, setPlaying] = useState(false);
    const [buffering, setBuffering] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(mvData.durationSec || 0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [controlsVisible, setControlsVisible] = useState(true);
    const hideTimerRef = useRef<number | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        seekTo: (seconds: number) => {
          const video = videoRef.current;
          if (!video) return;
          video.currentTime = Math.max(0, seconds);
          setCurrentTime(video.currentTime);
        },
      }),
      [],
    );

    const scheduleControlsHide = useCallback(() => {
      setControlsVisible(true);
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
      hideTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, 2800);
    }, []);

    useEffect(() => {
      return () => {
        if (hideTimerRef.current !== null) {
          window.clearTimeout(hideTimerRef.current);
        }
      };
    }, []);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      video.muted = muted;
      video.volume = muted ? 0 : volume;
    }, [volume, muted]);

    useEffect(() => {
      const onFsChange = () => {
        setIsFullscreen(Boolean(document.fullscreenElement));
      };
      document.addEventListener('fullscreenchange', onFsChange);
      return () => document.removeEventListener('fullscreenchange', onFsChange);
    }, []);

    useEffect(() => {
      const video = videoRef.current;
      if (!video || !mvData.streamUrl) return;

      let cancelled = false;
      setError(null);
      setBuffering(true);
      setPlaying(false);
      setCurrentTime(0);
      setDuration(mvData.durationSec || 0);

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      const startPlayback = async () => {
        if (cancelled) return;
        video.muted = muted;
        video.volume = muted ? 0 : volume;
        try {
          await video.play();
        } catch {
          if (cancelled) return;
          video.muted = true;
          try {
            await video.play();
          } catch {
            if (!cancelled) setBuffering(false);
          }
        }
      };

      const attach = async () => {
        if (mvData.streamType === 'hls') {
          const { default: HlsLib } = await import('hls.js');
          if (cancelled) return;
          if (HlsLib.isSupported()) {
            const hls = new HlsLib({ enableWorker: false, lowLatencyMode: false });
            hlsRef.current = hls;
            hls.loadSource(mvData.streamUrl!);
            hls.attachMedia(video);
            hls.on(HlsLib.Events.MANIFEST_PARSED, () => {
              void startPlayback();
            });
            hls.on(HlsLib.Events.ERROR, (_evt, data) => {
              if (!data.fatal || cancelled) return;
              if (data.type === HlsLib.ErrorTypes.NETWORK_ERROR) {
                hls.startLoad();
                return;
              }
              hls.destroy();
              hlsRef.current = null;
              setBuffering(false);
              setError('Video stream unavailable for this track');
            });
            return;
          }
        }
        video.src = mvData.streamUrl!;
        video.load();
        void startPlayback();
      };

      void attach();

      return () => {
        cancelled = true;
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        video.pause();
        video.removeAttribute('src');
        video.load();
      };
    }, [mvData.streamUrl, mvData.streamType, mvData.durationSec]);

    const togglePlay = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      scheduleControlsHide();
      if (video.paused) {
        video.muted = muted;
        video.volume = muted ? 0 : volume;
        void video.play().catch(() => {});
      } else {
        video.pause();
      }
    }, [muted, volume, scheduleControlsHide]);

    const handleSeek = useCallback(
      (seconds: number) => {
        const video = videoRef.current;
        if (!video) return;
        scheduleControlsHide();
        video.currentTime = Math.max(0, seconds);
        setCurrentTime(video.currentTime);
      },
      [scheduleControlsHide],
    );

    const toggleFullscreen = useCallback(() => {
      const el = containerRef.current;
      if (!el) return;
      if (!document.fullscreenElement) {
        void el.requestFullscreen?.().catch(() => {});
      } else {
        void document.exitFullscreen?.().catch(() => {});
      }
    }, []);

    if (error) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-white/85 space-y-3 bg-zinc-950">
          <Film className="w-9 h-9 text-zinc-400" />
          <p className="text-sm font-medium">{error}</p>
          <button
            type="button"
            onClick={onSwitchToAudio}
            className="px-4 py-2 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] transition-colors"
          >
            Switch to Audio Stream
          </button>
        </div>
      );
    }

    const effectiveDuration = duration > 0 ? duration : mvData.durationSec || 0;
    const progressPct =
      effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;

    return (
      <div
        ref={containerRef}
        onMouseMove={scheduleControlsHide}
        onTouchStart={scheduleControlsHide}
        className="relative w-full h-full bg-black select-none group overflow-hidden"
      >
        <video
          ref={videoRef}
          poster={poster || mvData.thumbnail}
          playsInline
          preload="auto"
          onClick={togglePlay}
          onPlay={() => {
            setPlaying(true);
            setBuffering(false);
          }}
          onPlaying={() => {
            setPlaying(true);
            setBuffering(false);
          }}
          onPause={() => setPlaying(false)}
          onWaiting={() => setBuffering(true)}
          onCanPlay={() => setBuffering(false)}
          onTimeUpdate={() => {
            const t = videoRef.current?.currentTime || 0;
            setCurrentTime(t);
            onTimeUpdate?.(t);
          }}
          onDurationChange={() => {
            const d = videoRef.current?.duration;
            if (d && Number.isFinite(d) && d > 0) {
              setDuration(d);
            }
          }}
          onError={() => {
            if (!videoRef.current?.currentSrc) return;
            setBuffering(false);
            setError('Video stream interrupted');
          }}
          className="w-full h-full object-contain cursor-pointer"
        />

        {/* Top subtle Audixify scrim title */}
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 p-4 bg-gradient-to-b from-black/65 via-black/25 to-transparent transition-opacity duration-200 ${
            controlsVisible || !playing ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-white/70 tracking-wide">
                Audixify Cinema
              </p>
              {mvData.title && (
                <p className="text-xs font-semibold text-white truncate">{mvData.title}</p>
              )}
            </div>
          </div>
        </div>

        {/* Center buffering / paused affordance */}
        {(buffering || !playing) && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {buffering ? (
              <div className="w-12 h-12 rounded-full bg-black/55 border border-white/15 flex items-center justify-center">
                <span className="w-5 h-5 border-2 border-white/30 border-t-[#FF4D2E] rounded-full animate-spin" />
              </div>
            ) : (
              <button
                type="button"
                onClick={togglePlay}
                aria-label="Play music video"
                className="pointer-events-auto w-14 h-14 rounded-full bg-[#FF4D2E]/95 text-white flex items-center justify-center shadow-xl hover:scale-105 transition-transform"
              >
                <Play className="w-6 h-6 fill-white ml-0.5" />
              </button>
            )}
          </div>
        )}

        {/* Bottom Liquid Glass Player Controls */}
        <div
          className={`absolute inset-x-0 bottom-0 p-3 pt-8 bg-gradient-to-t from-black/85 via-black/45 to-transparent transition-opacity duration-200 ${
            controlsVisible || !playing ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="space-y-2">
            <input
              type="range"
              min={0}
              max={effectiveDuration || 100}
              value={Math.min(currentTime, effectiveDuration || 100)}
              onChange={(e) => handleSeek(Number(e.target.value))}
              aria-label="Seek music video"
              className="w-full ios-slider"
              style={{
                background: `linear-gradient(to right, #FF4D2E ${progressPct}%, rgba(255,255,255,0.28) ${progressPct}%)`,
              }}
            />

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={playing ? 'Pause music video' : 'Play music video'}
                  className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
                >
                  {playing ? (
                    <Pause className="w-4 h-4 fill-white" />
                  ) : (
                    <Play className="w-4 h-4 fill-white ml-0.5" />
                  )}
                </button>

                <span className="text-[11px] font-mono tabular-nums text-white/85">
                  {formatDuration(currentTime)} / {formatDuration(effectiveDuration)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    scheduleControlsHide();
                    toggleMute();
                  }}
                  aria-label={muted ? 'Unmute video' : 'Mute video'}
                  className="w-8 h-8 rounded-full bg-white/12 hover:bg-white/22 text-white flex items-center justify-center transition-colors"
                >
                  {muted || volume === 0 ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>

                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    scheduleControlsHide();
                    setVolume(Number(e.target.value));
                  }}
                  aria-label="Video volume"
                  className="hidden sm:block w-16 ios-slider"
                  style={{
                    background: `linear-gradient(to right, #FF4D2E ${Math.round(
                      (muted ? 0 : volume) * 100,
                    )}%, rgba(255,255,255,0.28) ${Math.round((muted ? 0 : volume) * 100)}%)`,
                  }}
                />

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  className="w-8 h-8 rounded-full bg-white/12 hover:bg-white/22 text-white flex items-center justify-center transition-colors"
                >
                  {isFullscreen ? (
                    <Minimize className="w-4 h-4" />
                  ) : (
                    <Maximize className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
);
