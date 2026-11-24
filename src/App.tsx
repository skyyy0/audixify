import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, CheckCircle2, Flame, WifiOff, X } from 'lucide-react';
import { ArtistAlbumView } from './components/ArtistAlbumView';
import { ChartsView } from './components/ChartsView';
import { DiscoverView } from './components/DiscoverView';
import { EqualizerModal } from './components/EqualizerModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LibraryView } from './components/LibraryView';
import { PlayerBar } from './components/PlayerBar';
import { PWAPromptModal } from './components/PWAPromptModal';
import { SafeModeModal } from './components/SafeModeModal';
import { SearchView } from './components/SearchView';
import { ShortcutsModal } from './components/ShortcutsModal';
import { Sidebar, type NavDestination } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { TrackInfoModal } from './components/TrackInfoModal';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import { SharedPlaylistsProvider } from './context/SharedPlaylistsContext';
import { usePWAInstall } from './hooks/usePWAInstall';
import type { DiscoverPayload, RegionScope, SearchPayload } from './types/music';
import {
  apiFetch,
  checkReloadSpamOnBoot,
  subscribeSafeMode,
  type SafeModeState,
} from './utils/apiFetch';
import { IOS_SPRING_SNAPPY } from './utils/motion';

const NowPlayingDrawer = lazy(() =>
  import('./components/NowPlayingDrawer').then((m) => ({ default: m.NowPlayingDrawer })),
);

const ProfileView = lazy(() =>
  import('./components/ProfileView').then((m) => ({ default: m.ProfileView })),
);

const SupportPage = lazy(() =>
  import('./components/SupportPage').then((m) => ({ default: m.SupportPage })),
);

const MusicCollageModal = lazy(() =>
  import('./components/MusicCollageModal').then((m) => ({ default: m.MusicCollageModal })),
);

const ListenTogetherPage = lazy(() =>
  import('./components/ListenTogetherPage').then((m) => ({ default: m.ListenTogetherPage })),
);

const TikTokEventModal = lazy(() =>
  import('./components/TikTokEventModal').then((m) => ({ default: m.TikTokEventModal })),
);

function isListenTogetherPath(pathname: string): boolean {
  const norm = decodeURIComponent(pathname).toLowerCase().replace(/\/+$/, '');
  return norm === '/listen-together' || norm === '/listing-together' || norm === '/listing together';
}

