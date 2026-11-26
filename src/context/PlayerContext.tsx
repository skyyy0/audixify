import type Hls from 'hls.js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  ArtistSummary,
  MusicVideoResult,
  StreamResolution,
  Track,
  UserPlaylist,
} from '../types/music';
import { apiFetch } from '../utils/apiFetch';
import {
  clampEqDb,
  DEFAULT_EQ_SETTINGS,
  EQ_PRESETS,
  loadEqualizerSettings,
  saveEqualizerSettings,
  WebAudioEqualizerEngine,
  type EqPresetId,
  type EqualizerSettings,
} from '../utils/audioEqualizer';
import { useAuth } from './AuthContext';
import {
  clearListeningStats,
  recordListeningSeconds,
  recordTrackPlay,
} from '../utils/listeningStats';

export type RepeatMode = 'off' | 'all' | 'one';
export type ThemeMode = 'dark' | 'light';
export type PlayerMediaMode = 'audio' | 'video';

interface PlayerProgressContextValue {
  currentTime: number;
  duration: number;
}

interface PlayerContextValue {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  isBuffering: boolean;
  streamInfo: StreamResolution | null;
  streamError: string | null;
  mediaMode: PlayerMediaMode;
  setMediaMode: (mode: PlayerMediaMode) => void;
  mvData: MusicVideoResult | null;
  mvLoading: boolean;
  openMusicVideo: (track: Track, contextList?: Track[]) => void;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  likedTracks: Track[];
  playlists: UserPlaylist[];
  recentTracks: Track[];
  followedArtists: ArtistSummary[];
  theme: ThemeMode;
  nowPlayingOpen: boolean;
  setNowPlayingOpen: (open: boolean) => void;
  sleepEndsAt: number | null;
  sleepAfterTrack: boolean;
  setSleepTimer: (option: number | 'track' | null) => void;
  toastMessage: string | null;
  showToast: (message: string) => void;
  toggleTheme: () => void;
  playTrack: (track: Track, contextList?: Track[]) => void;
  playShuffled: (tracks: Track[]) => void;
  playFromQueueIndex: (index: number) => void;
  addToQueue: (track: Track) => void;
  addListToQueue: (tracks: Track[]) => void;
  playNextInQueue: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  shuffleQueue: () => void;
  clearQueue: () => void;
  togglePlayPause: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  isLiked: (trackId: string) => boolean;
  toggleLike: (track: Track) => void;
  isFollowingArtist: (artistName: string) => boolean;
  toggleFollowArtist: (artist: ArtistSummary) => void;
  createPlaylist: (name: string, description?: string, initialTrack?: Track) => UserPlaylist;
  deletePlaylist: (playlistId: string) => void;
  addTrackToPlaylist: (playlistId: string, track: Track) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  restoreLibraryFromCloudData: (data: {
    likedTracks: Track[];
    followedArtists: ArtistSummary[];
    playlists: UserPlaylist[];
  }) => void;
  clearListeningHistory: () => void;
  eqSettings: EqualizerSettings;
  eqModalOpen: boolean;
  setEqModalOpen: (open: boolean) => void;
  setEqEnabled: (enabled: boolean) => void;
  setEqBandGain: (bandIndex: number, gainDb: number) => void;
  selectEqPreset: (presetId: Exclude<EqPresetId, 'custom'>) => void;
  setPreampDb: (db: number) => void;
  setPlaybackRate: (rate: number) => void;
  resetEq: () => void;
  showRemainingTime: boolean;
  toggleRemainingTime: () => void;
  fadeSeconds: 0 | 2 | 4;
  setFadeSeconds: (sec: 0 | 2 | 4) => void;
  statsVersion: number;
  getSpectrumBins: (target: Uint8Array<ArrayBuffer>) => boolean;
  startArtistRadio: (track: Track) => Promise<void>;
  trackInfoTarget: Track | null;
  setTrackInfoTarget: (track: Track | null) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);
const PlayerProgressContext = createContext<PlayerProgressContextValue>({
  currentTime: 0,
  duration: 0,
});

function readStoredJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  setVolume: (vol: number) => void;
  mute: () => void;
  unMute: () => void;
  setPlaybackRate: (rate: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  getVideoData?: () => { video_id?: string };
  loadVideoById: (videoId: string) => void;
  destroy: () => void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      width?: number | string;
      height?: number | string;
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayerInstance }) => void;
        onStateChange?: (e: { data: number; target: YTPlayerInstance }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayerInstance;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<YTNamespace> | null = null;
function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('No window'));
  }
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      ytApiPromise = null;
      reject(new Error('YouTube IFrame API load timeout'));
    }, 10_000);

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeoutId);
      if (typeof prevReady === 'function') {
        try {
          prevReady();
        } catch {}
      }
      if (window.YT?.Player) {
        resolve(window.YT);
      } else {
        ytApiPromise = null;
        reject(new Error('YouTube Player unavailable'));
      }
    };

    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      tag.onerror = () => {
        window.clearTimeout(timeoutId);
        ytApiPromise = null;
        reject(new Error('Failed to load YouTube IFrame API'));
      };
      document.head.appendChild(tag);
    }
  });

  return ytApiPromise;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { preferences } = useAuth();
  const autoplayRef = useRef(preferences.autoplay);
  autoplayRef.current = preferences.autoplay;

  const audioRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const ytSinkRef = useRef<HTMLDivElement | null>(null);
  const ytSinkHostRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const ytActiveRef = useRef(false);
  const ytPollTimerRef = useRef<number | null>(null);
  const ytFallbackQueueRef = useRef<string[]>([]);
  const ytExpectedSeqRef = useRef(0);
  const ytCurrentVideoIdRef = useRef<string>('');
  const eqEngineRef = useRef<WebAudioEqualizerEngine | null>(null);
  const requestSeqRef = useRef(0);
  const mvSeqRef = useRef(0);
  const currentTrackRef = useRef<Track | null>(null);
  const streamInfoRef = useRef<StreamResolution | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [streamInfo, setStreamInfo] = useState<StreamResolution | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

  const [mediaMode, setMediaModeState] = useState<PlayerMediaMode>('audio');
  const [mvData, setMvData] = useState<MusicVideoResult | null>(null);
  const [mvLoading, setMvLoading] = useState(false);

  // Separate progress state prevents timeupdate from re-rendering the entire catalog tree
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [volume, setVolumeState] = useState<number>(() => {
    try {
      localStorage.removeItem('audixify_volume');
      const raw = localStorage.getItem('audixify_volume_v2');
      if (raw === null || raw.trim() === '') return 0.85;
      const saved = Number(raw);
      return Number.isFinite(saved) && saved > 0 && saved <= 1 ? saved : 0.85;
    } catch {
      return 0.85;
    }
  });
  const [muted, setMuted] = useState(false);
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);
  const mediaModeRef = useRef<PlayerMediaMode>(mediaMode);

  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const repeatRef = useRef(repeat);
  repeatRef.current = repeat;
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);

  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null);
  const [sleepAfterTrack, setSleepAfterTrack] = useState(false);
  const sleepAfterTrackRef = useRef(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      return localStorage.getItem('audixify_theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  const [likedTracks, setLikedTracks] = useState<Track[]>(() =>
    readStoredJson<Track[]>('audixify_liked_tracks', []),
  );
  const [playlists, setPlaylists] = useState<UserPlaylist[]>(() =>
    readStoredJson<UserPlaylist[]>('audixify_playlists', []),
  );
  const [recentTracks, setRecentTracks] = useState<Track[]>(() =>
    readStoredJson<Track[]>('audixify_recent_tracks', []),
  );
  const [followedArtists, setFollowedArtists] = useState<ArtistSummary[]>(() =>
    readStoredJson<ArtistSummary[]>('audixify_followed_artists', []),
  );
  const [eqSettings, setEqSettings] = useState<EqualizerSettings>(() => loadEqualizerSettings());
  const eqSettingsRef = useRef(eqSettings);
  eqSettingsRef.current = eqSettings;
  const [eqModalOpen, setEqModalOpen] = useState(false);
  const [showRemainingTime, setShowRemainingTime] = useState(false);

  const [fadeSeconds, setFadeSecondsState] = useState<0 | 2 | 4>(() => {
    try {
      const saved = Number(localStorage.getItem('audixify_fade_sec_v1'));
      return saved === 2 || saved === 4 ? saved : 0;
    } catch {
      return 0;
    }
  });
  const fadeSecondsRef = useRef<0 | 2 | 4>(fadeSeconds);
  fadeSecondsRef.current = fadeSeconds;
  const fadeRafRef = useRef<number | null>(null);

  const [statsVersion, setStatsVersion] = useState(0);
  const [trackInfoTarget, setTrackInfoTarget] = useState<Track | null>(null);
  const lastAudioTimeRef = useRef(0);
  const recordedPlaySeqRef = useRef(0);
  const lastStatsBumpRef = useRef(0);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    streamInfoRef.current = streamInfo;
  }, [streamInfo]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    mediaModeRef.current = mediaMode;
  }, [mediaMode]);

  useEffect(() => {
    sleepAfterTrackRef.current = sleepAfterTrack;
  }, [sleepAfterTrack]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('audixify_theme', theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem('audixify_liked_tracks', JSON.stringify(likedTracks));
    } catch {}
  }, [likedTracks]);

  useEffect(() => {
    try {
      localStorage.setItem('audixify_playlists', JSON.stringify(playlists));
    } catch {}
  }, [playlists]);

  useEffect(() => {
    try {
      localStorage.setItem('audixify_recent_tracks', JSON.stringify(recentTracks));
    } catch {}
  }, [recentTracks]);

  useEffect(() => {
    try {
      localStorage.setItem('audixify_followed_artists', JSON.stringify(followedArtists));
    } catch {}
  }, [followedArtists]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  }, []);

  useEffect(() => {
    saveEqualizerSettings(eqSettings);
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = eqSettings.playbackRate;
      if (eqSettings.enabled) {
        if (!eqEngineRef.current) eqEngineRef.current = new WebAudioEqualizerEngine();
        if (eqEngineRef.current.ensureInitialized(audio)) {
          eqEngineRef.current.applySettings(eqSettings);
        }
      } else if (eqEngineRef.current) {
        eqEngineRef.current.applySettings(eqSettings);
      }
    }
    if (ytPlayerRef.current && ytActiveRef.current) {
      try {
        ytPlayerRef.current.setPlaybackRate(eqSettings.playbackRate);
      } catch {}
    }
  }, [eqSettings]);

  const stopYtPolling = useCallback(() => {
    if (ytPollTimerRef.current !== null) {
      window.clearInterval(ytPollTimerRef.current);
      ytPollTimerRef.current = null;
    }
  }, []);

  // Tear the YT player down completely (not just stopVideo). The YouTube IFrame
  // API replaces the host <div> with its own <iframe>; if we leave that iframe
  // attached, Chrome keeps the embedded player (and its audio pipeline) alive
  // after the app has moved on, which leaves a dead/zombie media session behind
  // and can wedge the browser tab on exit.
  const destroyYtPlayer = useCallback(() => {
    stopYtPolling();
    ytActiveRef.current = false;
    ytFallbackQueueRef.current = [];
    const player = ytPlayerRef.current;
    ytPlayerRef.current = null;
    if (player) {
      try {
        player.stopVideo();
      } catch {}
      try {
        player.destroy();
      } catch {}
    }
    // The API swapped our sink <div> for an <iframe>, so the sink node itself
    // is already detached. Clear the host container to drop the leftover
    // iframe (and its media session) instead of trying to remove the sink.
    const host = ytSinkHostRef.current;
    if (host) {
      try {
        host.replaceChildren();
      } catch {}
    }
    ytSinkRef.current = null;
    ytCurrentVideoIdRef.current = '';
  }, [stopYtPolling]);

  const stopYtPlayer = useCallback(() => {
    stopYtPolling();
    ytActiveRef.current = false;
    ytFallbackQueueRef.current = [];
    if (ytPlayerRef.current) {
      try {
        ytPlayerRef.current.stopVideo();
      } catch {}
    }
  }, [stopYtPolling]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (fadeRafRef.current !== null) {
        window.cancelAnimationFrame(fadeRafRef.current);
      }
      stopYtPolling();
      // Mark inactive BEFORE destroying: destroy() fires onStateChange(ENDED),
      // which would otherwise call nextTrack() during teardown and start an
      // unwanted track.
      ytActiveRef.current = false;
      try {
        ytPlayerRef.current?.stopVideo();
      } catch {}
      try {
        ytPlayerRef.current?.destroy();
      } catch {}
      ytPlayerRef.current = null;
      const host = ytSinkHostRef.current;
      if (host) {
        try {
          host.replaceChildren();
        } catch {}
      }
      ytSinkRef.current = null;
      ytCurrentVideoIdRef.current = '';
      eqEngineRef.current?.dispose();
    };
  }, [stopYtPolling]);

  // Chrome (desktop + Android) can keep the embedded YouTube player alive after
  // the page is closed/navigated away, which leaves a zombie media session:
  // the audio keeps playing (or gets stuck) and Chrome's media controls go
  // dead. Tear the player down when the page actually goes away so
  // "keluar dari Chrome" always stops the stream cleanly.
  //
  // NOTE: we deliberately do NOT tear down on 'visibilitychange'. Switching
  // tabs/app must not stop the music — background playback is expected.
  useEffect(() => {
    const handleTeardown = () => {
      ytActiveRef.current = false;
      try {
        ytPlayerRef.current?.stopVideo();
      } catch {}
      try {
        ytPlayerRef.current?.destroy();
      } catch {}
      ytPlayerRef.current = null;
      const host = ytSinkHostRef.current;
      if (host) {
        try {
          host.replaceChildren();
        } catch {}
      }
      ytSinkRef.current = null;
      ytCurrentVideoIdRef.current = '';
    };

    window.addEventListener('pagehide', handleTeardown);
    window.addEventListener('beforeunload', handleTeardown);
    return () => {
      window.removeEventListener('pagehide', handleTeardown);
      window.removeEventListener('beforeunload', handleTeardown);
    };
  }, []);

  const cancelVolumeFade = useCallback(() => {
    if (fadeRafRef.current !== null) {
      window.cancelAnimationFrame(fadeRafRef.current);
      fadeRafRef.current = null;
    }
  }, []);

  const runVolumeFadeIn = useCallback(
    (audio: HTMLMediaElement, seconds: number) => {
      cancelVolumeFade();
      if (mutedRef.current || seconds <= 0) {
        audio.volume = mutedRef.current ? 0 : volumeRef.current;
        return;
      }
      const target = volumeRef.current;
      const durationMs = seconds * 1000;
      const start = performance.now();
      audio.volume = Math.min(target, 0.04);

      const step = (now: number) => {
        if (!audioRef.current || mutedRef.current) {
          fadeRafRef.current = null;
          return;
        }
        const progress = Math.min(1, (now - start) / durationMs);
        // Smooth ease-out curve for natural listening entry
        const eased = 1 - Math.pow(1 - progress, 2);
        audio.volume = Math.min(volumeRef.current, Math.max(0.02, volumeRef.current * eased));
        if (progress < 1) {
          fadeRafRef.current = window.requestAnimationFrame(step);
        } else {
          audio.volume = volumeRef.current;
          fadeRafRef.current = null;
        }
      };
      fadeRafRef.current = window.requestAnimationFrame(step);
    },
    [cancelVolumeFade],
  );

  // Sleep Timer countdown handler
  useEffect(() => {
    if (!sleepEndsAt) return;
    const ms = sleepEndsAt - Date.now();
    if (ms <= 0) {
      setSleepEndsAt(null);
      audioRef.current?.pause();
      setIsPlaying(false);
      showToast('Sleep timer paused playback');
      return;
    }
    const id = window.setTimeout(() => {
      setSleepEndsAt(null);
      audioRef.current?.pause();
      setIsPlaying(false);
      showToast('Sleep timer paused playback');
    }, ms);
    return () => window.clearTimeout(id);
  }, [sleepEndsAt, showToast]);

  const setSleepTimer = useCallback(
    (option: number | 'track' | null) => {
      if (option === null) {
        setSleepEndsAt(null);
        setSleepAfterTrack(false);
        showToast('Sleep timer turned off');
        return;
      }
      if (option === 'track') {
        setSleepEndsAt(null);
        setSleepAfterTrack(true);
        showToast('Playback stops after this song');
        return;
      }
      setSleepAfterTrack(false);
      setSleepEndsAt(Date.now() + option * 60 * 1000);
      showToast(`Sleep timer set for ${option} min`);
    },
    [showToast],
  );

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const recordRecent = useCallback((track: Track) => {
    setRecentTracks((prev) => {
      const filtered = prev.filter((t) => t.id !== track.id);
      return [track, ...filtered].slice(0, 30);
    });
  }, []);

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  const fetchMvForTrack = useCallback(async (track: Track) => {
    const seq = ++mvSeqRef.current;
    setMvLoading(true);
    setMvData(null);
    try {
      const qs = new URLSearchParams({
        title: track.title,
        artist: track.artist,
      });
      const res = await apiFetch(`/api/mv?${qs.toString()}`);
      if (seq !== mvSeqRef.current) return;
      const data = (await res.json()) as MusicVideoResult;
      if (seq !== mvSeqRef.current) return;
      setMvData(data);
    } catch {
      if (seq !== mvSeqRef.current) return;
      setMvData({ found: false, streamUrl: null, streamType: null, title: '', thumbnail: '' });
    } finally {
      if (seq === mvSeqRef.current) setMvLoading(false);
    }
  }, []);

  const startYtPlayback = useCallback(
    async (videoId: string, fallbackVideoIds: string[], seq: number, startPaused: boolean) => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
      destroyHls();
      cancelVolumeFade();
      stopYtPolling();
      ytActiveRef.current = true;
      ytExpectedSeqRef.current = seq;
      ytFallbackQueueRef.current = [...fallbackVideoIds];
      lastAudioTimeRef.current = 0;

      const syncYtControls = (player: YTPlayerInstance) => {
        try {
          if (mutedRef.current) {
            player.mute();
          } else {
            player.unMute();
            player.setVolume(Math.round(volumeRef.current * 100));
          }
          player.setPlaybackRate(eqSettingsRef.current.playbackRate);
        } catch {}
      };

      const startYtPolling = (player: YTPlayerInstance) => {
        stopYtPolling();
        ytPollTimerRef.current = window.setInterval(() => {
          if (!ytActiveRef.current || ytExpectedSeqRef.current !== requestSeqRef.current) {
            stopYtPolling();
            return;
          }
          try {
            const t = player.getCurrentTime() || 0;
            const d = player.getDuration() || 0;
            if (d > 0 && Number.isFinite(d)) {
              setDuration(d);
            }
            setCurrentTime(t);
            const delta = t - lastAudioTimeRef.current;
            lastAudioTimeRef.current = t;
            const activeTrack = currentTrackRef.current;
            if (activeTrack && player.getPlayerState() === 1 && delta > 0 && delta <= 2.5) {
              recordListeningSeconds(activeTrack, delta);
              const now = Date.now();
              if (now - lastStatsBumpRef.current >= 10000) {
                lastStatsBumpRef.current = now;
                setStatsVersion((v) => v + 1);
              }
            }
          } catch {}
        }, 250);
      };

      try {
        const YT = await loadYouTubeIframeApi();
        if (seq !== requestSeqRef.current || !ytActiveRef.current) return;

        if (ytPlayerRef.current) {
          syncYtControls(ytPlayerRef.current);
          ytCurrentVideoIdRef.current = videoId;
          ytPlayerRef.current.loadVideoById(videoId);
          if (startPaused || mediaModeRef.current === 'video') {
            ytPlayerRef.current.pauseVideo();
            setIsBuffering(false);
          }
          return;
        }

        // The YouTube IFrame API REPLACES the element you hand it with its own
        // <iframe> (the original node ends up detached from the DOM). So the
        // sink div we rendered earlier is gone by the time we need a player
        // again. Render a fresh, attached sink for every new player instead of
        // reusing the stale one — otherwise the iframe is created inside a
        // detached subtree, the player never renders, and audio stays silent.
        const host = ytSinkHostRef.current;
        if (!host) {
          throw new Error('Audio output container unavailable');
        }

        host.replaceChildren();
        const sink = document.createElement('div');
        sink.setAttribute('data-yt-sink', '1');
        host.appendChild(sink);
        ytSinkRef.current = sink;
        ytCurrentVideoIdRef.current = videoId;

        ytPlayerRef.current = new YT.Player(sink, {
          width: 240,
          height: 135,
          videoId,
          playerVars: {
            autoplay: startPaused ? 0 : 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => {
              if (!ytActiveRef.current || ytExpectedSeqRef.current !== requestSeqRef.current) {
                try {
                  e.target.stopVideo();
                } catch {}
                return;
              }
              syncYtControls(e.target);
              if (mediaModeRef.current !== 'video' && !startPaused) {
                e.target.playVideo();
              } else {
                e.target.pauseVideo();
                setIsBuffering(false);
              }
            },
            onStateChange: (e) => {
              if (!ytActiveRef.current || ytExpectedSeqRef.current !== requestSeqRef.current) return;
              // Ignore events that belong to a video we already moved on from.
              // stopVideo()/loadVideoById() fire late state changes; without this
              // guard a stale ENDED event triggers nextTrack() and the audio
              // appears to die mid-track.
              const activeVideoId = e.target.getVideoData?.()?.video_id;
              if (activeVideoId && ytCurrentVideoIdRef.current && activeVideoId !== ytCurrentVideoIdRef.current) {
                return;
              }
              if (e.data === 1) {
                syncYtControls(e.target);
                const d = e.target.getDuration() || 0;
                if (d > 0 && Number.isFinite(d)) setDuration(d);
                const activeTrack = currentTrackRef.current;
                if (activeTrack && recordedPlaySeqRef.current !== requestSeqRef.current) {
                  recordedPlaySeqRef.current = requestSeqRef.current;
                  recordTrackPlay(activeTrack);
                  setStatsVersion((v) => v + 1);
                }
                setIsPlaying(true);
                setIsBuffering(false);
                setStreamError(null);
                startYtPolling(e.target);
              } else if (e.data === 2) {
                stopYtPolling();
                setIsPlaying(false);
              } else if (e.data === 3) {
                setIsBuffering(true);
              } else if (e.data === 0) {
                stopYtPolling();
                if (!autoplayRef.current && repeatRef.current === 'off' && !sleepAfterTrackRef.current) {
                  setIsPlaying(false);
                  return;
                }
                nextTrackRef.current();
              }
            },
            onError: () => {
              if (!ytActiveRef.current || ytExpectedSeqRef.current !== requestSeqRef.current) return;
              const nextVid = ytFallbackQueueRef.current.shift();
              if (nextVid && ytPlayerRef.current) {
                ytCurrentVideoIdRef.current = nextVid;
                ytPlayerRef.current.loadVideoById(nextVid);
                return;
              }
              stopYtPolling();
              setIsBuffering(false);
              setIsPlaying(false);
              setStreamError('Track unavailable — try Watch MV');
            },
          },
        });
      } catch {
        if (seq !== requestSeqRef.current) return;
        stopYtPolling();
        setIsBuffering(false);
        setIsPlaying(false);
        setStreamError('Unable to initialize full audio stream');
      }
    },
    [cancelVolumeFade, destroyHls, stopYtPolling],
  );

  const tryYtMusicFallback = useCallback(
    async (track: Track, seq: number): Promise<boolean> => {
      try {
        const qs = new URLSearchParams({
          title: track.title,
          artist: track.artist,
          durationSec: String(track.durationSec || 0),
          preferYtMusic: '1',
        });
        const res = await apiFetch(`/api/stream?${qs.toString()}`);
        if (seq !== requestSeqRef.current || !res.ok) return false;
        const ytmResolved = (await res.json()) as StreamResolution;
        if (seq !== requestSeqRef.current) return false;
        if (ytmResolved.mode === 'ytmusic' && ytmResolved.videoId) {
          setStreamInfo(ytmResolved);
          if (ytmResolved.durationSec && ytmResolved.durationSec > 0) {
            setDuration(ytmResolved.durationSec);
          }
          await startYtPlayback(
            ytmResolved.videoId,
            ytmResolved.fallbackVideoIds ?? [],
            seq,
            mediaModeRef.current === 'video',
          );
          return true;
        }
      } catch {}
      return false;
    },
    [startYtPlayback],
  );

  const loadAndPlayTrack = useCallback(
    async (track: Track, startInVideoMode = false) => {
      const audio = audioRef.current;
      const seq = ++requestSeqRef.current;
      destroyHls();
      stopYtPlayer();
      cancelVolumeFade();
      lastAudioTimeRef.current = 0;

      if (audio) {
        audio.pause();
        audio.muted = mutedRef.current;
        audio.volume = mutedRef.current ? 0 : fadeSecondsRef.current > 0 ? 0.04 : volumeRef.current;
      }

      setCurrentTrack(track);
      setIsPlaying(false);
      setIsBuffering(!startInVideoMode);
      setStreamError(null);
      setStreamInfo(null);
      setCurrentTime(0);
      setDuration(track.durationSec || 0);
      recordRecent(track);

      if (startInVideoMode) {
        mediaModeRef.current = 'video';
        setMediaModeState('video');
        void fetchMvForTrack(track);
      } else {
        mediaModeRef.current = 'audio';
        setMediaModeState('audio');
        setMvData(null);
      }

      if (!audio) return;

      try {
        const qs = new URLSearchParams({
          title: track.title,
          artist: track.artist,
          durationSec: String(track.durationSec || 0),
        });
        if (track.scTrackId) qs.set('scTrackId', String(track.scTrackId));
        if (track.previewUrl) qs.set('previewUrl', track.previewUrl);

        let res = await apiFetch(`/api/stream?${qs.toString()}`);
        if (seq !== requestSeqRef.current) return;

        if (!res.ok && (res.status >= 500 || res.status === 404 || res.status === 429)) {
          await new Promise((r) => setTimeout(r, 320));
          if (seq !== requestSeqRef.current) return;
          res = await apiFetch(`/api/stream?${qs.toString()}`);
          if (seq !== requestSeqRef.current) return;
        }

        let resolved: StreamResolution;
        if (!res.ok) {
          const rawText = await res.text().catch(() => '');
          let errMsg = '';
          try {
            const errBody = JSON.parse(rawText) as { error?: string };
            errMsg = errBody.error || '';
          } catch {
            errMsg = '';
          }

          if (await tryYtMusicFallback(track, seq)) {
            return;
          }
          if (seq !== requestSeqRef.current) return;

          if (track.previewUrl) {
            resolved = {
              streamUrl: `/api/audio-proxy?url=${encodeURIComponent(track.previewUrl)}`,
              mode: 'audio',
              source: 'preview',
              fullLength: false,
              durationSec: 30,
            };
          } else {
            throw new Error(errMsg || `Unable to stream this track (HTTP ${res.status})`);
          }
        } else {
          resolved = (await res.json()) as StreamResolution;
        }
        if (seq !== requestSeqRef.current) return;

        setStreamInfo(resolved);
        if (resolved.durationSec && resolved.durationSec > 0) {
          setDuration(resolved.durationSec);
        }

        if (resolved.mode === 'ytmusic' && resolved.videoId) {
          await startYtPlayback(
            resolved.videoId,
            resolved.fallbackVideoIds ?? [],
            seq,
            mediaModeRef.current === 'video',
          );
          return;
        }

        // Source is not YouTube Music: fully tear the YT player down so no
        // zombie iframe (and its media session) is left behind in the page.
        destroyYtPlayer();

        if (resolved.mode === 'hls') {
          const { default: HlsLib } = await import('hls.js');
          if (seq !== requestSeqRef.current) return;
          if (HlsLib.isSupported()) {
            const hls = new HlsLib({ enableWorker: false, lowLatencyMode: false });
            hlsRef.current = hls;
            hls.loadSource(resolved.streamUrl);
            hls.attachMedia(audio);
            hls.on(HlsLib.Events.MANIFEST_PARSED, () => {
              if (seq !== requestSeqRef.current || mediaModeRef.current === 'video') {
                setIsBuffering(false);
                return;
              }
              audio.muted = mutedRef.current;
              audio.volume = mutedRef.current ? 0 : volumeRef.current;
              audio.play().catch((playErr: unknown) => {
                if (seq !== requestSeqRef.current) return;
                if (playErr instanceof DOMException && playErr.name === 'AbortError') return;
                setIsBuffering(false);
                setStreamError('Tap Play to start audio output');
              });
            });
            hls.on(HlsLib.Events.ERROR, (_event, data) => {
              if (!data.fatal || seq !== requestSeqRef.current) return;
              destroyHls();
              void tryYtMusicFallback(track, seq).then((ytOk) => {
                if (ytOk || seq !== requestSeqRef.current) return;
                if (track.previewUrl) {
                  const fallbackUrl = `/api/audio-proxy?url=${encodeURIComponent(track.previewUrl)}`;
                  setStreamInfo({
                    streamUrl: fallbackUrl,
                    mode: 'audio',
                    source: 'preview',
                    fullLength: false,
                    durationSec: 30,
                  });
                  audio.src = fallbackUrl;
                  audio.load();
                  if (mediaModeRef.current !== 'video') {
                    audio.muted = mutedRef.current;
                    audio.volume = mutedRef.current ? 0 : volumeRef.current;
                    void audio.play().catch(() => {});
                  }
                } else {
                  setIsBuffering(false);
                  setIsPlaying(false);
                  setStreamError('Stream unavailable — try Watch MV');
                }
              });
            });
            return;
          }
        }

        audio.src = resolved.streamUrl;
        audio.load();
        if (mediaModeRef.current !== 'video') {
          audio.muted = mutedRef.current;
          audio.volume = mutedRef.current ? 0 : volumeRef.current;
          try {
            await audio.play();
          } catch (playErr) {
            if (seq !== requestSeqRef.current) return;
            if (playErr instanceof DOMException && playErr.name === 'AbortError') return;
            setIsBuffering(false);
            setStreamError('Tap Play to start audio output');
          }
        } else {
          setIsBuffering(false);
        }
      } catch (err) {
        if (seq !== requestSeqRef.current) return;
        setStreamError(err instanceof Error ? err.message : 'Playback unavailable');
        setIsBuffering(false);
        setIsPlaying(false);
      }
    },
    [
      cancelVolumeFade,
      destroyHls,
      destroyYtPlayer,
      fetchMvForTrack,
      recordRecent,
      startYtPlayback,
      stopYtPlayer,
      tryYtMusicFallback,
    ],
  );

  const setMediaMode = useCallback(
    (mode: PlayerMediaMode) => {
      mediaModeRef.current = mode;
      setMediaModeState(mode);
      const audio = audioRef.current;
      if (mode === 'video') {
        if (ytActiveRef.current && ytPlayerRef.current) {
          try {
            ytPlayerRef.current.pauseVideo();
          } catch {}
        }
        if (audio && !audio.paused) {
          audio.pause();
        }
        if (currentTrack && !mvData && !mvLoading) {
          void fetchMvForTrack(currentTrack);
        }
      } else {
        if (ytActiveRef.current && ytPlayerRef.current) {
          try {
            if (mutedRef.current) ytPlayerRef.current.mute();
            else {
              ytPlayerRef.current.unMute();
              ytPlayerRef.current.setVolume(Math.round(volumeRef.current * 100));
            }
            ytPlayerRef.current.playVideo();
          } catch {}
          return;
        }
        if (audio && streamInfo?.streamUrl) {
          if (!audio.src && !hlsRef.current) {
            audio.src = streamInfo.streamUrl;
            audio.load();
          }
          audio.muted = mutedRef.current;
          audio.volume = mutedRef.current ? 0 : volumeRef.current;
          void audio.play().catch(() => {});
        }
      }
    },
    [currentTrack, mvData, mvLoading, fetchMvForTrack, streamInfo],
  );

  const playTrack = useCallback(
    (track: Track, contextList?: Track[]) => {
      if (contextList && contextList.length > 0) {
        const idx = contextList.findIndex((t) => t.id === track.id);
        setQueue(contextList);
        setQueueIndex(idx >= 0 ? idx : 0);
      } else {
        setQueue((prev) => {
          const existingIdx = prev.findIndex((t) => t.id === track.id);
          if (existingIdx >= 0) {
            setQueueIndex(existingIdx);
            return prev;
          }
          const nextQ = [...prev, track];
          setQueueIndex(nextQ.length - 1);
          return nextQ;
        });
      }
      void loadAndPlayTrack(track, false);
    },
    [loadAndPlayTrack],
  );

  const playShuffled = useCallback(
    (tracks: Track[]) => {
      if (!tracks.length) return;
      const copy = [...tracks];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      setShuffle(true);
      setQueue(copy);
      setQueueIndex(0);
      void loadAndPlayTrack(copy[0], false);
    },
    [loadAndPlayTrack],
  );

  const openMusicVideo = useCallback(
    (track: Track, contextList?: Track[]) => {
      if (contextList && contextList.length > 0) {
        const idx = contextList.findIndex((t) => t.id === track.id);
        setQueue(contextList);
        setQueueIndex(idx >= 0 ? idx : 0);
      }
      setNowPlayingOpen(true);
      if (currentTrack?.id === track.id) {
        setMediaMode('video');
      } else {
        void loadAndPlayTrack(track, true);
      }
    },
    [currentTrack?.id, setMediaMode, loadAndPlayTrack],
  );

  const playFromQueueIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= queue.length) return;
      setQueueIndex(index);
      void loadAndPlayTrack(queue[index], mediaMode === 'video');
    },
    [queue, loadAndPlayTrack, mediaMode],
  );

  const nextTrack = useCallback(() => {
    if (sleepAfterTrackRef.current) {
      setSleepAfterTrack(false);
      setIsPlaying(false);
      showToast('Sleep timer stopped after track');
      return;
    }
    if (queue.length === 0) return;
    if (repeat === 'one' && currentTrack) {
      if (ytActiveRef.current && ytPlayerRef.current) {
        ytPlayerRef.current.seekTo(0, true);
        ytPlayerRef.current.playVideo();
        return;
      }
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        void audio.play().catch(() => {});
      }
      return;
    }

    let nextIdx = queueIndex + 1;
    if (shuffle && queue.length > 1) {
      let rand = queueIndex;
      while (rand === queueIndex) {
        rand = Math.floor(Math.random() * queue.length);
      }
      nextIdx = rand;
    } else if (nextIdx >= queue.length) {
      if (repeat === 'all') {
        nextIdx = 0;
      } else {
        setIsPlaying(false);
        return;
      }
    }
    setQueueIndex(nextIdx);
    void loadAndPlayTrack(queue[nextIdx], mediaMode === 'video');
  }, [queue, queueIndex, repeat, shuffle, currentTrack, loadAndPlayTrack, mediaMode, showToast]);

  const prevTrack = useCallback(() => {
    if (ytActiveRef.current && ytPlayerRef.current) {
      try {
        if (ytPlayerRef.current.getCurrentTime() > 3) {
          ytPlayerRef.current.seekTo(0, true);
          setCurrentTime(0);
          return;
        }
      } catch {}
    }
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (queue.length === 0) return;
    const prevIdx = queueIndex > 0 ? queueIndex - 1 : repeat === 'all' ? queue.length - 1 : 0;
    setQueueIndex(prevIdx);
    void loadAndPlayTrack(queue[prevIdx], mediaMode === 'video');
  }, [queue, queueIndex, repeat, loadAndPlayTrack, mediaMode]);

  const nextTrackRef = useRef(nextTrack);
  useEffect(() => {
    nextTrackRef.current = nextTrack;
  }, [nextTrack]);

  // Attach listeners to mounted <audio ref={audioRef}> element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = mutedRef.current ? 0 : volumeRef.current;
    audio.muted = mutedRef.current;

    const onPlay = () => {
      audio.muted = mutedRef.current;
      audio.playbackRate = eqSettingsRef.current.playbackRate;
      if (fadeSecondsRef.current > 0 && audio.currentTime < 1.5) {
        runVolumeFadeIn(audio, fadeSecondsRef.current);
      } else {
        audio.volume = mutedRef.current ? 0 : volumeRef.current;
      }
      const isLitePerf =
        typeof document !== 'undefined' && document.documentElement.dataset.perf === 'lite';
      if (eqSettingsRef.current.enabled || !isLitePerf) {
        if (!eqEngineRef.current) eqEngineRef.current = new WebAudioEqualizerEngine();
        if (eqEngineRef.current.ensureInitialized(audio)) {
          eqEngineRef.current.applySettings(eqSettingsRef.current);
        }
      } else {
        eqEngineRef.current?.resume();
      }
      const activeTrack = currentTrackRef.current;
      if (activeTrack && recordedPlaySeqRef.current !== requestSeqRef.current) {
        recordedPlaySeqRef.current = requestSeqRef.current;
        recordTrackPlay(activeTrack);
        setStatsVersion((v) => v + 1);
      }
      setIsPlaying(true);
      setIsBuffering(false);
      setStreamError(null);
    };
    const onPause = () => {
      cancelVolumeFade();
      setIsPlaying(false);
    };
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);
    const onPlaying = () => {
      audio.muted = mutedRef.current;
      if (fadeRafRef.current === null) {
        audio.volume = mutedRef.current ? 0 : volumeRef.current;
      }
      audio.playbackRate = eqSettingsRef.current.playbackRate;
      setIsBuffering(false);
      setIsPlaying(true);
      setStreamError(null);
    };
    const onTimeUpdate = () => {
      const t = audio.currentTime || 0;
      setCurrentTime(t);
      const delta = t - lastAudioTimeRef.current;
      lastAudioTimeRef.current = t;
      const activeTrack = currentTrackRef.current;
      if (activeTrack && !audio.paused && delta > 0 && delta <= 2.5) {
        recordListeningSeconds(activeTrack, delta);
        const now = Date.now();
        if (now - lastStatsBumpRef.current >= 10000) {
          lastStatsBumpRef.current = now;
          setStatsVersion((v) => v + 1);
        }
      }
    };
    const onDurationChange = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => {
      if (!autoplayRef.current && repeat === 'off' && !sleepAfterTrackRef.current) {
        setIsPlaying(false);
        return;
      }
      nextTrackRef.current();
    };
    const onError = () => {
      if (!audio.currentSrc || ytActiveRef.current) return;
      const track = currentTrackRef.current;
      const activeStream = streamInfoRef.current;
      const seqAtErr = requestSeqRef.current;
      if (track && activeStream?.source !== 'ytmusic' && activeStream?.source !== 'preview') {
        void tryYtMusicFallback(track, seqAtErr).then((ytOk) => {
          if (ytOk || seqAtErr !== requestSeqRef.current) return;
          if (track.previewUrl) {
            const fallbackUrl = `/api/audio-proxy?url=${encodeURIComponent(track.previewUrl)}`;
            setStreamInfo({
              streamUrl: fallbackUrl,
              mode: 'audio',
              source: 'preview',
              fullLength: false,
              durationSec: 30,
            });
            audio.src = fallbackUrl;
            audio.load();
            void audio.play().catch(() => {
              setIsBuffering(false);
              setIsPlaying(false);
            });
          } else {
            setIsBuffering(false);
            setIsPlaying(false);
            setStreamError('Audio interrupted — tap Play or switch to Video MV');
          }
        });
        return;
      }
      setIsBuffering(false);
      setIsPlaying(false);
      setStreamError('Audio interrupted — tap Play or switch to Video MV');
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      destroyHls();
      audio.pause();
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [destroyHls]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = muted;
      audioRef.current.volume = muted ? 0 : volume;
    }
    if (ytPlayerRef.current && ytActiveRef.current) {
      try {
        if (muted) ytPlayerRef.current.mute();
        else {
          ytPlayerRef.current.unMute();
          ytPlayerRef.current.setVolume(Math.round(volume * 100));
        }
      } catch {}
    }
    try {
      localStorage.setItem('audixify_volume_v2', String(volume));
    } catch {}
  }, [volume, muted]);

  useEffect(() => {
    if (!currentTrack || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      artwork: currentTrack.artwork
        ? [{ src: currentTrack.artwork, sizes: '512x512', type: 'image/jpeg' }]
        : [],
    });

    // Keep the OS/Chrome media controls in sync with the real playback state.
    // Without this, Chrome can keep showing "playing" after the stream ended
    // and the media controls stop responding (the "Chrome music mati" case).
    try {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch {}

    navigator.mediaSession.setActionHandler('play', () => {
      if (ytActiveRef.current && ytPlayerRef.current) {
        ytPlayerRef.current.playVideo();
      } else {
        void audioRef.current?.play();
      }
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      if (ytActiveRef.current && ytPlayerRef.current) {
        ytPlayerRef.current.pauseVideo();
      } else {
        audioRef.current?.pause();
      }
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
  }, [currentTrack, prevTrack, nextTrack, isPlaying]);

  // Release the media session when the app is torn down so Chrome/OS media
  // controls do not keep a dead "Audixify" entry around.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    return () => {
      try {
        navigator.mediaSession.playbackState = 'none';
        navigator.mediaSession.metadata = null;
      } catch {}
    };
  }, []);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!currentTrack) return;
    if (mediaMode === 'video') {
      setMediaMode('audio');
      return;
    }
    if (ytActiveRef.current && ytPlayerRef.current) {
      try {
        if (ytPlayerRef.current.getPlayerState() === 1) {
          ytPlayerRef.current.pauseVideo();
        } else {
          ytPlayerRef.current.playVideo();
        }
      } catch {}
      return;
    }
    if (!audio) return;
    if (audio.paused) {
      audio.muted = mutedRef.current;
      audio.volume = mutedRef.current ? 0 : volumeRef.current;
      void audio.play().catch(() => {
        setStreamError('Unable to start audio playback');
      });
    } else {
      audio.pause();
    }
  }, [currentTrack, mediaMode, setMediaMode]);

  const seekTo = useCallback((seconds: number) => {
    const target = Math.max(0, seconds);
    if (ytActiveRef.current && ytPlayerRef.current) {
      try {
        ytPlayerRef.current.seekTo(target, true);
        setCurrentTime(target);
      } catch {}
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = target;
    setCurrentTime(audio.currentTime);
  }, []);

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolumeState(clamped);
    if (clamped > 0) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);
  const toggleShuffle = useCallback(() => setShuffle((s) => !s), []);
  const cycleRepeat = useCallback(
    () => setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')),
    [],
  );

  const addToQueue = useCallback(
    (track: Track) => {
      setQueue((prev) => [...prev, track]);
      showToast(`Added "${track.title}" to queue`);
    },
    [showToast],
  );

  const addListToQueue = useCallback(
    (tracks: Track[]) => {
      if (!tracks.length) return;
      setQueue((prev) => [...prev, ...tracks]);
      showToast(`Added ${tracks.length} tracks to queue`);
    },
    [showToast],
  );

  const playNextInQueue = useCallback(
    (track: Track) => {
      setQueue((prev) => {
        if (prev.length === 0 || queueIndex < 0) {
          setQueueIndex(0);
          return [track];
        }
        const copy = [...prev];
        copy.splice(queueIndex + 1, 0, track);
        return copy;
      });
      showToast(`Playing "${track.title}" next`);
    },
    [queueIndex, showToast],
  );

  const removeFromQueue = useCallback(
    (index: number) => {
      setQueue((prev) => prev.filter((_, idx) => idx !== index));
      if (index < queueIndex) {
        setQueueIndex((i) => Math.max(0, i - 1));
      }
    },
    [queueIndex],
  );

  const isLiked = useCallback(
    (trackId: string) => likedTracks.some((t) => t.id === trackId),
    [likedTracks],
  );

  const toggleLike = useCallback(
    (track: Track) => {
      setLikedTracks((prev) => {
        const exists = prev.some((t) => t.id === track.id);
        showToast(exists ? `Removed from Liked Songs` : `Saved to Liked Songs`);
        if (exists) return prev.filter((t) => t.id !== track.id);
        return [track, ...prev];
      });
    },
    [showToast],
  );

  const isFollowingArtist = useCallback(
    (artistName: string) => {
      const target = artistName.trim().toLowerCase();
      return followedArtists.some((a) => a.name.trim().toLowerCase() === target);
    },
    [followedArtists],
  );

  const toggleFollowArtist = useCallback(
    (artist: ArtistSummary) => {
      setFollowedArtists((prev) => {
        const target = artist.name.trim().toLowerCase();
        const exists = prev.some((a) => a.name.trim().toLowerCase() === target);
        showToast(exists ? `Unfollowed ${artist.name}` : `Following ${artist.name}`);
        if (exists) return prev.filter((a) => a.name.trim().toLowerCase() !== target);
        return [artist, ...prev];
      });
    },
    [showToast],
  );

  const createPlaylist = useCallback(
    (name: string, description = '', initialTrack?: Track) => {
      const newPl: UserPlaylist = {
        id: `pl-${Date.now()}`,
        name: name.trim() || 'Untitled Playlist',
        description: description.trim(),
        tracks: initialTrack ? [initialTrack] : [],
        createdAt: new Date().toISOString(),
      };
      setPlaylists((prev) => [newPl, ...prev]);
      showToast(`Created playlist "${newPl.name}"`);
      return newPl;
    },
    [showToast],
  );

  const deletePlaylist = useCallback(
    (playlistId: string) => {
      setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
      showToast('Playlist deleted');
    },
    [showToast],
  );

  const addTrackToPlaylist = useCallback(
    (playlistId: string, track: Track) => {
      setPlaylists((prev) =>
        prev.map((p) => {
          if (p.id !== playlistId) return p;
          if (p.tracks.some((t) => t.id === track.id)) return p;
          return { ...p, tracks: [...p.tracks, track] };
        }),
      );
      showToast(`Added "${track.title}" to playlist`);
    },
    [showToast],
  );

  const removeTrackFromPlaylist = useCallback((playlistId: string, trackId: string) => {
    setPlaylists((prev) =>
      prev.map((p) => {
        if (p.id !== playlistId) return p;
        return { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) };
      }),
    );
  }, []);

  const restoreLibraryFromCloudData = useCallback(
    (data: { likedTracks: Track[]; followedArtists: ArtistSummary[]; playlists: UserPlaylist[] }) => {
      if (Array.isArray(data.likedTracks)) setLikedTracks(data.likedTracks);
      if (Array.isArray(data.followedArtists)) setFollowedArtists(data.followedArtists);
      if (Array.isArray(data.playlists)) setPlaylists(data.playlists);
      showToast('Cloud library restored');
    },
    [showToast],
  );

  const shuffleQueue = useCallback(() => {
    setQueue((prev) => {
      if (prev.length <= 1) return prev;
      const current = queueIndex >= 0 && queueIndex < prev.length ? prev[queueIndex] : null;
      const rest = prev.filter((_, idx) => idx !== queueIndex);
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      if (current) {
        setQueueIndex(0);
        return [current, ...rest];
      }
      return rest;
    });
    showToast('Queue shuffled');
  }, [queueIndex, showToast]);

  const clearQueue = useCallback(() => {
    setQueue((prev) => {
      const current = queueIndex >= 0 && queueIndex < prev.length ? prev[queueIndex] : null;
      if (current) {
        setQueueIndex(0);
        return [current];
      }
      setQueueIndex(-1);
      return [];
    });
    showToast('Cleared upcoming queue');
  }, [queueIndex, showToast]);

  const setEqEnabled = useCallback(
    (enabled: boolean) => {
      setEqSettings((prev) => ({ ...prev, enabled }));
      showToast(enabled ? '5-Band Equalizer active' : 'Equalizer bypassed');
    },
    [showToast],
  );

  const setEqBandGain = useCallback((bandIndex: number, gainDb: number) => {
    setEqSettings((prev) => {
      const nextGains = [...prev.gains] as [number, number, number, number, number];
      if (bandIndex >= 0 && bandIndex < 5) {
        nextGains[bandIndex] = clampEqDb(gainDb);
      }
      return {
        ...prev,
        enabled: true,
        presetId: 'custom',
        gains: nextGains,
      };
    });
  }, []);

  const selectEqPreset = useCallback(
    (presetId: Exclude<EqPresetId, 'custom'>) => {
      const found = EQ_PRESETS.find((p) => p.id === presetId);
      if (!found) return;
      setEqSettings((prev) => ({
        ...prev,
        enabled: true,
        presetId: found.id,
        gains: [...found.gains] as [number, number, number, number, number],
        preampDb: found.preampDb,
      }));
      showToast(`EQ Preset: ${found.name}`);
    },
    [showToast],
  );

  const setPreampDb = useCallback((db: number) => {
    const clamped = Math.max(-6, Math.min(6, Math.round(db * 2) / 2));
    setEqSettings((prev) => ({ ...prev, preampDb: clamped }));
  }, []);

  const setPlaybackRate = useCallback(
    (rate: number) => {
      const valid = rate === 0.85 || rate === 1.15 ? rate : 1;
      setEqSettings((prev) => ({ ...prev, playbackRate: valid }));
      showToast(`Playback speed: ${valid}x`);
    },
    [showToast],
  );

  const resetEq = useCallback(() => {
    setEqSettings((prev) => ({
      ...DEFAULT_EQ_SETTINGS,
      playbackRate: prev.playbackRate,
    }));
    showToast('Equalizer reset to Flat');
  }, [showToast]);

  const toggleRemainingTime = useCallback(() => {
    setShowRemainingTime((v) => !v);
  }, []);

  const setFadeSeconds = useCallback(
    (sec: 0 | 2 | 4) => {
      const normalized: 0 | 2 | 4 = sec === 2 || sec === 4 ? sec : 0;
      setFadeSecondsState(normalized);
      try {
        localStorage.setItem('audixify_fade_sec_v1', String(normalized));
      } catch {}
      showToast(normalized === 0 ? 'Smooth audio fade disabled' : `Smooth audio fade: ${normalized}s`);
    },
    [showToast],
  );

  const getSpectrumBins = useCallback((target: Uint8Array<ArrayBuffer>): boolean => {
    if (!eqEngineRef.current) return false;
    return eqEngineRef.current.getFrequencyData(target);
  }, []);

  const startArtistRadio = useCallback(
    async (seedTrack: Track) => {
      const mainArtist =
        seedTrack.artist.split(/,|&|feat\.|ft\./i)[0]?.trim() || seedTrack.artist;
      showToast(`Starting ${mainArtist} Radio...`);
      try {
        const [artistRes, searchRes] = await Promise.allSettled([
          apiFetch(`/api/artist?name=${encodeURIComponent(mainArtist)}`),
          apiFetch(`/api/search?q=${encodeURIComponent(mainArtist)}`),
        ]);

        const candidates: Track[] = [seedTrack];
        const seen = new Set<string>([`${seedTrack.title.toLowerCase()}::${seedTrack.artist.toLowerCase()}`]);

        const pushUnique = (list: Track[] | undefined) => {
          if (!Array.isArray(list)) return;
          for (const item of list) {
            const key = `${item.title.trim().toLowerCase()}::${item.artist.trim().toLowerCase()}`;
            if (!seen.has(key)) {
              seen.add(key);
              candidates.push(item);
            }
          }
        };

        if (artistRes.status === 'fulfilled' && artistRes.value.ok) {
          const detail = await artistRes.value.json();
          pushUnique(detail?.topTracks);
        }
        if (searchRes.status === 'fulfilled' && searchRes.value.ok) {
          const searchData = await searchRes.value.json();
          pushUnique(searchData?.tracks);
        }

        const radioQueue = candidates.slice(0, 25);
        setQueue(radioQueue);
        setQueueIndex(0);
        void loadAndPlayTrack(radioQueue[0], false);
        showToast(`${mainArtist} Radio · ${radioQueue.length} tracks queued`);
      } catch {
        playTrack(seedTrack);
      }
    },
    [loadAndPlayTrack, playTrack, showToast],
  );

  const clearListeningHistory = useCallback(() => {
    setRecentTracks([]);
    clearListeningStats();
    setStatsVersion((v) => v + 1);
    try {
      localStorage.removeItem('audixify_recent_tracks');
    } catch {}
    showToast('Listening history & stats cleared');
  }, [showToast]);

  const progressValue = useMemo(
    () => ({ currentTime, duration }),
    [currentTime, duration],
  );

  const playerValue = useMemo<PlayerContextValue>(
    () => ({
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
      openMusicVideo,
      volume,
      muted,
      shuffle,
      repeat,
      likedTracks,
      playlists,
      recentTracks,
      followedArtists,
      theme,
      nowPlayingOpen,
      setNowPlayingOpen,
      sleepEndsAt,
      sleepAfterTrack,
      setSleepTimer,
      toastMessage,
      showToast,
      toggleTheme,
      playTrack,
      playShuffled,
      playFromQueueIndex,
      addToQueue,
      addListToQueue,
      playNextInQueue,
      removeFromQueue,
      shuffleQueue,
      clearQueue,
      togglePlayPause,
      nextTrack,
      prevTrack,
      seekTo,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      isLiked,
      toggleLike,
      isFollowingArtist,
      toggleFollowArtist,
      createPlaylist,
      deletePlaylist,
      addTrackToPlaylist,
      removeTrackFromPlaylist,
      restoreLibraryFromCloudData,
      clearListeningHistory,
      eqSettings,
      eqModalOpen,
      setEqModalOpen,
      setEqEnabled,
      setEqBandGain,
      selectEqPreset,
      setPreampDb,
      setPlaybackRate,
      resetEq,
      showRemainingTime,
      toggleRemainingTime,
      fadeSeconds,
      setFadeSeconds,
      statsVersion,
      getSpectrumBins,
      startArtistRadio,
      trackInfoTarget,
      setTrackInfoTarget,
    }),
    [
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
      openMusicVideo,
      volume,
      muted,
      shuffle,
      repeat,
      likedTracks,
      playlists,
      recentTracks,
      followedArtists,
      theme,
      nowPlayingOpen,
      sleepEndsAt,
      sleepAfterTrack,
      setSleepTimer,
      toastMessage,
      showToast,
      toggleTheme,
      playTrack,
      playShuffled,
      playFromQueueIndex,
      addToQueue,
      addListToQueue,
      playNextInQueue,
      removeFromQueue,
      shuffleQueue,
      clearQueue,
      togglePlayPause,
      nextTrack,
      prevTrack,
      seekTo,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      isLiked,
      toggleLike,
      isFollowingArtist,
      toggleFollowArtist,
      createPlaylist,
      deletePlaylist,
      addTrackToPlaylist,
      removeTrackFromPlaylist,
      restoreLibraryFromCloudData,
      clearListeningHistory,
      eqSettings,
      eqModalOpen,
      setEqEnabled,
      setEqBandGain,
      selectEqPreset,
      setPreampDb,
      setPlaybackRate,
      resetEq,
      showRemainingTime,
      toggleRemainingTime,
      fadeSeconds,
      setFadeSeconds,
      statsVersion,
      getSpectrumBins,
      startArtistRadio,
      trackInfoTarget,
    ],
  );

  return (
    <PlayerContext.Provider value={playerValue}>
      <PlayerProgressContext.Provider value={progressValue}>
        {/* Real mounted DOM media sinks ensure reliable audio, muxed HLS, and YouTube Music output */}
        <video
          ref={audioRef}
          playsInline
          preload="auto"
          aria-hidden="true"
          className="fixed -top-10 -left-10 w-px h-px opacity-0 pointer-events-none"
        />
        <div
          aria-hidden="true"
          className="fixed -left-[9999px] -top-[9999px] w-[240px] h-[135px] opacity-0 pointer-events-none overflow-hidden"
        >
          <div ref={ytSinkHostRef} />
        </div>
        {children}
      </PlayerProgressContext.Provider>
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}

export function usePlayerProgress(): PlayerProgressContextValue {
  return useContext(PlayerProgressContext);
}
