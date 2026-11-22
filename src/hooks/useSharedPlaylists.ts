import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { SharedPlaylist, SharedPlaylistMember } from '../types/account';
import type { Track } from '../types/music';

function generateInviteCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

export function useSharedPlaylists() {
  const { user, profile, isDeveloper } = useAuth();
  const [sharedPlaylists, setSharedPlaylists] = useState<SharedPlaylist[]>([]);
  const [loading, setLoading] = useState(false);

  const buildCurrentMember = useCallback((): SharedPlaylistMember | null => {
    if (!user) return null;
    const displayName = (profile?.displayName || user.displayName || 'Listener')
      .trim()
      .slice(0, 60);
    const username = (profile?.username || user.email?.split('@')[0] || 'listener')
      .trim()
      .slice(0, 24);
    const greenBadge = Boolean(profile?.greenBadgeUnlocked && profile?.greenBadgeEnabled);
    return {
      uid: user.uid,
      displayName: displayName || 'Listener',
      username,
      avatarDataUrl: (profile?.avatarDataUrl || user.photoURL || '').slice(0, 120000),
      isDeveloper,
      greenBadge,
    };
  }, [user, profile, isDeveloper]);

  useEffect(() => {
    if (!user) {
      setSharedPlaylists([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'sharedPlaylists'),
      where('memberUids', 'array-contains', user.uid),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: SharedPlaylist[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<SharedPlaylist, 'id'>),
        }));
        setSharedPlaylists(list);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        try {
          handleFirestoreError(err, OperationType.LIST, 'sharedPlaylists');
        } catch {
          // Graceful listener stop on error
        }
      },
    );

    return () => unsub();
  }, [user]);

  const createSharedPlaylist = useCallback(
    async (name: string, description = '', initialTrack?: Track): Promise<SharedPlaylist> => {
      if (!user) throw new Error('Sign in with Google to create a collaborative playlist.');
      const member = buildCurrentMember();
      if (!member) throw new Error('Account not ready.');

      const cleanName = name.trim().slice(0, 60);
      if (!cleanName) throw new Error('Playlist name is required.');

      const code = generateInviteCode(8);
      const docPath = `sharedPlaylists/${code}`;
      const payload = {
        id: code,
        name: cleanName,
        description: description.trim().slice(0, 180),
        inviteCode: code,
        ownerUid: user.uid,
        ownerName: member.displayName,
        memberUids: [user.uid],
        members: [member],
        tracks: initialTrack ? [initialTrack] : [],
        updatedByUid: user.uid,
        updatedByName: member.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      try {
        await setDoc(doc(db, 'sharedPlaylists', code), payload);
        return {
          ...payload,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, docPath);
      }
    },
    [user, buildCurrentMember],
  );

  const joinSharedPlaylistByCode = useCallback(
    async (rawCode: string): Promise<SharedPlaylist> => {
      if (!user) throw new Error('Sign in with Google to join a collaborative playlist.');
      const member = buildCurrentMember();
      if (!member) throw new Error('Account not ready.');

      const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      if (code.length < 6 || code.length > 32) {
        throw new Error('Invalid invite code format.');
      }

      const docPath = `sharedPlaylists/${code}`;
      const ref = doc(db, 'sharedPlaylists', code);
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          throw new Error('Collaborative playlist not found. Check the invite code.');
        }
        const data = snap.data() as SharedPlaylist;
        if (data.memberUids.includes(user.uid)) {
          return { ...data, id: snap.id };
        }
        if (data.memberUids.length >= 25) {
          throw new Error('This playlist has reached the 25 collaborator limit.');
        }

        const nextMemberUids = [...data.memberUids, user.uid];
        const nextMembers = [...(data.members || []), member];

        await updateDoc(ref, {
          memberUids: nextMemberUids,
          members: nextMembers,
          updatedByUid: user.uid,
          updatedByName: member.displayName,
          updatedAt: serverTimestamp(),
        });

        return {
          ...data,
          id: snap.id,
          memberUids: nextMemberUids,
          members: nextMembers,
        };
      } catch (err) {
        if (
          err instanceof Error &&
          (err.message.includes('not found') || err.message.includes('limit'))
        ) {
          throw err;
        }
        handleFirestoreError(err, OperationType.UPDATE, docPath);
      }
    },
    [user, buildCurrentMember],
  );

  const addTrackToSharedPlaylist = useCallback(
    async (playlistId: string, track: Track) => {
      if (!user) throw new Error('Sign in with Google first.');
      const member = buildCurrentMember();
      if (!member) return;

      const target = sharedPlaylists.find((p) => p.id === playlistId);
      if (!target) throw new Error('Shared playlist unavailable.');
      if (target.tracks.some((t) => t.id === track.id)) {
        return 'exists' as const;
      }
      if (target.tracks.length >= 100) {
        throw new Error('Shared playlist is full (max 100 tracks).');
      }

      const docPath = `sharedPlaylists/${playlistId}`;
      try {
        await updateDoc(doc(db, 'sharedPlaylists', playlistId), {
          tracks: [...target.tracks, track],
          updatedByUid: user.uid,
          updatedByName: member.displayName,
          updatedAt: serverTimestamp(),
        });
        return 'added' as const;
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, docPath);
      }
    },
    [user, buildCurrentMember, sharedPlaylists],
  );

  const removeTrackFromSharedPlaylist = useCallback(
    async (playlistId: string, trackId: string) => {
      if (!user) return;
      const member = buildCurrentMember();
      if (!member) return;

      const target = sharedPlaylists.find((p) => p.id === playlistId);
      if (!target) return;

      const nextTracks = target.tracks.filter((t) => t.id !== trackId);
      const docPath = `sharedPlaylists/${playlistId}`;
      try {
        await updateDoc(doc(db, 'sharedPlaylists', playlistId), {
          tracks: nextTracks,
          updatedByUid: user.uid,
          updatedByName: member.displayName,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, docPath);
      }
    },
    [user, buildCurrentMember, sharedPlaylists],
  );

  const leaveSharedPlaylist = useCallback(
    async (playlistId: string) => {
      if (!user) return;
      const member = buildCurrentMember();
      if (!member) return;

      const target = sharedPlaylists.find((p) => p.id === playlistId);
      if (!target || target.ownerUid === user.uid) return;

      const docPath = `sharedPlaylists/${playlistId}`;
      try {
        await updateDoc(doc(db, 'sharedPlaylists', playlistId), {
          memberUids: target.memberUids.filter((id) => id !== user.uid),
          members: target.members.filter((m) => m.uid !== user.uid),
          updatedByUid: user.uid,
          updatedByName: member.displayName,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, docPath);
      }
    },
    [user, buildCurrentMember, sharedPlaylists],
  );

  const deleteSharedPlaylist = useCallback(
    async (playlistId: string) => {
      if (!user) return;
      const docPath = `sharedPlaylists/${playlistId}`;
      try {
        await deleteDoc(doc(db, 'sharedPlaylists', playlistId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, docPath);
      }
    },
    [user],
  );

  return {
    sharedPlaylists,
    loading,
    createSharedPlaylist,
    joinSharedPlaylistByCode,
    addTrackToSharedPlaylist,
    removeTrackFromSharedPlaylist,
    leaveSharedPlaylist,
    deleteSharedPlaylist,
  };
}
