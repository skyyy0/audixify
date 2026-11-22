import { LayoutGroup, motion } from 'motion/react';
import { useState } from 'react';
import { BarChart3, Compass, Flame, Heart, Library, ListMusic, Plus, Search, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { IOS_SPRING_SNAPPY } from '../utils/motion';
import { BrandMark } from './BrandMark';
import { DeveloperBadge, GreenVerifiedBadge } from './VerifiedBadge';

export type NavDestination = 'discover' | 'charts' | 'search' | 'library' | 'profile' | 'playlist' | 'artist' | 'album';

interface SidebarProps {
  activeView: NavDestination;
  activePlaylistId: string | null;
  onNavigate: (view: NavDestination, playlistId?: string) => void;
}

export function Sidebar({ activeView, activePlaylistId, onNavigate }: SidebarProps) {
  const { likedTracks, playlists, createPlaylist } = usePlayer();
  const { profile, user, isDeveloper, showGreenCheckmark } = useAuth();
  const [creating, setCreating] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    const created = createPlaylist(nameInput.trim());
    setNameInput('');
    setCreating(false);
    onNavigate('playlist', created.id);
  };

  const navItems: Array<{ id: NavDestination; label: string; icon: typeof Compass }> = [
    { id: 'discover', label: 'Home', icon: Compass },
    { id: 'charts', label: 'Top Charts', icon: BarChart3 },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'library', label: 'Your Library', icon: Library },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <aside className="hidden md:flex flex-col md:w-56 lg:w-64 shrink-0 h-full p-3 pr-0 select-none">
      <div className="flex flex-col flex-1 min-h-0 rounded-[26px] ios-glass overflow-hidden">
        {/* Brand Lockup */}
        <div className="px-5 h-16 shrink-0 flex items-center gap-3 border-b border-black/[0.06] dark:border-white/[0.07]">
          <BrandMark className="w-7 h-7 shrink-0" />
          <span className="font-display text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
            Audixify
          </span>
        </div>

        {/* Primary Nav */}
        <LayoutGroup id="sidebar-nav-group">
          <nav className="px-3 py-3 space-y-1 shrink-0" aria-label="Primary navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                activeView === item.id || (item.id === 'library' && activeView === 'playlist');
              return (
                <motion.button
                  key={item.id}
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  transition={IOS_SPRING_SNAPPY}
                  onClick={() => onNavigate(item.id)}
                  className={`relative w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'text-zinc-950 dark:text-white'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="sidebar-active-pill"
                      transition={IOS_SPRING_SNAPPY}
                      className="absolute inset-0 rounded-2xl bg-white/85 dark:bg-white/[0.12] border border-white/70 dark:border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_4px_12px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_4px_14px_rgba(0,0,0,0.28)]"
                    />
                  )}
                  {item.id === 'profile' && (profile?.avatarDataUrl || user?.photoURL) ? (
                    <img
                      src={profile?.avatarDataUrl || user?.photoURL || ''}
                      alt={profile?.displayName || 'Profile'}
                      className="relative z-10 w-4 h-4 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <Icon className={`relative z-10 w-4 h-4 shrink-0 transition-colors ${active ? 'text-[#FF4D2E]' : ''}`} />
                  )}
                  <span className="relative z-10 flex-1 text-left truncate">{item.label}</span>
                  {item.id === 'profile' && (
                    <span className="relative z-10 flex items-center gap-1">
                      {(profile?.streakCount ?? 0) >= 1 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[#FF4D2E]/15 text-[#FF4D2E] text-[10px] font-mono font-bold">
                          <Flame className="w-2.5 h-2.5" />
                          <span>{profile?.streakCount}</span>
                        </span>
                      )}
                      {isDeveloper && <DeveloperBadge />}
                      {showGreenCheckmark && <GreenVerifiedBadge />}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </nav>
        </LayoutGroup>

        {/* Playlists & Liked */}
        <div className="px-4 pt-3 pb-2 shrink-0 flex items-center justify-between border-t border-black/[0.06] dark:border-white/[0.07]">
          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Playlists</span>
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => setCreating((v) => !v)}
            aria-label="Create new playlist"
            className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
          >
            <Plus className="w-4 h-4" />
          </motion.button>
        </div>

        {creating && (
          <form onSubmit={handleCreate} className="px-3 pb-2 flex items-center gap-1.5">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Playlist name"
              autoFocus
              className="flex-1 min-w-0 px-3 py-1.5 text-xs rounded-xl bg-white/80 dark:bg-white/[0.07] border border-black/[0.08] dark:border-white/[0.1] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#FF4D2E]"
            />
            <button
              type="submit"
              className="px-2.5 py-1.5 text-xs font-medium rounded-xl bg-[#FF4D2E] text-white hover:bg-[#E63E21] shrink-0"
            >
              Save
            </button>
          </form>
        )}

        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
          <button
            type="button"
            onClick={() => onNavigate('library')}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-2xl text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white/60 dark:hover:bg-white/[0.06] transition-colors"
          >
            <span className="flex items-center gap-2.5 truncate">
              <Heart className="w-3.5 h-3.5 text-[#FF4D2E] fill-current shrink-0" />
              <span className="truncate">Liked Songs</span>
            </span>
            <span className="font-mono tabular-nums text-[11px] text-zinc-500 dark:text-zinc-400">
              {likedTracks.length}
            </span>
          </button>

          {playlists.map((pl) => {
            const isCurrentPl = activeView === 'playlist' && activePlaylistId === pl.id;
            return (
              <button
                key={pl.id}
                type="button"
                onClick={() => onNavigate('playlist', pl.id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-2xl text-xs font-medium transition-colors ${
                  isCurrentPl
                    ? 'bg-white/80 dark:bg-white/[0.11] text-zinc-950 dark:text-white shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/60 dark:hover:bg-white/[0.06]'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <ListMusic className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{pl.name}</span>
                </span>
                <span className="font-mono tabular-nums text-[11px] text-zinc-500 dark:text-zinc-400">
                  {pl.tracks.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* Developer Credit */}
        <div className="px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.07] text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
          <span>Audixify</span>
          <span>Built by sky</span>
        </div>
      </div>
    </aside>
  );
}