function AudixifyShell() {
  const {
    currentTrack,
    toastMessage,
    togglePlayPause,
    toggleMute,
    seekTo,
    setEqModalOpen,
    nowPlayingOpen,
  } = usePlayer();
  const { preferences, streakBannerMessage, dismissStreakBanner } = useAuth();
  const pwa = usePWAInstall();

  const [isSupportRoute, setIsSupportRoute] = useState<boolean>(
    () => typeof window !== 'undefined' && window.location.pathname === '/support',
  );
  const [isListenTogetherRoute, setIsListenTogetherRoute] = useState<boolean>(
    () => typeof window !== 'undefined' && isListenTogetherPath(window.location.pathname),
  );
  const [initialRoomCode, setInitialRoomCode] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const r = new URLSearchParams(window.location.search).get('room');
      return r && r.trim() ? r.trim().toUpperCase() : null;
    } catch {
      return null;
    }
  });
  const [activeView, setActiveView] = useState<NavDestination>('discover');
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [regionScope, setRegionScope] = useState<RegionScope>(() => preferences.defaultRegion || 'all');
  const [pendingJoinCode, setPendingJoinCode] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [collageModalOpen, setCollageModalOpen] = useState(false);
  const [tiktokEventOpen, setTiktokEventOpen] = useState(false);
  const [safeMode, setSafeMode] = useState<SafeModeState>({ active: false, reason: '' });

  const mainScrollRef = useRef<HTMLElement | null>(null);
  const currentTimeRef = useRef(0);

  useEffect(() => {
    const unsub = subscribeSafeMode(setSafeMode);
    checkReloadSpamOnBoot();
    return unsub;
  }, []);

  // Read ?join=CODE, ?room=CODE, or ?q=QUERY invite/search links cleanly on load
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const join = params.get('join');
      const room = params.get('room');
      const q = params.get('q');

      if (room && room.trim()) {
        setInitialRoomCode(room.trim().toUpperCase());
        setIsListenTogetherRoute(true);
        if (!isListenTogetherPath(window.location.pathname)) {
          window.history.replaceState(
            window.history.state,
            '',
            `/listen-together?room=${encodeURIComponent(room.trim().toUpperCase())}`,
          );
        }
        return;
      }

      if (join && join.trim()) {
        setPendingJoinCode(join.trim().toUpperCase());
        setActiveView('library');
        params.delete('join');
        const nextSearch = params.toString();
        const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`;
        window.history.replaceState(window.history.state, '', nextUrl);
      } else if (q && q.trim()) {
        setSearchQuery(q.trim());
        setActiveView('search');
      }
    } catch {}
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setIsSupportRoute(window.location.pathname === '/support');
      setIsListenTogetherRoute(isListenTogetherPath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Keep page <title> and canonical link synced with active dedicated route for SEO
  useEffect(() => {
    const canonicalEl = document.querySelector('link[rel="canonical"]');
    if (isListenTogetherRoute) {
      document.title = 'Listen Together — Audixify Real-Time Listening Room';
      canonicalEl?.setAttribute('href', 'https://audixify.skydev.my.id/listen-together');
    } else if (isSupportRoute) {
      document.title = 'Support Center — Audixify';
      canonicalEl?.setAttribute('href', 'https://audixify.skydev.my.id/support');
    } else {
      document.title = 'Audixify — Stream Musik Indonesia, Asia & Global + Lirik Sync & Listen Together';
      canonicalEl?.setAttribute('href', 'https://audixify.skydev.my.id/');
    }
  }, [isListenTogetherRoute, isSupportRoute]);

  const openSupportPage = useCallback(() => {
    if (window.location.pathname !== '/support') {
      window.history.pushState({ page: 'support' }, '', '/support');
    }
    setIsListenTogetherRoute(false);
    setIsSupportRoute(true);
  }, []);

  const closeSupportPage = useCallback(() => {
    if (window.location.pathname === '/support') {
      window.history.pushState({ page: 'app' }, '', '/');
    }
    setIsSupportRoute(false);
  }, []);

  const openListenTogetherPage = useCallback(() => {
    if (!isListenTogetherPath(window.location.pathname)) {
      window.history.pushState({ page: 'listen-together' }, '', '/listen-together');
    }
    setIsSupportRoute(false);
    setIsListenTogetherRoute(true);
  }, []);

  const closeListenTogetherPage = useCallback(() => {
    if (isListenTogetherPath(window.location.pathname)) {
      window.history.pushState({ page: 'app' }, '', '/');
    }
    setIsListenTogetherRoute(false);
  }, []);

  const [discoverData, setDiscoverData] = useState<DiscoverPayload | null>(null);
  const [discoverLoading, setDiscoverLoading] = useState(true);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchPayload | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [detailTarget, setDetailTarget] = useState<{
    mode: 'artist' | 'album';
    artistName: string;
    albumTitle?: string;
    previousView: NavDestination;
  } | null>(null);

  const loadDiscover = useCallback((scope: RegionScope) => {
    setDiscoverLoading(true);
    setDiscoverError(null);
    apiFetch(`/api/discover?scope=${encodeURIComponent(scope)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Unable to fetch music catalog');
        return (await res.json()) as DiscoverPayload;
      })
      .then((json) => {
        setDiscoverData(json);
        setDiscoverLoading(false);
      })
      .catch((err) => {
        setDiscoverError(err instanceof Error ? err.message : 'Catalog load failed');
        setDiscoverLoading(false);
      });
  }, []);

  useEffect(() => {
    loadDiscover(regionScope);
  }, [regionScope, loadDiscover]);

  // Debounced live search
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults(null);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearchLoading(true);
      setSearchError(null);
      apiFetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error('Search request failed');
          return (await res.json()) as SearchPayload;
        })
        .then((json) => {
          setSearchResults(json);
          setSearchLoading(false);
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return;
          setSearchError('Search failed. Please try again.');
          setSearchLoading(false);
        });
    }, 320);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  // Global keyboard shortcuts when not typing in an input/textarea
  useEffect(() => {
    const onGlobalKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === ' ' && !nowPlayingOpen && currentTrack) {
        if (tag !== 'BUTTON') {
          e.preventDefault();
          togglePlayPause();
        }
      } else if (e.key.toLowerCase() === 'm' && currentTrack) {
        e.preventDefault();
        toggleMute();
      } else if (e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setEqModalOpen(true);
      } else if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShortcutsOpen((o) => !o);
      } else if (e.key === 'ArrowRight' && currentTrack) {
        const audio = document.querySelector('audio');
        if (audio) {
          currentTimeRef.current = audio.currentTime;
          seekTo(currentTimeRef.current + 5);
        }
      } else if (e.key === 'ArrowLeft' && currentTrack) {
        const audio = document.querySelector('audio');
        if (audio) {
          currentTimeRef.current = audio.currentTime;
          seekTo(Math.max(0, currentTimeRef.current - 5));
        }
      }
    };

    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, [currentTrack, nowPlayingOpen, seekTo, setEqModalOpen, toggleMute, togglePlayPause]);

  const handleNavigate = (view: NavDestination, playlistId?: string) => {
    setDetailTarget(null);
    setActiveView(view);
    if (view === 'playlist' && playlistId) {
      setActivePlaylistId(playlistId);
    } else if (view !== 'playlist') {
      setActivePlaylistId(null);
    }
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTop = 0;
    }
  };

  const handleRegionChange = (scope: RegionScope) => {
    setRegionScope(scope);
    if (activeView !== 'discover') {
      setDetailTarget(null);
      setActiveView('discover');
    }
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (q.trim() && activeView !== 'search') {
      setDetailTarget(null);
      setActiveView('search');
    }
  };

  const handleSearchSubmit = (q: string) => {
    setSearchQuery(q);
    setDetailTarget(null);
    setActiveView('search');
  };

  const handleArtistClick = (name: string) => {
    setDetailTarget({
      mode: 'artist',
      artistName: name,
      previousView: activeView === 'artist' || activeView === 'album' ? 'discover' : activeView,
    });
    setActiveView('artist');
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTop = 0;
    }
  };

  const handleAlbumClick = (title: string, artist: string) => {
    setDetailTarget({
      mode: 'album',
      artistName: artist,
      albumTitle: title,
      previousView: activeView === 'artist' || activeView === 'album' ? 'discover' : activeView,
    });
    setActiveView('album');
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTop = 0;
    }
  };

  const viewKey =
    (activeView === 'artist' || activeView === 'album') && detailTarget
      ? `${detailTarget.mode}-${detailTarget.artistName}-${detailTarget.albumTitle || ''}`
      : activeView === 'playlist'
        ? `playlist-${activePlaylistId || ''}`
        : activeView;

  useEffect(() => {
    const preventMultiTouch = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };
    const preventGesture = (e: Event) => {
      e.preventDefault();
    };
    const preventWheelZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };
    const preventKeyZoom = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchstart', preventMultiTouch, { passive: false });
    document.addEventListener('touchmove', preventMultiTouch, { passive: false });
    document.addEventListener('gesturestart', preventGesture, { passive: false });
    document.addEventListener('gesturechange', preventGesture, { passive: false });
    document.addEventListener('gestureend', preventGesture, { passive: false });
    window.addEventListener('wheel', preventWheelZoom, { passive: false });
    window.addEventListener('keydown', preventKeyZoom);

    return () => {
      document.removeEventListener('touchstart', preventMultiTouch);
      document.removeEventListener('touchmove', preventMultiTouch);
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('gestureend', preventGesture);
      window.removeEventListener('wheel', preventWheelZoom);
      window.removeEventListener('keydown', preventKeyZoom);
    };
  }, []);

  return (
    <div className="h-screen supports-[height:100dvh]:h-dvh w-full flex flex-col overflow-hidden ios-ambient-canvas text-zinc-900 dark:text-zinc-100 transition-colors duration-300">
      {/* Offline Indicator Pill */}
      <AnimatePresence>
        {pwa.isOffline && (
          <motion.div
            key="offline-pill"
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={IOS_SPRING_SNAPPY}
            className="fixed top-3 left-1/2 -translate-x-1/2 z-[72] px-4 py-1.5 rounded-full bg-amber-500 text-zinc-950 text-xs font-semibold flex items-center gap-2 shadow-lg"
          >
            <WifiOff className="w-3.5 h-3.5" />
            <span>Offline Mode — Koleksi lokal tetap tersedia</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Daily Streak Milestone Unlock Toast */}
      <AnimatePresence>
        {streakBannerMessage && (
          <motion.div
            key="streak-banner"
            initial={{ y: -28, opacity: 0, scale: 0.94 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -20, opacity: 0, scale: 0.94 }}
            transition={IOS_SPRING_SNAPPY}
            className="fixed top-4 right-4 z-[71] max-w-sm rounded-2xl ios-glass px-4 py-3 shadow-xl flex items-center gap-3 border border-[#FF4D2E]/35"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FF4D2E] to-amber-500 text-white flex items-center justify-center shrink-0">
              <Flame className="w-4 h-4" />
            </div>
            <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex-1 leading-snug">
              {streakBannerMessage}
            </p>
            <button
              type="button"
              onClick={dismissStreakBanner}
              aria-label="Tutup notifikasi streak"
              className="p-1 text-zinc-400 hover:text-zinc-800 dark:hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS Dynamic Island Style Floating Feedback Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            key={toastMessage}
            initial={{ y: -24, opacity: 0, scale: 0.94 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -18, opacity: 0, scale: 0.94 }}
            transition={IOS_SPRING_SNAPPY}
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed top-4 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-full ios-glass flex items-center gap-2 text-xs font-medium text-zinc-900 dark:text-white shadow-lg max-w-[90vw]"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-[#FF4D2E] shrink-0" />
            <span className="truncate">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {isSupportRoute ? (
        <Suspense
          fallback={
            <div className="min-h-screen w-full flex items-center justify-center ios-ambient-canvas text-xs text-zinc-500">
              Loading Audixify Support Center...
            </div>
          }
        >
          <SupportPage onBackToApp={closeSupportPage} />
        </Suspense>
      ) : isListenTogetherRoute ? (
        <Suspense
          fallback={
            <div className="min-h-screen w-full flex items-center justify-center ios-ambient-canvas text-xs text-zinc-500">
              Loading Audixify Listen Together...
            </div>
          }
        >
          <ListenTogetherPage
            initialRoomCode={initialRoomCode}
            onClearInitialRoomCode={() => setInitialRoomCode(null)}
            onBackToApp={closeListenTogetherPage}
          />
        </Suspense>
      ) : (
        <>
          <div className="flex-1 flex min-h-0 overflow-hidden">
            <Sidebar
              activeView={activeView}
              activePlaylistId={activePlaylistId}
              onNavigate={handleNavigate}
              onOpenShortcuts={() => setShortcutsOpen(true)}
              onOpenListenTogether={openListenTogetherPage}
              onOpenTikTokEvent={() => setTiktokEventOpen(true)}
            />

            <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden relative">
              <TopBar
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
                onSearchSubmit={handleSearchSubmit}
                regionScope={regionScope}
                onRegionChange={handleRegionChange}
                onHomeClick={() => handleNavigate('discover')}
                onProfileClick={() => handleNavigate('profile')}
              />

              <main
                ref={mainScrollRef}
                onScroll={(e) => {
                  const top = e.currentTarget.scrollTop;
                  if (top > 480 && !showScrollTop) setShowScrollTop(true);
                  else if (top <= 480 && showScrollTop) setShowScrollTop(false);
                }}
                className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain px-3 py-2.5 sm:px-4 sm:py-3 md:px-6 md:py-4"
              >
                <div className="max-w-7xl mx-auto">
                  {/* Keep DiscoverView mounted across tabs so switching back to Home takes <10ms */}
                  <div
                    className={activeView === 'discover' ? 'audixify-view-enter' : 'hidden'}
                    aria-hidden={activeView !== 'discover'}
                  >
                    <DiscoverView
                      data={discoverData}
                      loading={discoverLoading}
                      error={discoverError}
                      regionScope={regionScope}
                      onRegionChange={handleRegionChange}
                      onRetry={() => loadDiscover(regionScope)}
                      onOpenCharts={() => handleNavigate('charts')}
                      onArtistClick={handleArtistClick}
                      onAlbumClick={handleAlbumClick}
                      onOpenCollageStudio={() => setCollageModalOpen(true)}
                      onOpenListenTogether={openListenTogetherPage}
                      onOpenTikTokEvent={() => setTiktokEventOpen(true)}
                    />
                  </div>

                  {activeView !== 'discover' && (
                    <div key={viewKey} className="audixify-view-enter">
                      {(activeView === 'artist' || activeView === 'album') && detailTarget ? (
                        <ArtistAlbumView
                          mode={detailTarget.mode}
                          artistName={detailTarget.artistName}
                          albumTitle={detailTarget.albumTitle}
                          onBack={() => handleNavigate(detailTarget.previousView)}
                          onArtistClick={handleArtistClick}
                          onAlbumClick={handleAlbumClick}
                        />
                      ) : activeView === 'charts' ? (
                        <ChartsView
                          data={discoverData}
                          loading={discoverLoading}
                          onArtistClick={handleArtistClick}
                          onAlbumClick={handleAlbumClick}
                        />
                      ) : activeView === 'search' ? (
                        <SearchView
                          query={searchQuery}
                          results={searchResults}
                          loading={searchLoading}
                          error={searchError}
                          onQuickQuery={(q) => handleSearchSubmit(q)}
                          onArtistClick={handleArtistClick}
                          onAlbumClick={handleAlbumClick}
                        />
                      ) : activeView === 'profile' ? (
                        <Suspense
                          fallback={
                            <div className="rounded-[28px] ios-glass-surface p-8 text-center text-xs text-zinc-500">
                              Loading profile &amp; settings...
                            </div>
                          }
                        >
                          <ProfileView
                            onApplyDefaultRegion={(reg) => setRegionScope(reg)}
                            onOpenSupportPage={openSupportPage}
                            onOpenShortcuts={() => setShortcutsOpen(true)}
                            onOpenCollageStudio={() => setCollageModalOpen(true)}
                            onOpenListenTogether={openListenTogetherPage}
                            onOpenTikTokEvent={() => setTiktokEventOpen(true)}
                            pwaState={{
                              isStandalone: pwa.isStandalone,
                              snoozeRemainingHours: pwa.snoozeRemainingHours,
                              onOpenInstallPrompt: pwa.openInstallPrompt,
                            }}
                          />
                        </Suspense>
                      ) : (
                        <LibraryView
                          activePlaylistId={activePlaylistId}
                          onSelectPlaylist={(id) => {
                            setActivePlaylistId(id);
                            setActiveView(id ? 'playlist' : 'library');
                          }}
                          onArtistClick={handleArtistClick}
                          onAlbumClick={handleAlbumClick}
                          onExploreClick={() => handleNavigate('discover')}
                          onOpenCollageStudio={() => setCollageModalOpen(true)}
                          initialJoinCode={pendingJoinCode}
                          onClearJoinCode={() => setPendingJoinCode(null)}
                        />
                      )}
                    </div>
                  )}
                </div>
              </main>

              {/* Floating Scroll-to-Top Capsule */}
              <AnimatePresence>
                {showScrollTop && (
                  <motion.button
                    key="scroll-top-btn"
                    type="button"
                    initial={{ opacity: 0, y: 12, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 12, scale: 0.9 }}
                    transition={IOS_SPRING_SNAPPY}
                    onClick={() => mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                    aria-label="Scroll to top"
                    className="absolute bottom-4 right-4 z-20 w-9 h-9 rounded-full ios-glass flex items-center justify-center text-zinc-700 dark:text-zinc-200 hover:text-[#FF4D2E] shadow-lg active:scale-90 transition-colors"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>

          <PlayerBar
            activeView={activeView}
            onNavigate={(view) => handleNavigate(view)}
            onArtistClick={handleArtistClick}
            onOpenListenTogether={openListenTogetherPage}
          />

          {currentTrack && (
            <Suspense fallback={null}>
              <NowPlayingDrawer onArtistClick={handleArtistClick} />
            </Suspense>
          )}
        </>
      )}

      {/* 5-Band Equalizer Modal */}
      <EqualizerModal />

      {/* Track Info & Credits Sheet */}
      <TrackInfoModal
        onArtistClick={handleArtistClick}
        onAlbumClick={handleAlbumClick}
      />

      {/* Keyboard Shortcuts Guide */}
      <ShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      {/* Music Story Collage Studio (3 Songs + Gallery Photo) */}
      <Suspense fallback={null}>
        <MusicCollageModal
          open={collageModalOpen}
          onClose={() => setCollageModalOpen(false)}
          discoverData={discoverData}
        />
      </Suspense>

      {/* TikTok #audixify Creator Promotion Event Modal */}
      <Suspense fallback={null}>
        <TikTokEventModal
          open={tiktokEventOpen}
          onClose={() => setTiktokEventOpen(false)}
          onOpenCollageStudio={() => setCollageModalOpen(true)}
          onOpenListenTogether={openListenTogetherPage}
        />
      </Suspense>

      {/* Smart 48-Hour Snoozeable PWA Install Popup */}
      <PWAPromptModal
        open={pwa.showPrompt}
        isIOS={pwa.isIOS}
        canNativeInstall={pwa.canNativeInstall}
        onInstall={pwa.triggerInstall}
        onDismiss48Hours={pwa.dismissFor48Hours}
      />

      {/* Anti-DDoS / Spam-Reload Safe Mode Human Verification Gate */}
      <SafeModeModal open={safeMode.active} reason={safeMode.reason} />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <AuthProvider>
          <SharedPlaylistsProvider>
            <PlayerProvider>
              <AudixifyShell />
            </PlayerProvider>
          </SharedPlaylistsProvider>
        </AuthProvider>
      </MotionConfig>
    </ErrorBoundary>
  );
}
