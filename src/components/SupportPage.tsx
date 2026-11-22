import { ArrowLeft, Moon, ShieldCheck, Sun } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { BrandMark } from './BrandMark';
import { DeveloperBadge } from './DeveloperBadge';
import { SupportChatSection } from './profile/SupportChatSection';

interface SupportPageProps {
  onBackToApp: () => void;
}

export function SupportPage({ onBackToApp }: SupportPageProps) {
  const { theme, toggleTheme } = usePlayer();
  const { user, profile, isDeveloper } = useAuth();

  return (
    <div className="h-full w-full flex flex-col overflow-hidden ios-ambient-canvas text-zinc-900 dark:text-zinc-100">
      {/* Dedicated Fullscreen Support Header */}
      <header className="px-3 pt-2.5 pb-1.5 sm:px-4 md:px-8 shrink-0 z-20">
        <div className="max-w-6xl mx-auto h-14 px-4 rounded-[22px] ios-glass flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBackToApp}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full ios-glass-pill text-xs font-semibold text-zinc-800 dark:text-zinc-100 hover:bg-white/80 dark:hover:bg-white/[0.12] active:scale-95 transition-all shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Audixify</span>
            </button>

            <div className="hidden sm:flex items-center gap-2 min-w-0">
              <BrandMark className="w-6 h-6 shrink-0" />
              <span className="font-display font-bold text-base text-zinc-950 dark:text-white truncate">
                Audixify Support Center
              </span>
              <DeveloperBadge />
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full ios-glass-pill text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
              <ShieldCheck className="w-3.5 h-3.5 text-[#FF4D2E]" />
              <span>
                {user
                  ? `${profile?.displayName || user.displayName || 'Signed in'}${isDeveloper ? ' · Dev' : ''}`
                  : 'Guest'}
              </span>
            </span>

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

      {/* Fullscreen Workspace */}
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 py-2.5 sm:px-4 md:px-8 md:py-4">
        <div className="max-w-6xl mx-auto">
          <SupportChatSection fullScreen />
        </div>
      </main>
    </div>
  );
}
