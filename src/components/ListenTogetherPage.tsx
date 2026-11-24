import {
  ArrowLeft,
  Check,
  Copy,
  Crown,
  Headphones,
  Link2,
  LogIn,
  LogOut,
  MessageSquare,
  Moon,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  Search,
  Send,
  Sun,
  Trash2,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePlayer, usePlayerProgress } from '../context/PlayerContext';
import { useListenRoom } from '../hooks/useListenRoom';
import { PROFILE_CONSTRAINTS } from '../types/account';
import type { SearchPayload, Track } from '../types/music';
import { apiFetch } from '../utils/apiFetch';
import { formatDuration } from '../utils/format';
import { Artwork } from './Artwork';
import { BrandMark } from './BrandMark';
import { LiveSpectrumBars } from './LiveSpectrumBars';
import { DeveloperBadge, GoldCrownBadge, GreenVerifiedBadge } from './VerifiedBadge';

interface ListenTogetherPageProps {
  initialRoomCode?: string | null;
  onClearInitialRoomCode?: () => void;
  onBackToApp: () => void;
}

const CAPACITY_OPTIONS = [2, 4, 6, 8, 10];

function extractCodeFromInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    if (trimmed.includes('room=')) {
      const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://audixify.local/${trimmed}`);
      const code = parsed.searchParams.get('room');
      if (code) return code.trim().toUpperCase();
    }
  } catch {}
  return trimmed.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

