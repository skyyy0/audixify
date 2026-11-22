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
import { useAuth } from './AuthContext';

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

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { preferences } = useAuth();
  const autoplayRef = useRef(preferences.autoplay);
  autoplayRef.current = preferences.autoplay;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
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
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

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

  const loadAndPlayTrack = useCallback(
    async (track: Track, startInVideoMode = false) => {
      const audio = audioRef.current;
      const seq = ++requestSeqRef.current;
      destroyHls();

      if (audio) {
        audio.pause();
        audio.muted = mutedRef.current;
        audio.volume = mutedRef.current ? 0 : volumeRef.current;
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

        const res = await apiFetch(`/api/stream?${qs.toString()}`);
        if (seq !== requestSeqRef.current) return;

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || 'Unable to stream this track');
        }

        const resolved = (await res.json()) as StreamResolution;
        if (seq !== requestSeqRef.current) return;

        setStreamInfo(resolved);
        if (resolved.durationSec && resolved.durationSec > 0) {
          setDuration(resolved.durationSec);
        }

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
    [destroyHls, recordRecent, fetchMvForTrack],
  );

  const setMediaMode = useCallback(
    (mode: PlayerMediaMode) => {
      mediaModeRef.current = mode;
      setMediaModeState(mode);
      const audio = audioRef.current;
      if (mode === 'video') {
        if (audio && !audio.paused) {
          audio.pause();
        }
        if (currentTrack && !mvData && !mvLoading) {
          void fetchMvForTrack(currentTrack);
        }
      } else {
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
      audio.volume = mutedRef.current ? 0 : volumeRef.current;
      setIsPlaying(true);
      setIsBuffering(false);
      setStreamError(null);
    };
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);
    const onPlaying = () => {
      audio.muted = mutedRef.current;
      audio.volume = mutedRef.current ? 0 : volumeRef.current;
      setIsBuffering(false);
      setIsPlaying(true);
      setStreamError(null);
    };
    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
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
      if (!audio.currentSrc) return;
      const track = currentTrackRef.current;
      const activeStream = streamInfoRef.current;
      if (track?.previewUrl && activeStream?.source !== 'preview') {
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

    navigator.mediaSession.setActionHandler('play', () => audioRef.current?.play());
    navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
  }, [currentTrack, prevTrack, nextTrack]);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (mediaMode === 'video') {
      setMediaMode('audio');
      return;
    }
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
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, seconds);
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

  const clearListeningHistory = useCallback(() => {
    setRecentTracks([]);
    try {
      localStorage.removeItem('audixify_recent_tracks');
    } catch {}
    showToast('Listening history cleared');
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
    ],
  );

  return (
    <PlayerContext.Provider value={playerValue}>
      <PlayerProgressContext.Provider value={progressValue}>
        {/* Real mounted DOM audio sink ensures reliable audio output in iframes & all browsers */}
        <audio
          ref={audioRef}
          playsInline
          preload="auto"
          aria-hidden="true"
          className="fixed -top-10 -left-10 w-px h-px opacity-0 pointer-events-none"
        />
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
