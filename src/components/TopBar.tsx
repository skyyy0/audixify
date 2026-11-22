import { LayoutGroup, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { Moon, Search, Sun, User, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import type { RegionScope } from '../types/music';
import { IOS_SPRING_SNAPPY } from '../utils/motion';
import { BrandMark } from './BrandMark';
import { DeveloperBadge } from './DeveloperBadge';

interface TopBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSearchSubmit: (q: string) => void;
  regionScope: RegionScope;
  onRegionChange: (scope: RegionScope) => void;
  onHomeClick: () => void;
  onProfileClick: () => void;
}

const REGION_TABS: Array<{ id: RegionScope; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'id', label: 'Indonesia' },
  { id: 'asia', label: 'Asia' },
  { id: 'global', label: 'Global' },
];

export function TopBar({
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  regionScope,
  onRegionChange,
  onHomeClick,
  onProfileClick,
}: TopBarProps) {
  const { theme, toggleTheme } = usePlayer();
  const { user, profile, isDeveloper } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const avatarSrc = profile?.avatarDataUrl || user?.photoURL || '';

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) &&
        document.activeElement?.tagName !== 'INPUT'
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchSubmit(searchQuery);
  };

  return (
    <header className="px-4 pt-3 pb-2 md:px-6 md:pt-3 md:pb-2 shrink-0 z-20">
      <div className="h-12 md:h-14 px-3 md:px-4 rounded-[22px] ios-glass flex items-center justify-between gap-3 md:gap-4">
        {/* Mobile Brand */}
        <button
          type="button"
          onClick={onHomeClick}
          className="flex md:hidden items-center gap-2 shrink-0 active:scale-95 transition-transform"
          aria-label="Audixify Home"
        >
          <BrandMark className="w-6 h-6" />
          <span className="font-display text-base font-bold text-zinc-900 dark:text-zinc-100">
            Audixify
          </span>
        </button>

        {/* Search Capsule */}
        <form onSubmit={handleSubmit} className="flex-1 max-w-md relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={inputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search Dewa 19, Tulus, Slank, Justin Bieber..."
            aria-label="Search music catalog"
            className="w-full h-9 pl-9 pr-8 rounded-full text-xs md:text-sm bg-black/[0.045] dark:bg-white/[0.065] border border-black/[0.04] dark:border-white/[0.07] focus:border-[#FF4D2E]/60 focus:bg-white/90 dark:focus:bg-white/[0.11] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:outline-none transition-all duration-200"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </form>

        {/* Region Segmented Capsule + Theme Switch */}
        <div className="flex items-center gap-2.5 shrink-0">
          <LayoutGroup id="topbar-region-group">
            <div
              className="hidden lg:flex items-center gap-0.5 p-1 rounded-full ios-glass-pill"
              role="group"
              aria-label="Region filter"
            >
              {REGION_TABS.map((tab) => {
                const active = regionScope === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onRegionChange(tab.id)}
                    className={`relative px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'text-zinc-950 dark:text-white'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="region-pill"
                        transition={IOS_SPRING_SNAPPY}
                        className="absolute inset-0 rounded-full bg-white/95 dark:bg-white/[0.16] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_8px_rgba(0,0,0,0.08)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_10px_rgba(0,0,0,0.3)]"
                      />
                    )}
                    <span className="relative z-10">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </LayoutGroup>

          <motion.button
            type="button"
            whileTap={{ scale: 0.88 }}
            transition={IOS_SPRING_SNAPPY}
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light studio mode' : 'Switch to dark obsidian mode'}
            className="w-9 h-9 rounded-full flex items-center justify-center ios-glass-pill hover:bg-white/70 dark:hover:bg-white/[0.12] text-zinc-700 dark:text-zinc-200 transition-colors"
          >
            <motion.div
              key={theme}
              initial={{ rotate: -35, opacity: 0, scale: 0.75 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              transition={IOS_SPRING_SNAPPY}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </motion.div>
          </motion.button>

          <button
            type="button"
            onClick={onProfileClick}
            aria-label="Open Profile and Settings"
            className="relative w-9 h-9 rounded-full flex items-center justify-center ios-glass-pill hover:bg-white/70 dark:hover:bg-white/[0.12] text-zinc-700 dark:text-zinc-200 transition-transform active:scale-90 overflow-visible"
          >
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt={profile?.displayName || 'Profile'}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <User className="w-4 h-4" />
            )}
            {isDeveloper && (
              <span className="absolute -bottom-1 -right-1 scale-75">
                <DeveloperBadge />
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
