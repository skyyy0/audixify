import {
  Check,
  Copy,
  Link2,
  LogIn,
  LogOut,
  Play,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { useSharedPlaylistsContext } from '../context/SharedPlaylistsContext';
import type { SearchPayload, Track } from '../types/music';
import { apiFetch } from '../utils/apiFetch';
import { Artwork } from './Artwork';
import { TrackRow } from './TrackRow';
import { DeveloperBadge, GreenVerifiedBadge } from './VerifiedBadge';

interface CollaborativePlaylistsSectionProps {
  initialJoinCode?: string | null;
  onClearJoinCode?: () => void;
  onArtistClick: (name: string) => void;
  onAlbumClick: (title: string, artist: string) => void;
}

export function CollaborativePlaylistsSection({
  initialJoinCode,
  onClearJoinCode,
  onArtistClick,
  onAlbumClick,
}: CollaborativePlaylistsSectionProps) {
  const { user, signInWithGoogle, signingIn } = useAuth();
  const { playTrack, showToast } = usePlayer();
  const {
    sharedPlaylists,
    loading,
    createSharedPlaylist,
    joinSharedPlaylistByCode,
    addTrackToSharedPlaylist,
    removeTrackFromSharedPlaylist,
    leaveSharedPlaylist,
    deleteSharedPlaylist,
  } = useSharedPlaylistsContext();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Quick track search inside selected collaborative playlist
  const [songQuery, setSongQuery] = useState('');
  const [songResults, setSongResults] = useState<Track[]>([]);
  const [searchingSongs, setSearchingSongs] = useState(false);

  useEffect(() => {
    if (!initialJoinCode) return;
    setJoinCode(initialJoinCode.toUpperCase());
    if (user) {
      setBusy(true);
      void joinSharedPlaylistByCode(initialJoinCode)
        .then((joined) => {
          setSelectedId(joined.id);
          showToast(`Joined "${joined.name}"`);
          onClearJoinCode?.();
        })
        .catch((err) => {
          showToast(err instanceof Error ? err.message : 'Unable to join playlist');
        })
        .finally(() => setBusy(false));
    }
  }, [initialJoinCode, user, joinSharedPlaylistByCode, showToast, onClearJoinCode]);

  useEffect(() => {
    const trimmed = songQuery.trim();
    if (!trimmed) {
      setSongResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchingSongs(true);
      apiFetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then(async (r) => (await r.json()) as SearchPayload)
        .then((data) => {
          setSongResults((data.tracks || []).slice(0, 6));
          setSearchingSongs(false);
        })
        .catch(() => setSearchingSongs(false));
    }, 320);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [songQuery]);

  const activePlaylist = sharedPlaylists.find((p) => p.id === selectedId) || null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const created = await createSharedPlaylist(newName.trim(), newDesc.trim());
      setNewName('');
      setNewDesc('');
      setSelectedId(created.id);
      showToast(`Playlist bersama "${created.name}" dibuat (${created.inviteCode})`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuat playlist bersama');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setBusy(true);
    try {
      const joined = await joinSharedPlaylistByCode(joinCode);
      setJoinCode('');
      setSelectedId(joined.id);
      showToast(`Bergabung ke "${joined.name}"`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Kode undangan tidak ditemukan');
    } finally {
      setBusy(false);
    }
  };

  const copyShareInfo = async (code: string, asLink: boolean) => {
    const value = asLink
      ? `${window.location.origin}/?join=${encodeURIComponent(code)}`
      : code;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(code);
      showToast(asLink ? 'Link undangan disalin' : `Kode ${code} disalin`);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      showToast(`Kode undangan: ${code}`);
    }
  };

  if (!user) {
    return (
      <section className="rounded-[28px] ios-glass p-5 sm:p-6 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FF4D2E]/15 text-[#FF4D2E] flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold text-zinc-950 dark:text-white">
                Playlist Bersama (Collaborative)
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Buat playlist bareng teman secara real-time pakai kode undangan atau link.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={signingIn}
            onClick={() => void signInWithGoogle()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shrink-0 shadow-sm"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>{signingIn ? 'Connecting...' : 'Login Google untuk Collab'}</span>
          </button>
        </div>
      </section>
    );
  }

  if (activePlaylist) {
    const isOwner = activePlaylist.ownerUid === user.uid;
    return (
      <section className="rounded-[28px] ios-glass p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            >
              &larr; Semua Playlist Bersama
            </button>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-950 dark:text-white truncate">
              {activePlaylist.name}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {activePlaylist.description || `Dibuat oleh ${activePlaylist.ownerName}`} ·{' '}
              <span className="font-mono">{activePlaylist.tracks.length} lagu</span> · Update
              terakhir oleh <span className="font-semibold">{activePlaylist.updatedByName}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {activePlaylist.tracks.length > 0 && (
              <button
                type="button"
                onClick={() => playTrack(activePlaylist.tracks[0], activePlaylist.tracks)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shadow-sm"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Play All</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void copyShareInfo(activePlaylist.inviteCode, false)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full ios-glass-pill text-xs font-mono font-semibold text-zinc-800 dark:text-zinc-100"
            >
              {copiedId === activePlaylist.inviteCode ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{activePlaylist.inviteCode}</span>
            </button>
            <button
              type="button"
              onClick={() => void copyShareInfo(activePlaylist.inviteCode, true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full ios-glass-pill text-xs font-medium text-zinc-700 dark:text-zinc-200"
            >
              <Link2 className="w-3.5 h-3.5 text-[#FF4D2E]" />
              <span>Copy Link</span>
            </button>
            {isOwner ? (
              <button
                type="button"
                onClick={() => {
                  void deleteSharedPlaylist(activePlaylist.id);
                  setSelectedId(null);
                  showToast('Playlist bersama dihapus');
                }}
                aria-label="Hapus playlist bersama"
                className="p-2 rounded-full ios-glass-pill text-zinc-500 hover:text-red-500"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  void leaveSharedPlaylist(activePlaylist.id);
                  setSelectedId(null);
                  showToast('Keluar dari playlist bersama');
                }}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-full ios-glass-pill text-xs text-red-500"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Leave</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Collaborators Strip */}
        <div className="flex flex-wrap items-center gap-2">
          {activePlaylist.members.map((m) => (
            <div
              key={m.uid}
              className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full ios-glass-pill text-xs"
            >
              {m.avatarDataUrl ? (
                <img
                  src={m.avatarDataUrl}
                  alt={m.displayName}
                  className="w-5 h-5 rounded-full object-cover"
                />
              ) : (
                <span className="w-5 h-5 rounded-full bg-[#FF4D2E]/20 text-[#FF4D2E] flex items-center justify-center text-[10px] font-bold">
                  {m.displayName[0]?.toUpperCase()}
                </span>
              )}
              <span className="font-medium text-zinc-800 dark:text-zinc-100 truncate max-w-[120px]">
                {m.displayName}
              </span>
              {m.isDeveloper && <DeveloperBadge />}
              {m.greenBadge && <GreenVerifiedBadge />}
            </div>
          ))}
        </div>

        {/* Quick Search & Add Track to Collaborative Playlist */}
        <div className="space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={songQuery}
              onChange={(e) => setSongQuery(e.target.value)}
              placeholder="Cari lagu untuk ditambahkan ke playlist bersama..."
              className="w-full h-10 pl-10 pr-4 rounded-full text-sm bg-black/[0.045] dark:bg-white/[0.065] border border-black/[0.06] dark:border-white/[0.09] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#FF4D2E]"
            />
          </div>

          {searchingSongs && (
            <div className="text-xs text-zinc-500 px-2">Mencari lagu...</div>
          )}

          {songResults.length > 0 && (
            <div className="rounded-2xl ios-glass-card p-2 space-y-1">
              {songResults.map((track) => {
                const alreadyIn = activePlaylist.tracks.some((t) => t.id === track.id);
                return (
                  <div
                    key={`add-res-${track.id}`}
                    className="flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-xl hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Artwork src={track.artwork} alt={track.title} className="w-9 h-9" rounded="rounded-lg" thumb />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {track.title}
                        </div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                          {track.artist}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={alreadyIn}
                      onClick={() => {
                        void addTrackToSharedPlaylist(activePlaylist.id, track).then((status) => {
                          if (status === 'added') showToast(`Ditambahkan ke ${activePlaylist.name}`);
                        });
                      }}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold shrink-0 transition-all ${
                        alreadyIn
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : 'bg-[#FF4D2E] text-white hover:bg-[#E63E21]'
                      }`}
                    >
                      {alreadyIn ? 'Added' : '+ Add'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Shared Tracks */}
        {activePlaylist.tracks.length === 0 ? (
          <div className="rounded-2xl ios-glass-card p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
            Belum ada lagu di playlist bersama ini. Cari lagu di atas atau klik menu titik tiga pada lagu mana saja.
          </div>
        ) : (
          <div className="rounded-2xl ios-glass-card divide-y divide-black/[0.05] dark:divide-white/[0.06] p-1">
            {activePlaylist.tracks.map((track, idx) => (
              <TrackRow
                key={`collab-${activePlaylist.id}-${track.id}`}
                track={track}
                index={idx}
                contextList={activePlaylist.tracks}
                onArtistClick={onArtistClick}
                onAlbumClick={onAlbumClick}
                onRemoveFromPlaylist={() =>
                  void removeTrackFromSharedPlaylist(activePlaylist.id, track.id)
                }
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-[28px] ios-glass p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Users className="w-4 h-4 text-[#FF4D2E]" />
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold text-zinc-950 dark:text-white">
              Playlist Bersama (Real-Time)
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Susun playlist bareng teman pakai kode undangan
            </p>
          </div>
        </div>
        <span className="text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
          {sharedPlaylists.length} aktif
        </span>
      </div>

      {/* Create & Join Forms */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <form onSubmit={handleCreate} className="lg:col-span-7 flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={60}
            placeholder="Nama playlist bersama..."
            className="flex-1 px-4 py-2 rounded-full text-sm bg-black/[0.045] dark:bg-white/[0.065] border border-black/[0.06] dark:border-white/[0.09] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#FF4D2E]"
          />
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            maxLength={180}
            placeholder="Catatan (opsional)"
            className="sm:w-40 px-4 py-2 rounded-full text-sm bg-black/[0.045] dark:bg-white/[0.065] border border-black/[0.06] dark:border-white/[0.09] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#FF4D2E]"
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shrink-0 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Buat</span>
          </button>
        </form>

        <form onSubmit={handleJoin} className="lg:col-span-5 flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={16}
            placeholder="Kode (mis. AX8M4K2P)"
            className="flex-1 min-w-0 px-4 py-2 rounded-full text-sm font-mono uppercase bg-black/[0.045] dark:bg-white/[0.065] border border-black/[0.06] dark:border-white/[0.09] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#FF4D2E]"
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full ios-glass-pill text-xs font-semibold text-zinc-800 dark:text-zinc-100 hover:bg-white/80 dark:hover:bg-white/[0.12] active:scale-95 transition-all shrink-0 disabled:opacity-50"
          >
            <UserPlus className="w-3.5 h-3.5 text-[#FF4D2E]" />
            <span>Join</span>
          </button>
        </form>
      </div>

      {loading && sharedPlaylists.length === 0 ? (
        <div className="text-xs text-zinc-500">Menyinkronkan playlist bersama...</div>
      ) : sharedPlaylists.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sharedPlaylists.map((pl) => (
            <button
              key={pl.id}
              type="button"
              onClick={() => setSelectedId(pl.id)}
              className="flex items-center justify-between gap-3 p-3.5 rounded-2xl ios-glass-card text-left hover:-translate-y-0.5 active:scale-[0.98] transition-all"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {pl.name}
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-2 font-mono tabular-nums">
                  <span>{pl.tracks.length} lagu</span>
                  <span>·</span>
                  <span>{pl.members.length} anggota</span>
                  <span>·</span>
                  <span className="text-[#FF4D2E]">{pl.inviteCode}</span>
                </div>
              </div>
              <Users className="w-4 h-4 text-[#FF4D2E] shrink-0" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
