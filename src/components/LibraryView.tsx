import { useState } from 'react';
import { Heart, ListMusic, Play, Plus, Trash2, Users } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { formatRegionLabel } from '../utils/format';
import { Artwork } from './Artwork';
import { CollaborativePlaylistsSection } from './CollaborativePlaylistsSection';
import { TrackRow } from './TrackRow';

interface LibraryViewProps {
  activePlaylistId: string | null;
  onSelectPlaylist: (id: string | null) => void;
  onArtistClick: (name: string) => void;
  onAlbumClick: (title: string, artist: string) => void;
  onExploreClick: () => void;
  initialJoinCode?: string | null;
  onClearJoinCode?: () => void;
}

export function LibraryView({
  activePlaylistId,
  onSelectPlaylist,
  onArtistClick,
  onAlbumClick,
  onExploreClick,
  initialJoinCode,
  onClearJoinCode,
}: LibraryViewProps) {
  const {
    likedTracks,
    recentTracks,
    playlists,
    followedArtists,
    playTrack,
    createPlaylist,
    deletePlaylist,
    removeTrackFromPlaylist,
  } = usePlayer();

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const selectedPlaylist = activePlaylistId
    ? playlists.find((p) => p.id === activePlaylistId) || null
    : null;

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const created = createPlaylist(nameClean(newName), newDesc.trim());
    setNewName('');
    setNewDesc('');
    onSelectPlaylist(created.id);
  };

  if (selectedPlaylist) {
    return (
      <div className="space-y-6 pb-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 rounded-[28px] ios-glass p-6">
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => onSelectPlaylist(null)}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            >
              Library / Playlists
            </button>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-zinc-950 dark:text-white">
              {selectedPlaylist.name}
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {selectedPlaylist.description || 'Custom playlist'} ·{' '}
              <span className="font-mono tabular-nums">{selectedPlaylist.tracks.length}</span> tracks
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {selectedPlaylist.tracks.length > 0 && (
              <button
                type="button"
                onClick={() => playTrack(selectedPlaylist.tracks[0], selectedPlaylist.tracks)}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shadow-md"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Play All</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                deletePlaylist(selectedPlaylist.id);
                onSelectPlaylist(null);
              }}
              aria-label="Delete playlist"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full ios-glass-pill text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-red-600 dark:hover:text-red-400 active:scale-95 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>
        </div>

        {selectedPlaylist.tracks.length === 0 ? (
          <div className="rounded-[24px] ios-glass p-8 text-center space-y-3">
            <ListMusic className="w-8 h-8 text-zinc-400 mx-auto" />
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              This playlist has no tracks yet
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Use the options menu on any song to add it here.
            </p>
            <button
              type="button"
              onClick={onExploreClick}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 text-xs font-medium"
            >
              Browse Music
            </button>
          </div>
        ) : (
          <div className="rounded-[26px] ios-glass divide-y divide-black/[0.05] dark:divide-white/[0.06] p-1.5">
            {selectedPlaylist.tracks.map((track, idx) => (
              <TrackRow
                key={track.id}
                track={track}
                index={idx}
                contextList={selectedPlaylist.tracks}
                onArtistClick={onArtistClick}
                onAlbumClick={onAlbumClick}
                onRemoveFromPlaylist={() => removeTrackFromPlaylist(selectedPlaylist.id, track.id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-9 pb-10">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-bold text-zinc-950 dark:text-white">
          Your Library
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Followed artists, liked songs, custom playlists, and listening history
        </p>
      </div>

      {/* Followed Artists */}
      {followedArtists.length > 0 && (
        <section className="space-y-3.5">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#FF4D2E]" />
            <h2 className="font-display text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Following
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {followedArtists.map((artist) => (
              <button
                key={artist.id}
                type="button"
                onClick={() => onArtistClick(artist.name)}
                className="group p-3 rounded-[22px] ios-glass-card text-center hover:-translate-y-0.5 active:scale-[0.97] transition-all"
              >
                <Artwork
                  src={artist.artwork}
                  alt={artist.name}
                  className="w-20 h-20 mx-auto mb-2 transition-transform duration-300 group-hover:scale-[1.04]"
                  rounded="rounded-full"
                  thumb
                />
                <div className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-[#FF4D2E]">
                  {artist.name}
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                  {artist.monthlyListenersText
                    ? `${artist.monthlyListenersText} monthly`
                    : formatRegionLabel(artist.region)}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Create Playlist Form */}
      <section className="rounded-[28px] ios-glass p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-zinc-900 dark:text-zinc-100">
            Playlists
          </h2>
          <span className="text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
            {playlists.length} total
          </span>
        </div>

        <form onSubmit={handleCreatePlaylist} className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New playlist name (e.g. Late Night Indo)"
            className="flex-1 px-4 py-2 rounded-full text-sm bg-black/[0.045] dark:bg-white/[0.065] border border-black/[0.05] dark:border-white/[0.08] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#FF4D2E]"
          />
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Optional note"
            className="sm:w-56 px-4 py-2 rounded-full text-sm bg-black/[0.045] dark:bg-white/[0.065] border border-black/[0.05] dark:border-white/[0.08] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#FF4D2E]"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-full bg-[#FF4D2E] text-white text-sm font-medium hover:bg-[#E63E21] active:scale-95 transition-all shrink-0 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Create</span>
          </button>
        </form>

        {playlists.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {playlists.map((pl) => (
              <button
                key={pl.id}
                type="button"
                onClick={() => onSelectPlaylist(pl.id)}
                className="flex items-center justify-between gap-3 p-3.5 rounded-2xl ios-glass-card text-left hover:-translate-y-0.5 active:scale-[0.98] transition-all"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                    {pl.name}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono tabular-nums">
                    {pl.tracks.length} tracks
                  </div>
                </div>
                <ListMusic className="w-4 h-4 text-zinc-400 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Collaborative Real-Time Playlists */}
      <CollaborativePlaylistsSection
        initialJoinCode={initialJoinCode}
        onClearJoinCode={onClearJoinCode}
        onArtistClick={onArtistClick}
        onAlbumClick={onAlbumClick}
      />

      {/* Liked Songs */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-[#FF4D2E] fill-current" />
            <h2 className="font-display text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Liked Songs
            </h2>
          </div>
          {likedTracks.length > 0 && (
            <button
              type="button"
              onClick={() => playTrack(likedTracks[0], likedTracks)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 text-xs font-medium active:scale-95 transition-transform"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Play All</span>
            </button>
          )}
        </div>

        {likedTracks.length === 0 ? (
          <div className="rounded-[24px] ios-glass p-8 text-center space-y-2">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              No liked songs yet
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Click the heart icon on any track to save it to your collection.
            </p>
          </div>
        ) : (
          <div className="rounded-[26px] ios-glass divide-y divide-black/[0.05] dark:divide-white/[0.06] p-1.5">
            {likedTracks.map((track, idx) => (
              <TrackRow
                key={track.id}
                track={track}
                index={idx}
                contextList={likedTracks}
                onArtistClick={onArtistClick}
                onAlbumClick={onAlbumClick}
              />
            ))}
          </div>
        )}
      </section>

      {/* Recent Plays */}
      {recentTracks.length > 0 && (
        <section className="space-y-3 cv-section">
          <h2 className="font-display text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Listening History
          </h2>
          <div className="rounded-[26px] ios-glass divide-y divide-black/[0.05] dark:divide-white/[0.06] p-1.5">
            {recentTracks.slice(0, 15).map((track, idx) => (
              <TrackRow
                key={`hist-${track.id}`}
                track={track}
                index={idx}
                contextList={recentTracks}
                onArtistClick={onArtistClick}
                onAlbumClick={onAlbumClick}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function nameClean(v: string): string {
  return v.trim();
}
