import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  PROFILE_CONSTRAINTS,
  type ListenRoom,
  type ListenRoomMember,
  type ListenRoomMessage,
} from '../types/account';
import type { Track } from '../types/music';

function generateRoomCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

function sanitizeRoomTrack(track: Track | null | undefined): Track | null {
  if (!track) return null;
  const clean: Track = {
    id: String(track.id),
    title: String(track.title || 'Untitled').slice(0, 180),
    artist: String(track.artist || 'Unknown Artist').slice(0, 160),
    album: String(track.album || 'Single').slice(0, 160),
    durationSec: Number.isFinite(track.durationSec) ? Math.max(0, Math.round(track.durationSec)) : 0,
    artwork: String(track.artwork || ''),
    region: track.region === 'ID' || track.region === 'ASIA' ? track.region : 'GLOBAL',
    genre: String(track.genre || 'Music'),
    source: track.source || 'itunes',
  };
  if (track.previewUrl) clean.previewUrl = track.previewUrl;
  if (typeof track.scTrackId === 'number' && Number.isFinite(track.scTrackId)) {
    clean.scTrackId = track.scTrackId;
  }
  if (track.releaseYear) clean.releaseYear = track.releaseYear;
  if (typeof track.explicit === 'boolean') clean.explicit = track.explicit;
  return clean;
}