function formatMessageTime(ts: unknown): string {
  if (!ts) return 'Just now';
  try {
    if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
      return (ts as { toDate: () => Date }).toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (typeof ts === 'string') {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  } catch {}
  return 'Now';
}

export function ListenTogetherPage({
  initialRoomCode,
  onClearInitialRoomCode,
  onBackToApp,
}: ListenTogetherPageProps) {
  const { user, profile, signingIn, signInWithGoogle, isDeveloper, showGoldFrame } = useAuth();
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    theme,
    toggleTheme,
    playTrack,
    togglePlayPause,
    seekTo,
    likedTracks,
    recentTracks,
    showToast,
  } = usePlayer();
  const { currentTime, duration } = usePlayerProgress();

  const {
    myRooms,
    roomsLoading,
    activeRoom,
    messages,
    roomClosedNotice,
    clearRoomClosedNotice,
    createRoom,
    joinRoom,
    openExistingRoom,
    exitRoomView,
    leaveRoom,
    closeRoom,
    selectRoomTrack,
    syncPlaybackState,
    sendMessage,
  } = useListenRoom();

  const [roomNameInput, setRoomNameInput] = useState('');
  const [maxMembersInput, setMaxMembersInput] = useState<number>(4);
  const [includeCurrentTrack, setIncludeCurrentTrack] = useState(true);
  const [joinCodeInput, setJoinCodeInput] = useState(initialRoomCode || '');
  const [busyAction, setBusyAction] = useState<'create' | 'join' | null>(null);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Room music search & chat state
  const [mobileRightTab, setMobileRightTab] = useState<'music' | 'chat'>('music');
  const [musicQuery, setMusicQuery] = useState('');
  const [musicResults, setMusicResults] = useState<Track[]>([]);
  const [musicSearching, setMusicSearching] = useState(false);
  const [chatText, setChatText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const lastSyncMarkerRef = useRef<string>('');
  const pendingSeekRef = useRef<{ trackId: string; sec: number } | null>(null);
  const autoJoinedCodeRef = useRef<string | null>(null);

  // Prefill & auto-join from ?room=CODE when signed in
  useEffect(() => {
    if (!initialRoomCode) return;
    setJoinCodeInput(initialRoomCode);
    if (!user || autoJoinedCodeRef.current === initialRoomCode) return;
    autoJoinedCodeRef.current = initialRoomCode;

    joinRoom(initialRoomCode)
      .then(() => {
        showToast(`Bergabung ke room ${initialRoomCode}`);
        onClearInitialRoomCode?.();
      })
      .catch((err) => {
        setLobbyError(err instanceof Error ? err.message : 'Gagal bergabung ke room.');
        onClearInitialRoomCode?.();
      });
  }, [initialRoomCode, user, joinRoom, showToast, onClearInitialRoomCode]);

  // Sync URL query param when entering/leaving active room
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (activeRoom) {
      const targetUrl = `/listen-together?room=${encodeURIComponent(activeRoom.code)}`;
      if (window.location.pathname + window.location.search !== targetUrl) {
        window.history.replaceState(window.history.state, '', targetUrl);
      }
    } else if (window.location.search.includes('room=') && !initialRoomCode) {
      window.history.replaceState(window.history.state, '', '/listen-together');
    }
  }, [activeRoom, initialRoomCode]);

  // Apply remote playback state from Firestore room snapshot
  useEffect(() => {
    if (!activeRoom) {
      lastSyncMarkerRef.current = '';
      return;
    }

    const syncKey = `${activeRoom.id}|${activeRoom.currentTrack?.id || 'none'}|${activeRoom.isPlaying}|${activeRoom.syncUpdatedAtMs}|${activeRoom.positionSec}`;
    if (syncKey === lastSyncMarkerRef.current) return;
    lastSyncMarkerRef.current = syncKey;

    const remoteTrack = activeRoom.currentTrack;
    if (!remoteTrack) return;

    const elapsedSinceSync = activeRoom.isPlaying
      ? Math.max(0, (Date.now() - activeRoom.syncUpdatedAtMs) / 1000)
      : 0;
    const targetSec = Math.max(0, activeRoom.positionSec + elapsedSinceSync);

    if (currentTrack?.id !== remoteTrack.id) {
      pendingSeekRef.current = { trackId: remoteTrack.id, sec: targetSec };
      playTrack(remoteTrack);
      return;
    }

    if (activeRoom.isPlaying && !isPlaying) {
      togglePlayPause();
    } else if (!activeRoom.isPlaying && isPlaying) {
      togglePlayPause();
    }

    if (Math.abs(currentTime - targetSec) > 2.8) {
      seekTo(targetSec);
    }
  }, [activeRoom, currentTrack?.id, isPlaying, currentTime, playTrack, togglePlayPause, seekTo]);

  // Apply pending seek position once newly loaded track becomes playable
  useEffect(() => {
    const pending = pendingSeekRef.current;
    if (!pending || !currentTrack || currentTrack.id !== pending.trackId) return;
    if (!isBuffering && (duration > 0 || isPlaying)) {
      if (pending.sec > 2) {
        seekTo(pending.sec);
      }
      if (activeRoom && !activeRoom.isPlaying && isPlaying) {
        togglePlayPause();
      }
      pendingSeekRef.current = null;
    }
  }, [currentTrack, isBuffering, duration, isPlaying, seekTo, activeRoom, togglePlayPause]);

  // Debounced music search inside room
  useEffect(() => {
    const trimmed = musicQuery.trim();
    if (!trimmed || trimmed.length < 2) {
      setMusicResults([]);
      setMusicSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setMusicSearching(true);
      apiFetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error('Search failed');
          return (await res.json()) as SearchPayload;
        })
        .then((payload) => {
          setMusicResults(payload.tracks ?? []);
          setMusicSearching(false);
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return;
          setMusicSearching(false);
        });
    }, 320);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [musicQuery]);

  // Auto-scroll room chat to newest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const quickPickTracks = useMemo(() => {
    const seen = new Set<string>();
    const out: Track[] = [];
    for (const t of [...likedTracks, ...recentTracks]) {
      if (!t?.id || seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
      if (out.length >= 12) break;
    }
    return out;
  }, [likedTracks, recentTracks]);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setLobbyError(null);
    setBusyAction('create');
    try {
      const created = await createRoom(
        roomNameInput.trim() || 'Vibe Session',
        maxMembersInput,
        includeCurrentTrack ? currentTrack : null,
      );
      setRoomNameInput('');
      showToast(`Room "${created.name}" siap (Maks ${created.maxMembers} orang)`);
    } catch (err) {
      setLobbyError(err instanceof Error ? err.message : 'Gagal membuat room.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setLobbyError(null);
    const code = extractCodeFromInput(joinCodeInput);
    if (!code) {
      setLobbyError('Masukkan kode room atau link undangan.');
      return;
    }
    setBusyAction('join');
    try {
      const joined = await joinRoom(code);
      setJoinCodeInput('');
      showToast(`Masuk ke room "${joined.name}"`);
    } catch (err) {
      setLobbyError(err instanceof Error ? err.message : 'Gagal bergabung ke room.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopyInvite = async () => {
    if (!activeRoom) return;
    const url = `${window.location.origin}/listen-together?room=${encodeURIComponent(activeRoom.code)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCode(true);
      showToast('Link undangan Listen Together disalin');
      window.setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      showToast(`Kode room: ${activeRoom.code}`);
    }
  };

  const handlePickTrackForRoom = async (track: Track) => {
    if (!activeRoom) return;
    playTrack(track);
    try {
      await selectRoomTrack(track, 0, true);
      showToast(`Memutar "${track.title}" untuk semua pendengar`);
    } catch {
      showToast('Gagal menyinkronkan lagu ke room');
    }
  };

  const handleRoomPlayPause = async () => {
    if (!activeRoom?.currentTrack) return;
    const nextState = !isPlaying;
    togglePlayPause();
    try {
      await syncPlaybackState(nextState, currentTime);
    } catch {}
  };

  const handleRoomSeek = async (sec: number) => {
    if (!activeRoom?.currentTrack) return;
    seekTo(sec);
    try {
      await syncPlaybackState(isPlaying, sec);
    } catch {}
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = chatText.trim();
    if (!clean || sendingMsg) return;
    setSendingMsg(true);
    try {
      await sendMessage(clean);
      setChatText('');
    } catch {
      showToast('Gagal mengirim pesan');
    } finally {
      setSendingMsg(false);
    }
  };

  const roomTrack = activeRoom?.currentTrack || null;
  const effectiveDuration =
    roomTrack && currentTrack?.id === roomTrack.id && duration > 0
      ? duration
      : roomTrack?.durationSec || 0;
  const activeProgressPct =
    effectiveDuration > 0 && currentTrack?.id === roomTrack?.id
      ? Math.min(100, (currentTime / effectiveDuration) * 100)
      : 0;
  const isHost = Boolean(user && activeRoom && activeRoom.hostUid === user.uid);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden ios-ambient-canvas text-zinc-900 dark:text-zinc-100">
      {/* Dedicated Fullscreen Header */}
      <header className="px-3 pt-2.5 pb-1.5 sm:px-4 md:px-8 shrink-0 z-20">
        <div className="max-w-7xl mx-auto h-14 px-3 sm:px-4 rounded-[22px] ios-glass flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={activeRoom ? exitRoomView : onBackToApp}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ios-glass-pill text-xs font-semibold text-zinc-800 dark:text-zinc-100 hover:bg-white/80 dark:hover:bg-white/[0.12] active:scale-95 transition-all shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{activeRoom ? 'Lobby' : 'Back to Audixify'}</span>
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <BrandMark className="w-6 h-6 shrink-0 hidden sm:block" />
              <div className="min-w-0">
                <div className="font-display font-bold text-sm sm:text-base text-zinc-950 dark:text-white truncate flex items-center gap-2">
                  <span>{activeRoom ? activeRoom.name : 'Listen Together'}</span>
                  {activeRoom && (
                    <span className="px-2 py-0.5 rounded-full bg-[#FF4D2E]/15 text-[#FF4D2E] text-[10px] font-mono font-bold shrink-0">
                      {activeRoom.members.length}/{activeRoom.maxMembers}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeRoom && (
              <>
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ios-glass-pill text-xs font-semibold text-zinc-800 dark:text-zinc-100 hover:text-[#FF4D2E] active:scale-95 transition-all"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Link2 className="w-3.5 h-3.5 text-[#FF4D2E]" />}
                  <span className="hidden sm:inline">{copiedCode ? 'Tersalin' : `Kode: ${activeRoom.code}`}</span>
                  <span className="sm:hidden">{activeRoom.code}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void (isHost ? closeRoom(activeRoom.id) : leaveRoom(activeRoom.id))}
                  title={isHost ? 'Tutup Room' : 'Keluar Room'}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/12 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-500/20 active:scale-95 transition-all"
                >
                  {isHost ? <Trash2 className="w-3.5 h-3.5" /> : <LogOut className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{isHost ? 'Tutup' : 'Keluar'}</span>
                </button>
              </>
            )}

            {!activeRoom && user && (
              <span
                className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full ios-glass-pill text-[11px] font-medium text-zinc-700 dark:text-zinc-200 ${
                  showGoldFrame ? 'ring-1 ring-amber-400/70' : ''
                }`}
              >
                <Radio className="w-3.5 h-3.5 text-[#FF4D2E]" />
                <span>{profile?.displayName || user.displayName || 'Listener'}</span>
                {isDeveloper && <DeveloperBadge />}
              </span>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="w-9 h-9 rounded-full flex items-center justify-center ios-glass-pill text-zinc-700 dark:text-zinc-200 active:scale-90 transition-transform"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Dedicated Fullscreen Body */}
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-4 md:px-8 md:py-5">
        <div className="max-w-7xl mx-auto">
          {!user ? (
            <div className="max-w-xl mx-auto my-8 rounded-[28px] ios-glass-surface p-6 sm:p-8 text-center space-y-5">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#FF4D2E]/15 text-[#FF4D2E] flex items-center justify-center">
                <Users className="w-7 h-7" />
              </div>
              <div className="space-y-2">
                <h1 className="font-display text-2xl font-bold text-zinc-950 dark:text-white">
                  Dengarkan Musik Bareng Secara Real-Time
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Buat room pribadi dengan batas jumlah pendengar (2–10 orang), pilih &amp; cari lagu bersama, sinkronkan pemutaran audio, dan mengobrol langsung di dalam room.
                </p>
              </div>
              <button
                type="button"
                disabled={signingIn}
                onClick={() => void signInWithGoogle()}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#FF4D2E] text-white text-sm font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shadow-lg disabled:opacity-60"
              >
                <LogIn className="w-4 h-4" />
                <span>{signingIn ? 'Menghubungkan...' : 'Masuk dengan Google untuk Mulai'}</span>
              </button>
            </div>
          ) : !activeRoom ? (
            /* LOBBY VIEW */
            <div className="space-y-6 pb-8">
              <div className="rounded-[28px] ios-glass-surface p-5 sm:p-7 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5 max-w-2xl">
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#FF4D2E]">
                    <Radio className="w-3.5 h-3.5" />
                    <span>Real-Time Listening Room</span>
                  </div>
                  <h1 className="font-display text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-white">
                    Listen Together — Dengar &amp; Ngobrol Bareng
                  </h1>
                  <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
                    Tentukan kapasitas maksimal orang yang bisa masuk, cari lagu langsung dari room, dan nikmati obrolan real-time bersama temanmu.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onBackToApp}
                  className="self-start md:self-center inline-flex items-center gap-2 px-4 py-2 rounded-full ios-glass-pill text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:text-[#FF4D2E] shrink-0"
                >
                  <Music2 className="w-3.5 h-3.5" />
                  <span>Jelajahi Katalog Utama</span>
                </button>
              </div>

              {roomClosedNotice && (
                <div className="rounded-2xl ios-glass px-4 py-3 flex items-center justify-between gap-3 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300">
                  <span>{roomClosedNotice}</span>
                  <button type="button" onClick={clearRoomClosedNotice} className="font-semibold underline">
                    Tutup
                  </button>
                </div>
              )}

              {lobbyError && (
                <div className="rounded-2xl ios-glass px-4 py-3 border border-red-500/30 text-xs text-red-600 dark:text-red-400 font-medium">
                  {lobbyError}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Create Room Card */}
                <form onSubmit={handleCreateRoom} className="rounded-[26px] ios-glass-surface p-5 sm:p-6 space-y-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-2xl bg-[#FF4D2E]/15 text-[#FF4D2E] flex items-center justify-center">
                      <Plus className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="font-display text-lg font-bold text-zinc-950 dark:text-white">
                        Buat Room Baru
                      </h2>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Atur nama room &amp; batas maksimal pendengar
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="listen-room-name" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Nama Room
                    </label>
                    <input
                      id="listen-room-name"
                      type="text"
                      maxLength={PROFILE_CONSTRAINTS.listenRoomNameMax}
                      value={roomNameInput}
                      onChange={(e) => setRoomNameInput(e.target.value)}
                      placeholder="Misal: Galau Malam Minggu, Dewa 19 Marathon..."
                      className="w-full h-11 px-4 rounded-2xl bg-white/75 dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.1] text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#FF4D2E]"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                        Maksimal Orang di Room
                      </span>
                      <span className="font-mono font-bold text-[#FF4D2E]">
                        {maxMembersInput} Pendengar
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {CAPACITY_OPTIONS.map((cap) => {
                        const active = maxMembersInput === cap;
                        return (
                          <button
                            key={cap}
                            type="button"
                            onClick={() => setMaxMembersInput(cap)}
                            className={`py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                              active
                                ? 'bg-[#FF4D2E] text-white shadow-md'
                                : 'ios-glass-pill text-zinc-700 dark:text-zinc-300 hover:text-[#FF4D2E]'
                            }`}
                          >
                            {cap} Org
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {currentTrack && (
                    <label className="flex items-center gap-2.5 text-xs text-zinc-600 dark:text-zinc-300 cursor-pointer select-none pt-1">
                      <input
                        type="checkbox"
                        checked={includeCurrentTrack}
                        onChange={(e) => setIncludeCurrentTrack(e.target.checked)}
                        className="rounded accent-[#FF4D2E]"
                      />
                      <span className="truncate">
                        Bawa lagu yang sedang diputar: <strong>{currentTrack.title}</strong>
                      </span>
                    </label>
                  )}

                  <button
                    type="submit"
                    disabled={busyAction === 'create'}
                    className="w-full h-11 rounded-2xl bg-[#FF4D2E] text-white text-sm font-semibold hover:bg-[#E63E21] active:scale-[0.99] transition-all shadow-md disabled:opacity-60"
                  >
                    {busyAction === 'create' ? 'Membuat Room...' : 'Buat & Masuk ke Room'}
                  </button>
                </form>

                {/* Join Room Card */}
                <form onSubmit={handleJoinRoom} className="rounded-[26px] ios-glass-surface p-5 sm:p-6 flex flex-col justify-between space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-2xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
                        <Headphones className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="font-display text-lg font-bold text-zinc-950 dark:text-white">
                          Gabung ke Room Teman
                        </h2>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          Masukkan kode room 8 karakter atau tempel link undangan
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="listen-join-code" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Kode atau Link Undangan
                      </label>
                      <input
                        id="listen-join-code"
                        type="text"
                        value={joinCodeInput}
                        onChange={(e) => setJoinCodeInput(e.target.value)}
                        placeholder="Contoh: A7K9P2QX atau https://.../listen-together?room=..."
                        className="w-full h-11 px-4 rounded-2xl bg-white/75 dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.1] text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#FF4D2E]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={busyAction === 'join'}
                    className="w-full h-11 rounded-2xl ios-glass-pill text-sm font-semibold text-zinc-900 dark:text-white hover:bg-white/90 dark:hover:bg-white/[0.14] active:scale-[0.99] transition-all disabled:opacity-60"
                  >
                    {busyAction === 'join' ? 'Memeriksa Kapasitas Room...' : 'Gabung Sekarang'}
                  </button>
                </form>
              </div>

              {/* Active Rooms List */}
              <section className="space-y-3">
                <h2 className="font-display text-lg font-bold text-zinc-950 dark:text-white">
                  Room Aktif Kamu
                </h2>
                {roomsLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div key={idx} className="h-24 rounded-2xl ios-glass-card animate-pulse" />
                    ))}
                  </div>
                ) : myRooms.length === 0 ? (
                  <div className="rounded-[22px] ios-glass p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
                    Belum ada room yang kamu ikuti. Buat room baru di atas atau gabung pakai kode dari temanmu.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {myRooms.map((room) => (
                      <div
                        key={room.id}
                        className="rounded-[22px] ios-glass-card p-4 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {room.currentTrack?.artwork ? (
                            <Artwork
                              src={room.currentTrack.artwork}
                              alt={room.currentTrack.title}
                              className="w-12 h-12 shrink-0"
                              rounded="rounded-xl"
                              thumb
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-[#FF4D2E]/15 text-[#FF4D2E] flex items-center justify-center shrink-0">
                              <Radio className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-zinc-950 dark:text-white truncate">
                              {room.name}
                            </div>
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                              {room.currentTrack
                                ? `${room.currentTrack.title} · ${room.currentTrack.artist}`
                                : `Host: ${room.hostName}`}
                            </div>
                            <div className="text-[10px] font-mono text-[#FF4D2E] mt-0.5">
                              {room.members.length}/{room.maxMembers} Pendengar · Kode {room.code}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => openExistingRoom(room.id)}
                          className="px-3.5 py-2 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shrink-0"
                        >
                          Masuk
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : (
            /* ACTIVE ROOM FULLSCREEN WORKSPACE */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pb-8 items-start">
              {/* Left Column: Synced Stage + Live Visualizer + Listeners */}
              <div className="lg:col-span-5 space-y-4">
                <section className="rounded-[28px] ios-glass-surface p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FF4D2E]/15 text-[#FF4D2E] font-semibold">
                      <Radio className="w-3.5 h-3.5" />
                      <span>{activeRoom.isPlaying ? 'Live Sync Playing' : 'Synced Paused'}</span>
                    </span>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                      Update oleh {activeRoom.updatedByName}
                    </span>
                  </div>

                  {roomTrack ? (
                    <>
                      <div className="flex items-center gap-4">
                        <Artwork
                          src={roomTrack.artwork}
                          alt={roomTrack.title}
                          className="w-24 h-24 sm:w-28 sm:h-28 shrink-0 shadow-xl"
                          rounded="rounded-2xl"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <h2 className="font-display text-lg sm:text-xl font-bold text-zinc-950 dark:text-white truncate">
                            {roomTrack.title}
                          </h2>
                          <p className="text-sm text-zinc-600 dark:text-zinc-300 truncate">
                            {roomTrack.artist}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                            {roomTrack.album}
                          </p>
                        </div>
                      </div>

                      {/* Real-time Audio Visualizer inside Listen Together */}
                      <LiveSpectrumBars variant="stage" active={activeRoom.isPlaying} />

                      {/* Synced Scrubber & Play/Pause */}
                      <div className="space-y-2">
                        <input
                          type="range"
                          min={0}
                          max={effectiveDuration || 100}
                          value={
                            currentTrack?.id === roomTrack.id
                              ? Math.min(currentTime, effectiveDuration || 100)
                              : Math.min(activeRoom.positionSec, effectiveDuration || 100)
                          }
                          onChange={(e) => void handleRoomSeek(Number(e.target.value))}
                          aria-label="Seek room playback"
                          className="w-full ios-slider"
                          style={{
                            background: `linear-gradient(to right, #FF4D2E ${activeProgressPct}%, rgba(161,161,170,0.28) ${activeProgressPct}%)`,
                          }}
                        />
                        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                          <span>
                            {formatDuration(
                              currentTrack?.id === roomTrack.id ? currentTime : activeRoom.positionSec,
                            )}
                          </span>
                          <span>{formatDuration(effectiveDuration)}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-center pt-1">
                        <button
                          type="button"
                          onClick={() => void handleRoomPlayPause()}
                          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#FF4D2E] text-white text-sm font-semibold shadow-lg hover:bg-[#E63E21] active:scale-95 transition-all"
                        >
                          {isBuffering ? (
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : isPlaying ? (
                            <Pause className="w-4 h-4 fill-white" />
                          ) : (
                            <Play className="w-4 h-4 fill-white ml-0.5" />
                          )}
                          <span>{isPlaying ? 'Jeda untuk Semua' : 'Putar untuk Semua'}</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="py-10 text-center space-y-2.5">
                      <Music2 className="w-10 h-10 text-zinc-400 mx-auto" />
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                        Belum ada lagu yang diputar di room ini
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto">
                        Cari dan pilih lagu di panel kanan untuk langsung memutar bersama semua pendengar.
                      </p>
                    </div>
                  )}
                </section>

                {/* Listeners Capacity Card */}
                <section className="rounded-[26px] ios-glass p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      <Users className="w-4 h-4 text-[#FF4D2E]" />
                      <span>
                        Pendengar ({activeRoom.members.length}/{activeRoom.maxMembers} Maks)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyInvite}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#FF4D2E] hover:underline"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Undang Teman</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {activeRoom.members.map((m) => (
                      <div
                        key={m.uid}
                        className="flex items-center gap-2.5 p-2 rounded-2xl ios-glass-card min-w-0"
                      >
                        <div
                          className={`relative shrink-0 rounded-full ${
                            m.goldFrame ? 'p-[2px] bg-gradient-to-tr from-amber-300 via-yellow-400 to-amber-600' : ''
                          }`}
                        >
                          {m.avatarDataUrl ? (
                            <img
                              src={m.avatarDataUrl}
                              alt={m.displayName}
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[#FF4D2E]/15 text-[#FF4D2E] flex items-center justify-center text-xs font-bold">
                              {m.displayName.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                            <span className="truncate">{m.displayName}</span>
                            {m.isDeveloper && <DeveloperBadge />}
                            {m.greenBadge && <GreenVerifiedBadge />}
                            {m.goldFrame && <GoldCrownBadge />}
                          </div>
                          <div className="text-[10px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                            {m.uid === activeRoom.hostUid && (
                              <span className="inline-flex items-center gap-0.5 text-amber-500 font-semibold">
                                <Crown className="w-2.5 h-2.5" />
                                Host ·
                              </span>
                            )}
                            <span className="truncate">@{m.username || 'listener'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {/* Right Column: In-Room Music Picker + Live Chat */}
              <div className="lg:col-span-7 space-y-4">
                {/* Mobile switch between Music Search and Room Chat */}
                <div className="flex lg:hidden items-center gap-1 p-1 rounded-full ios-glass-pill w-fit">
                  <button
                    type="button"
                    onClick={() => setMobileRightTab('music')}
                    className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      mobileRightTab === 'music'
                        ? 'bg-white/95 dark:bg-white/[0.16] text-zinc-950 dark:text-white shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Pilih Musik</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileRightTab('chat')}
                    className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      mobileRightTab === 'chat'
                        ? 'bg-white/95 dark:bg-white/[0.16] text-zinc-950 dark:text-white shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Obrolan ({messages.length})</span>
                  </button>
                </div>

                {/* In-Room Music Search & Quick Selector */}
                <section
                  className={`${
                    mobileRightTab === 'music' ? 'block' : 'hidden lg:block'
                  } rounded-[26px] ios-glass-surface p-4 sm:p-5 space-y-3.5`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display text-base font-bold text-zinc-950 dark:text-white">
                        Cari &amp; Pilih Musik di Room
                      </h3>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Lagu yang kamu pilih akan langsung diputar sinkron untuk seluruh peserta
                      </p>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={musicQuery}
                      onChange={(e) => setMusicQuery(e.target.value)}
                      placeholder="Cari lagu atau artis (Dewa 19, Tulus, Bernadya, NewJeans...)"
                      className="w-full h-10 pl-10 pr-4 rounded-2xl bg-white/80 dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.1] text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#FF4D2E]"
                    />
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                    {musicSearching ? (
                      <div className="space-y-2 py-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className="h-12 rounded-xl ios-glass-card animate-pulse" />
                        ))}
                      </div>
                    ) : musicQuery.trim().length >= 2 ? (
                      musicResults.length === 0 ? (
                        <div className="py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
                          Tidak ada lagu ditemukan untuk &ldquo;{musicQuery}&rdquo;.
                        </div>
                      ) : (
                        musicResults.slice(0, 12).map((t) => {
                          const isRoomPlaying = roomTrack?.id === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => void handlePickTrackForRoom(t)}
                              className={`w-full flex items-center gap-3 p-2 rounded-2xl text-left transition-colors ${
                                isRoomPlaying
                                  ? 'bg-[#FF4D2E]/12 ring-1 ring-[#FF4D2E]/40'
                                  : 'ios-glass-card hover:bg-white/80 dark:hover:bg-white/[0.08]'
                              }`}
                            >
                              <Artwork src={t.artwork} alt={t.title} className="w-10 h-10 shrink-0" rounded="rounded-xl" thumb />
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold text-zinc-950 dark:text-white truncate">
                                  {t.title}
                                </div>
                                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                  {t.artist} · {formatDuration(t.durationSec)}
                                </div>
                              </div>
                              <span className="px-2.5 py-1 rounded-full bg-[#FF4D2E] text-white text-[10px] font-semibold shrink-0">
                                {isRoomPlaying ? 'Diputar' : 'Putar'}
                              </span>
                            </button>
                          );
                        })
                      )
                    ) : quickPickTracks.length > 0 ? (
                      <>
                        <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 pb-1">
                          Pilihan Cepat (Liked &amp; Recent)
                        </div>
                        {quickPickTracks.map((t) => (
                          <button
                            key={`qp-${t.id}`}
                            type="button"
                            onClick={() => void handlePickTrackForRoom(t)}
                            className="w-full flex items-center gap-3 p-2 rounded-2xl ios-glass-card hover:bg-white/80 dark:hover:bg-white/[0.08] text-left transition-colors"
                          >
                            <Artwork src={t.artwork} alt={t.title} className="w-10 h-10 shrink-0" rounded="rounded-xl" thumb />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-zinc-950 dark:text-white truncate">
                                {t.title}
                              </div>
                              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                {t.artist}
                              </div>
                            </div>
                            <span className="px-2.5 py-1 rounded-full ios-glass-pill text-[10px] font-semibold text-[#FF4D2E] shrink-0">
                              Putar Bareng
                            </span>
                          </button>
                        ))}
                      </>
                    ) : (
                      <div className="py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
                        Ketik judul lagu atau nama artis di atas untuk mulai memutar musik bareng.
                      </div>
                    )}
                  </div>
                </section>

                {/* Real-Time Room Chat */}
                <section
                  className={`${
                    mobileRightTab === 'chat' ? 'flex' : 'hidden lg:flex'
                  } flex-col rounded-[26px] ios-glass-surface p-4 sm:p-5 h-[380px]`}
                >
                  <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08] shrink-0">
                    <div className="flex items-center gap-2 text-sm font-bold text-zinc-950 dark:text-white">
                      <MessageSquare className="w-4 h-4 text-[#FF4D2E]" />
                      <span>Obrolan Room</span>
                    </div>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Real-time · {messages.length} pesan
                    </span>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto py-3 space-y-2.5 pr-1">
                    {messages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
                        <MessageSquare className="w-6 h-6 text-zinc-400" />
                        <p>Belum ada pesan di room ini. Sapa temanmu sambil dengerin lagu!</p>
                      </div>
                    ) : (
                      messages.map((msg) => {
                        const isMe = msg.senderUid === user.uid;
                        return (
                          <div
                            key={msg.id}
                            className={`flex items-start gap-2.5 ${isMe ? 'flex-row-reverse text-right' : ''}`}
                          >
                            <div
                              className={`shrink-0 rounded-full ${
                                msg.goldFrame ? 'p-[1.5px] bg-gradient-to-tr from-amber-300 via-yellow-400 to-amber-600' : ''
                              }`}
                            >
                              {msg.senderAvatar ? (
                                <img
                                  src={msg.senderAvatar}
                                  alt={msg.senderName}
                                  className="w-7 h-7 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-[#FF4D2E]/15 text-[#FF4D2E] flex items-center justify-center text-[11px] font-bold">
                                  {msg.senderName.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>

                            <div className={`max-w-[78%] space-y-0.5 ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                              <div className={`flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400 ${isMe ? 'flex-row-reverse' : ''}`}>
                                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                                  {msg.senderName}
                                </span>
                                {msg.isDeveloper && <DeveloperBadge />}
                                {msg.greenBadge && <GreenVerifiedBadge />}
                                {msg.goldFrame && <GoldCrownBadge />}
                                <span>· {formatMessageTime(msg.createdAt)}</span>
                              </div>
                              <div
                                className={`px-3.5 py-2 rounded-2xl text-xs leading-relaxed break-words ${
                                  isMe
                                    ? 'bg-[#FF4D2E] text-white rounded-tr-sm'
                                    : 'ios-glass-card text-zinc-900 dark:text-zinc-100 rounded-tl-sm'
                                }`}
                              >
                                {msg.text}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <form onSubmit={handleSendChat} className="pt-2.5 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center gap-2 shrink-0">
                    <input
                      type="text"
                      maxLength={PROFILE_CONSTRAINTS.listenRoomMessageMax}
                      value={chatText}
                      onChange={(e) => setChatText(e.target.value)}
                      placeholder="Ketik pesan untuk teman di room..."
                      className="flex-1 min-w-0 h-10 px-4 rounded-full bg-white/80 dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.1] text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#FF4D2E]"
                    />
                    <button
                      type="submit"
                      disabled={!chatText.trim() || sendingMsg}
                      aria-label="Send room message"
                      className="w-10 h-10 rounded-full bg-[#FF4D2E] text-white flex items-center justify-center hover:bg-[#E63E21] active:scale-90 transition-all disabled:opacity-50 shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </section>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
