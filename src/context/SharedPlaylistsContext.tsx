import { createContext, useContext, type ReactNode } from 'react';
import { useSharedPlaylists } from '../hooks/useSharedPlaylists';
import type { SharedPlaylist } from '../types/account';
import type { Track } from '../types/music';

interface SharedPlaylistsContextValue {
  sharedPlaylists: SharedPlaylist[];
  loading: boolean;
  createSharedPlaylist: (name: string, description?: string, initialTrack?: Track) => Promise<SharedPlaylist>;
  joinSharedPlaylistByCode: (rawCode: string) => Promise<SharedPlaylist>;
  addTrackToSharedPlaylist: (playlistId: string, track: Track) => Promise<'added' | 'exists' | undefined>;
  removeTrackFromSharedPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  leaveSharedPlaylist: (playlistId: string) => Promise<void>;
  deleteSharedPlaylist: (playlistId: string) => Promise<void>;
}

const SharedPlaylistsContext = createContext<SharedPlaylistsContextValue | null>(null);

export function SharedPlaylistsProvider({ children }: { children: ReactNode }) {
  const api = useSharedPlaylists();
  return (
    <SharedPlaylistsContext.Provider value={api}>
      {children}
    </SharedPlaylistsContext.Provider>
  );
}

export function useSharedPlaylistsContext(): SharedPlaylistsContextValue {
  const ctx = useContext(SharedPlaylistsContext);
  if (!ctx) {
    throw new Error('useSharedPlaylistsContext must be used within SharedPlaylistsProvider');
  }
  return ctx;
}