export function useListenRoom() {
  const { user, profile, isDeveloper, showGreenCheckmark, showGoldFrame } = useAuth();
  const [myRooms, setMyRooms] = useState<ListenRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<ListenRoom | null>(null);
  const [messages, setMessages] = useState<ListenRoomMessage[]>([]);
  const [roomClosedNotice, setRoomClosedNotice] = useState<string | null>(null);

  const buildCurrentMember = useCallback((): ListenRoomMember | null => {
    if (!user) return null;
    const displayName = (profile?.displayName || user.displayName || 'Listener')
      .trim()
      .slice(0, PROFILE_CONSTRAINTS.displayNameMax);
    const username = (profile?.username || user.email?.split('@')[0] || 'listener')
      .trim()
      .slice(0, PROFILE_CONSTRAINTS.usernameMax);
    return {
      uid: user.uid,
      displayName: displayName || 'Listener',
      username,
      avatarDataUrl: (profile?.avatarDataUrl || user.photoURL || '').slice(
        0,
        PROFILE_CONSTRAINTS.avatarMax,
      ),
      isDeveloper,
      greenBadge: showGreenCheckmark,
      goldFrame: showGoldFrame,
    };
  }, [user, profile, isDeveloper, showGreenCheckmark, showGoldFrame]);

  // Subscribe to rooms the user belongs to
  useEffect(() => {
    if (!user) {
      setMyRooms([]);
      setRoomsLoading(false);
      return;
    }

    setRoomsLoading(true);
    const q = query(
      collection(db, 'listenRooms'),
      where('memberUids', 'array-contains', user.uid),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ListenRoom[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ListenRoom, 'id'>),
        }));
        setMyRooms(list);
        setRoomsLoading(false);
      },
      (err) => {
        setRoomsLoading(false);
        try {
          handleFirestoreError(err, OperationType.LIST, 'listenRooms');
        } catch {
          // Graceful listener stop
        }
      },
    );

    return () => unsub();
  }, [user]);

  // Subscribe to the active room document + live chat messages
  useEffect(() => {
    if (!user || !activeRoomId) {
      setActiveRoom(null);
      setMessages([]);
      return;
    }

    const roomPath = `listenRooms/${activeRoomId}`;
    const unsubRoom = onSnapshot(
      doc(db, 'listenRooms', activeRoomId),
      (snap) => {
        if (!snap.exists()) {
          setActiveRoom(null);
          setActiveRoomId(null);
          setRoomClosedNotice('Room telah ditutup oleh host.');
          return;
        }
        const data = { id: snap.id, ...(snap.data() as Omit<ListenRoom, 'id'>) };
        if (!data.memberUids.includes(user.uid)) {
          setActiveRoom(null);
          setActiveRoomId(null);
          return;
        }
        setActiveRoom(data);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.GET, roomPath);
        } catch {
          // Graceful listener stop
        }
      },
    );

    const msgPath = `listenRooms/${activeRoomId}/messages`;
    const msgQuery = query(
      collection(db, 'listenRooms', activeRoomId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(80),
    );
    const unsubMsgs = onSnapshot(
      msgQuery,
      (snap) => {
        const list: ListenRoomMessage[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ListenRoomMessage, 'id'>),
        }));
        setMessages(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, msgPath);
        } catch {
          // Graceful listener stop
        }
      },
    );

    return () => {
      unsubRoom();
      unsubMsgs();
    };
  }, [user, activeRoomId]);

  const createRoom = useCallback(
    async (name: string, maxMembers: number, initialTrack?: Track | null): Promise<ListenRoom> => {
      if (!user) throw new Error('Login dengan Google terlebih dahulu untuk membuat room.');
      const member = buildCurrentMember();
      if (!member) throw new Error('Profil akun belum siap.');

      const cleanName = name.trim().slice(0, PROFILE_CONSTRAINTS.listenRoomNameMax);
      if (!cleanName) throw new Error('Nama room wajib diisi.');

      const capacity = Math.max(
        PROFILE_CONSTRAINTS.listenRoomMinCapacity,
        Math.min(PROFILE_CONSTRAINTS.listenRoomMaxCapacity, Math.round(maxMembers) || 4),
      );

      const code = generateRoomCode(8);
      const docPath = `listenRooms/${code}`;
      const cleanTrack = sanitizeRoomTrack(initialTrack);
      const nowMs = Date.now();

      const payload = {
        id: code,
        code,
        name: cleanName,
        hostUid: user.uid,
        hostName: member.displayName,
        maxMembers: capacity,
        memberUids: [user.uid],
        members: [member],
        currentTrack: cleanTrack,
        isPlaying: false,
        positionSec: 0,
        syncUpdatedAtMs: nowMs,
        updatedByUid: user.uid,
        updatedByName: member.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      try {
        await setDoc(doc(db, 'listenRooms', code), payload);
        setRoomClosedNotice(null);
        setActiveRoomId(code);
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

  const joinRoom = useCallback(
    async (rawCode: string): Promise<ListenRoom> => {
      if (!user) throw new Error('Login dengan Google terlebih dahulu untuk gabung ke room.');
      const member = buildCurrentMember();
      if (!member) throw new Error('Profil akun belum siap.');

      const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      if (code.length < 6 || code.length > 24) {
        throw new Error('Kode room tidak valid (6–24 karakter).');
      }

      const docPath = `listenRooms/${code}`;
      const ref = doc(db, 'listenRooms', code);
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          throw new Error('Room tidak ditemukan. Periksa kembali kode atau link undangan.');
        }
        const data = { id: snap.id, ...(snap.data() as Omit<ListenRoom, 'id'>) };
        if (data.memberUids.includes(user.uid)) {
          setRoomClosedNotice(null);
          setActiveRoomId(snap.id);
          return data;
        }
        if (data.memberUids.length >= data.maxMembers) {
          throw new Error(
            `Room sudah penuh (${data.memberUids.length}/${data.maxMembers} pendengar).`,
          );
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

        setRoomClosedNotice(null);
        setActiveRoomId(snap.id);
        return {
          ...data,
          memberUids: nextMemberUids,
          members: nextMembers,
        };
      } catch (err) {
        if (
          err instanceof Error &&
          (err.message.includes('penuh') || err.message.includes('tidak ditemukan'))
        ) {
          throw err;
        }
        handleFirestoreError(err, OperationType.UPDATE, docPath);
      }
    },
    [user, buildCurrentMember],
  );

  const openExistingRoom = useCallback((roomId: string) => {
    setRoomClosedNotice(null);
    setActiveRoomId(roomId);
  }, []);

  const exitRoomView = useCallback(() => {
    setActiveRoomId(null);
  }, []);

  const closeRoom = useCallback(
    async (roomId: string) => {
      if (!user) return;
      const docPath = `listenRooms/${roomId}`;
      try {
        await deleteDoc(doc(db, 'listenRooms', roomId));
        if (activeRoomId === roomId) {
          setActiveRoomId(null);
          setActiveRoom(null);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, docPath);
      }
    },
    [user, activeRoomId],
  );

  const leaveRoom = useCallback(
    async (roomId: string) => {
      if (!user) return;
      const member = buildCurrentMember();
      if (!member) return;

      const target =
        activeRoom?.id === roomId ? activeRoom : myRooms.find((r) => r.id === roomId);
      if (!target) return;

      if (target.hostUid === user.uid) {
        await closeRoom(roomId);
        return;
      }

      const docPath = `listenRooms/${roomId}`;
      try {
        await updateDoc(doc(db, 'listenRooms', roomId), {
          memberUids: target.memberUids.filter((id) => id !== user.uid),
          members: target.members.filter((m) => m.uid !== user.uid),
          updatedByUid: user.uid,
          updatedByName: member.displayName,
          updatedAt: serverTimestamp(),
        });
        if (activeRoomId === roomId) {
          setActiveRoomId(null);
          setActiveRoom(null);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, docPath);
      }
    },
    [user, buildCurrentMember, activeRoom, myRooms, activeRoomId, closeRoom],
  );

  const selectRoomTrack = useCallback(
    async (track: Track, positionSec = 0, isPlaying = true) => {
      if (!user || !activeRoom) return;
      const member = buildCurrentMember();
      if (!member) return;

      const cleanTrack = sanitizeRoomTrack(track);
      const docPath = `listenRooms/${activeRoom.id}`;
      try {
        await updateDoc(doc(db, 'listenRooms', activeRoom.id), {
          currentTrack: cleanTrack,
          isPlaying,
          positionSec: Math.max(0, Math.min(36000, positionSec)),
          syncUpdatedAtMs: Date.now(),
          updatedByUid: user.uid,
          updatedByName: member.displayName,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, docPath);
      }
    },
    [user, activeRoom, buildCurrentMember],
  );

  const syncPlaybackState = useCallback(
    async (isPlaying: boolean, positionSec: number) => {
      if (!user || !activeRoom || !activeRoom.currentTrack) return;
      const member = buildCurrentMember();
      if (!member) return;

      const docPath = `listenRooms/${activeRoom.id}`;
      try {
        await updateDoc(doc(db, 'listenRooms', activeRoom.id), {
          isPlaying,
          positionSec: Math.max(0, Math.min(36000, positionSec)),
          syncUpdatedAtMs: Date.now(),
          updatedByUid: user.uid,
          updatedByName: member.displayName,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, docPath);
      }
    },
    [user, activeRoom, buildCurrentMember],
  );

  const sendMessage = useCallback(
    async (rawText: string) => {
      if (!user || !activeRoom) return;
      const member = buildCurrentMember();
      if (!member) return;

      const text = rawText.trim().slice(0, PROFILE_CONSTRAINTS.listenRoomMessageMax);
      if (!text) return;

      const msgPath = `listenRooms/${activeRoom.id}/messages`;
      try {
        await addDoc(collection(db, 'listenRooms', activeRoom.id, 'messages'), {
          roomId: activeRoom.id,
          senderUid: user.uid,
          senderName: member.displayName,
          senderUsername: member.username,
          senderAvatar: member.avatarDataUrl,
          isDeveloper: member.isDeveloper,
          greenBadge: member.greenBadge,
          goldFrame: member.goldFrame,
          text,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, msgPath);
      }
    },
    [user, activeRoom, buildCurrentMember],
  );

  return {
    myRooms,
    roomsLoading,
    activeRoom,
    messages,
    roomClosedNotice,
    clearRoomClosedNotice: () => setRoomClosedNotice(null),
    createRoom,
    joinRoom,
    openExistingRoom,
    exitRoomView,
    leaveRoom,
    closeRoom,
    selectRoomTrack,
    syncPlaybackState,
    sendMessage,
  };
}
