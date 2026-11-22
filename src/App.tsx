import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { ArtistAlbumView } from './components/ArtistAlbumView';
import { ChartsView } from './components/ChartsView';
import { DiscoverView } from './components/DiscoverView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LibraryView } from './components/LibraryView';
import { PlayerBar } from './components/PlayerBar';
import { SearchView } from './components/SearchView';
import { Sidebar, type NavDestination } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import type { DiscoverPayload, RegionScope, SearchPayload } from './types/music';
import { apiFetch } from './utils/apiFetch';
import { IOS_SPRING, IOS_SPRING_SNAPPY } from './utils/motion';

const NowPlayingDrawer = lazy(() =>
  import('./components/NowPlayingDrawer').then((m) => ({ default: m.NowPlayingDrawer })),
);

const ProfileView = lazy(() =>
  import('./components/ProfileView').then((m) => ({ default: m.ProfileView })),
);

const SupportPage = lazy(() =>
  import('./components/SupportPage').then((m) => ({ default: m.SupportPage })),
);

function AudixifyShell() {
  const { currentTrack, toastMessage } = usePlayer();
  const { preferences } = useAuth();

  const [isSupportRoute, setIsSupportRoute] = useState<boolean>(
    () => typeof window !== 'undefined' && window.location.pathname === '/support',
  );
  const [activeView, setActiveView] = useState<NavDestination>('discover');
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [regionScope, setRegionScope] = useState<RegionScope>(() => preferences.defaultRegion || 'all');

  useEffect(() => {
    const handlePopState = () => {
      setIsSupportRoute(window.location.pathname === '/support');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openSupportPage = useCallback(() => {
    if (window.location.pathname !== '/support') {
      window.history.pushState({ page: 'support' }, '', '/support');
    }
    setIsSupportRoute(true);
  }, []);

  const closeSupportPage = useCallback(() => {
    if (window.location.pathname === '/support') {
      window.history.pushState({ page: 'app' }, '', '/');
    }
    setIsSupportRoute(false);
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

  const handleNavigate = (view: NavDestination, playlistId?: string) => {
    setDetailTarget(null);
    setActiveView(view);
    if (view === 'playlist' && playlistId) {
      setActivePlaylistId(playlistId);
    } else if (view !== 'playlist') {
      setActivePlaylistId(null);
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
  };

  const handleAlbumClick = (title: string, artist: string) => {
    setDetailTarget({
      mode: 'album',
      artistName: artist,
      albumTitle: title,
      previousView: activeView === 'artist' || activeView === 'album' ? 'discover' : activeView,
    });
    setActiveView('album');
  };

  const viewKey =
    (activeView === 'artist' || activeView === 'album') && detailTarget
      ? `${detailTarget.mode}-${detailTarget.artistName}-${detailTarget.albumTitle || ''}`
      : activeView === 'playlist'
        ? `playlist-${activePlaylistId || ''}`
        : activeView;

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden ios-ambient-canvas text-zinc-900 dark:text-zinc-100 transition-colors duration-300">
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
      ) : (
        <>
          <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar
          activeView={activeView}
          activePlaylistId={activePlaylistId}
          onNavigate={handleNavigate}
        />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <TopBar
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            onSearchSubmit={handleSearchSubmit}
            regionScope={regionScope}
            onRegionChange={handleRegionChange}
            onHomeClick={() => handleNavigate('discover')}
            onProfileClick={() => handleNavigate('profile')}
          />

          <main className="flex-1 overflow-y-auto px-4 py-3 md:px-6 md:py-4 scroll-smooth">
            <div className="max-w-7xl mx-auto">
              <motion.div
                key={viewKey}
                initial={{ opacity: 0, y: 10, scale: 0.994 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={IOS_SPRING}
              >
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
                      <div className="rounded-[28px] ios-glass p-8 text-center text-xs text-zinc-500">
                        Loading profile &amp; settings...
                      </div>
                    }
                  >
                    <ProfileView
                      onApplyDefaultRegion={(reg) => setRegionScope(reg)}
                      onOpenSupportPage={openSupportPage}
                    />
                  </Suspense>
                ) : activeView === 'library' || activeView === 'playlist' ? (
                  <LibraryView
                    activePlaylistId={activePlaylistId}
                    onSelectPlaylist={(id) => {
                      setActivePlaylistId(id);
                      setActiveView(id ? 'playlist' : 'library');
                    }}
                    onArtistClick={handleArtistClick}
                    onAlbumClick={handleAlbumClick}
                    onExploreClick={() => handleNavigate('discover')}
                  />
                ) : (
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
                  />
                )}
              </motion.div>
            </div>
          </main>
        </div>
      </div>

      <PlayerBar
        activeView={activeView}
        onNavigate={(view) => handleNavigate(view)}
        onArtistClick={handleArtistClick}
      />

          {currentTrack && (
            <Suspense fallback={null}>
              <NowPlayingDrawer onArtistClick={handleArtistClick} />
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <AuthProvider>
          <PlayerProvider>
            <AudixifyShell />
          </PlayerProvider>
        </AuthProvider>
      </MotionConfig>
    </ErrorBoundary>
  );
}
