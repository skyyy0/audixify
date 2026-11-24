import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  isDeveloperUser,
  OperationType,
} from '../lib/firebase';
import {
  PROFILE_CONSTRAINTS,
  STREAK_RECOVERY_LIMITS,
  type AppPreferences,
  type BadgeId,
  type UserProfile,
} from '../types/account';
import type { ArtistSummary, Track, UserPlaylist } from '../types/music';

const DEFAULT_PREFERENCES: AppPreferences = {
  perfMode: 'auto',
  audioQuality: 'auto',
  lyricsSize: 'standard',
  defaultRegion: 'all',
  autoplay: true,
};

function getLocalDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getYesterdayDateKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getLocalDateKey(d);
}

function computeBadgesForStreak(existingBadges: BadgeId[], nextStreak: number): BadgeId[] {
  const set = new Set<BadgeId>(existingBadges);
  if (nextStreak >= 3) set.add('streak_3');
  if (nextStreak >= 7) set.add('streak_7');
  if (nextStreak >= 30) {
    set.add('streak_30_crown');
    set.add('streak_30_pioneer');
  }
  if (nextStreak >= 60) {
    set.add('streak_60_aurora');
    set.add('streak_60_virtuoso');
    set.add('streak_60_immortal');
  }
  return Array.from(set);
}

function readStoredPrefs(): AppPreferences {
  try {
    const raw = localStorage.getItem('audixify_prefs_v1');
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      perfMode:
        parsed.perfMode === 'lite' || parsed.perfMode === 'full' ? parsed.perfMode : 'auto',
      audioQuality:
        parsed.audioQuality === 'high' || parsed.audioQuality === 'saver'
          ? parsed.audioQuality
          : 'auto',
      lyricsSize:
        parsed.lyricsSize === 'compact' || parsed.lyricsSize === 'large'
          ? parsed.lyricsSize
          : 'standard',
      defaultRegion:
        parsed.defaultRegion === 'id' ||
        parsed.defaultRegion === 'asia' ||
        parsed.defaultRegion === 'global'
          ? parsed.defaultRegion
          : 'all',
      autoplay: typeof parsed.autoplay === 'boolean' ? parsed.autoplay : true,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function buildInitialUsername(user: User): string {
  const emailLocal = (user.email || '').split('@')[0] || '';
  const source = emailLocal || user.displayName || 'audixify';
  const cleaned = source
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, PROFILE_CONSTRAINTS.usernameMax);
  if (PROFILE_CONSTRAINTS.usernameRegex.test(cleaned)) {
    return cleaned;
  }
  const fallback = `sky_${user.uid.slice(0, 6).toLowerCase()}`.replace(/[^a-z0-9_.]/g, 'x');
  return fallback.slice(0, PROFILE_CONSTRAINTS.usernameMax);
}

function applyPerfAttribute(perfMode: AppPreferences['perfMode']) {
  const root = document.documentElement;
  try {
    localStorage.setItem('audixify_perf_mode', perfMode);
  } catch {}
  if (perfMode === 'lite') {
    root.setAttribute('data-perf', 'lite');
  } else if (perfMode === 'full') {
    root.setAttribute('data-perf', 'full');
  } else {
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarsePointer =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(pointer: coarse)').matches;
    if ((typeof mem === 'number' && mem <= 3) || reduced) {
      root.setAttribute('data-perf', 'lite');
    } else if (coarsePointer || (typeof mem === 'number' && mem <= 8)) {
      root.setAttribute('data-perf', 'smooth');
    } else {
      root.removeAttribute('data-perf');
    }
  }
}

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  profile: UserProfile | null;
  profileLoading: boolean;
  isDeveloper: boolean;
  showGreenCheckmark: boolean;
  showGoldFrame: boolean;
  streakBannerMessage: string | null;
  dismissStreakBanner: () => void;
  preferences: AppPreferences;
  signingIn: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<boolean>;
  signOutUser: () => Promise<void>;
  updatePreferences: (patch: Partial<AppPreferences>) => Promise<void>;
  updateProfileFields: (patch: {
    displayName?: string;
    username?: string;
    bio?: string;
    avatarDataUrl?: string;
  }) => Promise<void>;
  toggleGreenCheckmark: (enabled: boolean) => Promise<void>;
  toggleGoldFrame: (enabled: boolean) => Promise<void>;
  recoverStreak: () => Promise<number>;
  syncLibraryToCloud: (data: {
    likedTracks: Track[];
    followedArtists: ArtistSummary[];
    playlists: UserPlaylist[];
  }) => Promise<void>;
  fetchLibraryFromCloud: () => Promise<{
    likedTracks: Track[];
    followedArtists: ArtistSummary[];
    playlists: UserPlaylist[];
  } | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [preferences, setPreferences] = useState<AppPreferences>(() => readStoredPrefs());
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [streakBannerMessage, setStreakBannerMessage] = useState<string | null>(null);
  const checkedInDateRef = useRef<string>('');

  const dismissStreakBanner = useCallback(() => setStreakBannerMessage(null), []);

  useEffect(() => {
    applyPerfAttribute(preferences.perfMode);
    try {
      localStorage.setItem('audixify_prefs_v1', JSON.stringify(preferences));
    } catch {}
  }, [preferences]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setProfile(null);
        setProfileLoading(false);
        checkedInDateRef.current = '';
      }
    });
    return () => unsub();
  }, []);

  // Sync or bootstrap Firestore user profile + automatic Daily Streak check-in
  useEffect(() => {
    if (!authReady || !user) return;

    const profilePath = `users/${user.uid}`;
    const docRef = doc(db, 'users', user.uid);
    let active = true;
    setProfileLoading(true);

    const ensureAndSubscribe = async () => {
      try {
        const snap = await getDoc(docRef);
        const dev = isDeveloperUser(user);
        const today = getLocalDateKey();
        const yesterday = getYesterdayDateKey();

        if (!snap.exists()) {
          const currentTheme =
            localStorage.getItem('audixify_theme') === 'light' ? 'light' : 'dark';
          const initialName = (user.displayName || user.email?.split('@')[0] || 'Listener')
            .trim()
            .slice(0, PROFILE_CONSTRAINTS.displayNameMax);
          const initialAvatar =
            user.photoURL && user.photoURL.length <= PROFILE_CONSTRAINTS.avatarMax
              ? user.photoURL
              : '';

          await setDoc(docRef, {
            uid: user.uid,
            username: buildInitialUsername(user),
            displayName: initialName || 'Listener',
            bio: dev ? 'Creator & Developer of Audixify' : '',
            avatarDataUrl: initialAvatar,
            isDeveloper: dev,
            perfMode: preferences.perfMode,
            audioQuality: preferences.audioQuality,
            lyricsSize: preferences.lyricsSize,
            defaultRegion: preferences.defaultRegion,
            autoplay: preferences.autoplay,
            theme: currentTheme,
            streakCount: 1,
            longestStreak: 1,
            lastCheckInDate: today,
            badges: [],
            greenBadgeUnlocked: false,
            greenBadgeEnabled: false,
            goldFrameUnlocked: false,
            goldFrameEnabled: false,
            recoverableStreak: 0,
            recoveryUsedTier30: 0,
            recoveryUsedTier7: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          checkedInDateRef.current = today;
        } else {
          const data = snap.data() as Partial<UserProfile>;
          if (Boolean(data.isDeveloper) !== dev) {
            await updateDoc(docRef, {
              isDeveloper: dev,
              updatedAt: serverTimestamp(),
            });
          }

          const lastDate = typeof data.lastCheckInDate === 'string' ? data.lastCheckInDate : '';
          if (lastDate !== today && checkedInDateRef.current !== today) {
            checkedInDateRef.current = today;
            const prevStreak = typeof data.streakCount === 'number' ? data.streakCount : 0;
            const prevLongest = typeof data.longestStreak === 'number' ? data.longestStreak : 0;
            const prevBadges = Array.isArray(data.badges) ? (data.badges as BadgeId[]) : [];
            const prevGreenUnlocked = Boolean(data.greenBadgeUnlocked);
            const prevGreenEnabled = Boolean(data.greenBadgeEnabled);
            const prevGoldUnlocked = Boolean(data.goldFrameUnlocked);
            const prevGoldEnabled = Boolean(data.goldFrameEnabled);
            const prevRecoverable = typeof data.recoverableStreak === 'number' ? data.recoverableStreak : 0;

            const isConsecutive = lastDate === yesterday;
            const nextStreak = isConsecutive ? prevStreak + 1 : 1;
            const brokenRecoverable = !isConsecutive && prevStreak >= 7 ? prevStreak : prevRecoverable;
            const nextRecoverable =
              nextStreak >= brokenRecoverable && brokenRecoverable > 0 ? 0 : brokenRecoverable;
            const nextLongest = Math.max(prevLongest, nextStreak);
            const nextBadges = computeBadgesForStreak(prevBadges, nextStreak);
            const newlyUnlocked30 = nextStreak >= 30 && !prevGreenUnlocked;
            const newlyUnlocked60 = nextStreak >= 60 && !prevGoldUnlocked;
            const nextGreenUnlocked = prevGreenUnlocked || nextStreak >= 30;
            const nextGreenEnabled = newlyUnlocked30 ? true : prevGreenEnabled;
            const nextGoldUnlocked = prevGoldUnlocked || nextStreak >= 60;
            const nextGoldEnabled = newlyUnlocked60 ? true : prevGoldEnabled;

            await updateDoc(docRef, {
              streakCount: nextStreak,
              longestStreak: nextLongest,
              lastCheckInDate: today,
              badges: nextBadges,
              greenBadgeUnlocked: nextGreenUnlocked,
              greenBadgeEnabled: nextGreenEnabled,
              goldFrameUnlocked: nextGoldUnlocked,
              goldFrameEnabled: nextGoldEnabled,
              recoverableStreak: nextRecoverable,
              updatedAt: serverTimestamp(),
            });

            if (active) {
              if (!isConsecutive && prevStreak >= 7) {
                setStreakBannerMessage(
                  `Streak ${prevStreak} harimu sempat terputus — buka Profile untuk memulihkannya!`,
                );
              } else if (newlyUnlocked60) {
                setStreakBannerMessage(
                  '60-Day Streak! Unlocked 3 Immortal Badges + Gold Sovereign Frame!',
                );
              } else if (newlyUnlocked30) {
                setStreakBannerMessage(
                  '30-Day Streak! Unlocked 2 Special Badges + Green Verified Checkmark!',
                );
              } else if (nextStreak === 7) {
                setStreakBannerMessage('7-Day Streak! Unlocked 7-Day Devotee Special Badge!');
              } else if (nextStreak === 3) {
                setStreakBannerMessage('3-Day Streak! Unlocked 3-Day Rhythm Badge!');
              } else if (nextStreak > 1) {
                setStreakBannerMessage(`Daily Streak: ${nextStreak} hari berturut-turut!`);
              }
            }
          }
        }
      } catch (err) {
        if (active) {
          try {
            handleFirestoreError(err, OperationType.WRITE, profilePath);
          } catch {
            setAuthError('Unable to load cloud profile. Local settings remain active.');
          }
        }
      }

      if (!active) return;

      return onSnapshot(
        docRef,
        (snapshot) => {
          if (!active) return;
          if (snapshot.exists()) {
            const d = snapshot.data() as Record<string, unknown>;
            const nextProfile: UserProfile = {
              uid: String(d.uid || user.uid),
              username: String(d.username || buildInitialUsername(user)),
              displayName: String(d.displayName || user.displayName || 'Listener'),
              bio: String(d.bio || ''),
              avatarDataUrl: String(d.avatarDataUrl || user.photoURL || ''),
              isDeveloper: Boolean(d.isDeveloper) || isDeveloperUser(user),
              perfMode:
                d.perfMode === 'lite' || d.perfMode === 'full' ? d.perfMode : 'auto',
              audioQuality:
                d.audioQuality === 'high' || d.audioQuality === 'saver'
                  ? d.audioQuality
                  : 'auto',
              lyricsSize:
                d.lyricsSize === 'compact' || d.lyricsSize === 'large'
                  ? d.lyricsSize
                  : 'standard',
              defaultRegion:
                d.defaultRegion === 'id' ||
                d.defaultRegion === 'asia' ||
                d.defaultRegion === 'global'
                  ? d.defaultRegion
                  : 'all',
              autoplay: typeof d.autoplay === 'boolean' ? d.autoplay : true,
              theme: d.theme === 'light' ? 'light' : 'dark',
              streakCount: typeof d.streakCount === 'number' ? d.streakCount : 1,
              longestStreak: typeof d.longestStreak === 'number' ? d.longestStreak : 1,
              lastCheckInDate: typeof d.lastCheckInDate === 'string' ? d.lastCheckInDate : '',
              badges: Array.isArray(d.badges) ? (d.badges as BadgeId[]) : [],
              greenBadgeUnlocked: Boolean(d.greenBadgeUnlocked),
              greenBadgeEnabled: Boolean(d.greenBadgeEnabled),
              goldFrameUnlocked: Boolean(d.goldFrameUnlocked),
              goldFrameEnabled: Boolean(d.goldFrameEnabled),
              recoverableStreak: typeof d.recoverableStreak === 'number' ? d.recoverableStreak : 0,
              recoveryUsedTier30: typeof d.recoveryUsedTier30 === 'number' ? d.recoveryUsedTier30 : 0,
              recoveryUsedTier7: typeof d.recoveryUsedTier7 === 'number' ? d.recoveryUsedTier7 : 0,
            };
            setProfile(nextProfile);
            setPreferences({
              perfMode: nextProfile.perfMode,
              audioQuality: nextProfile.audioQuality,
              lyricsSize: nextProfile.lyricsSize,
              defaultRegion: nextProfile.defaultRegion,
              autoplay: nextProfile.autoplay,
            });
          }
          setProfileLoading(false);
        },
        (error) => {
          if (!active) return;
          setProfileLoading(false);
          try {
            handleFirestoreError(error, OperationType.GET, profilePath);
          } catch {
            setAuthError('Cloud profile sync paused.');
          }
        },
      );
    };

    let unsubSnap: (() => void) | undefined;
    void ensureAndSubscribe().then((u) => {
      if (typeof u === 'function') {
        if (active) unsubSnap = u;
        else u();
      }
    });

    return () => {
      active = false;
      if (unsubSnap) unsubSnap();
    };
  }, [authReady, user]);

  const signInWithGoogle = useCallback(async (): Promise<boolean> => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      return true;
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError(null);
      } else if (code === 'auth/unauthorized-domain') {
        setAuthError(
          'This domain is not yet authorized in Firebase Auth Console (add audixify.skydev.my.id).',
        );
      } else {
        setAuthError(err instanceof Error ? err.message : 'Google sign-in failed.');
      }
      return false;
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
    setProfile(null);
    setAuthError(null);
  }, []);

  const updatePreferences = useCallback(
    async (patch: Partial<AppPreferences>) => {
      const next = { ...preferences, ...patch };
      setPreferences(next);
      if (!user) return;
      const profilePath = `users/${user.uid}`;
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          perfMode: next.perfMode,
          audioQuality: next.audioQuality,
          lyricsSize: next.lyricsSize,
          defaultRegion: next.defaultRegion,
          autoplay: next.autoplay,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, profilePath);
      }
    },
    [preferences, user],
  );

  const updateProfileFields = useCallback(
    async (patch: {
      displayName?: string;
      username?: string;
      bio?: string;
      avatarDataUrl?: string;
    }) => {
      if (!user) throw new Error('Sign in with Google to update your profile.');

      const nextDisplayName = (
        patch.displayName !== undefined ? patch.displayName : profile?.displayName || 'Listener'
      )
        .trim()
        .slice(0, PROFILE_CONSTRAINTS.displayNameMax);
      if (!nextDisplayName) {
        throw new Error('Display name cannot be empty.');
      }

      const rawUsername = (
        patch.username !== undefined
          ? patch.username
          : profile?.username || buildInitialUsername(user)
      )
        .trim()
        .toLowerCase();
      if (!PROFILE_CONSTRAINTS.usernameRegex.test(rawUsername)) {
        throw new Error(
          'Username must be 3–24 characters using lowercase letters, numbers, underscores, or dots.',
        );
      }

      const nextBio = (patch.bio !== undefined ? patch.bio : profile?.bio || '')
        .trim()
        .slice(0, PROFILE_CONSTRAINTS.bioMax);

      const nextAvatar =
        patch.avatarDataUrl !== undefined
          ? patch.avatarDataUrl
          : profile?.avatarDataUrl || '';
      if (nextAvatar.length > PROFILE_CONSTRAINTS.avatarMax) {
        throw new Error('Avatar photo exceeds size limit.');
      }

      const profilePath = `users/${user.uid}`;
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          displayName: nextDisplayName,
          username: rawUsername,
          bio: nextBio,
          avatarDataUrl: nextAvatar,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, profilePath);
      }
    },
    [user, profile],
  );

  const toggleGreenCheckmark = useCallback(
    async (enabled: boolean) => {
      if (!user) throw new Error('Sign in with Google first.');
      if (!profile?.greenBadgeUnlocked) {
        throw new Error('Reach a 30-day consecutive login streak to unlock the green checkmark.');
      }
      const profilePath = `users/${user.uid}`;
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          greenBadgeEnabled: enabled,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, profilePath);
      }
    },
    [user, profile?.greenBadgeUnlocked],
  );

  const toggleGoldFrame = useCallback(
    async (enabled: boolean) => {
      if (!user) throw new Error('Sign in with Google first.');
      if (!profile?.goldFrameUnlocked) {
        throw new Error('Reach a 60-day consecutive login streak to unlock the Gold Sovereign Frame.');
      }
      const profilePath = `users/${user.uid}`;
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          goldFrameEnabled: enabled,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, profilePath);
      }
    },
    [user, profile?.goldFrameUnlocked],
  );

  const recoverStreak = useCallback(async (): Promise<number> => {
    if (!user || !profile) throw new Error('Sign in with Google first.');
    const recoverable = profile.recoverableStreak || 0;
    if (recoverable < 7) {
      throw new Error('Tidak ada streak yang memenuhi syarat pemulihan (minimal 7+ hari).');
    }

    const isTier30 = recoverable >= 30;
    const used30 = profile.recoveryUsedTier30 || 0;
    const used7 = profile.recoveryUsedTier7 || 0;

    if (isTier30 && used30 >= STREAK_RECOVERY_LIMITS.tier30Max) {
      throw new Error('Kuota pemulihan streak 30+ hari (3x) sudah habis.');
    }
    if (!isTier30 && used7 >= STREAK_RECOVERY_LIMITS.tier7Max) {
      throw new Error('Kuota pemulihan streak 7+ hari (1x) sudah habis.');
    }

    const restoredStreak = recoverable + 1;
    const nextLongest = Math.max(profile.longestStreak || 0, restoredStreak);
    const nextBadges = computeBadgesForStreak(profile.badges || [], restoredStreak);
    const nextGreenUnlocked = profile.greenBadgeUnlocked || restoredStreak >= 30;
    const nextGreenEnabled =
      restoredStreak >= 30 && !profile.greenBadgeUnlocked ? true : profile.greenBadgeEnabled;
    const nextGoldUnlocked = profile.goldFrameUnlocked || restoredStreak >= 60;
    const nextGoldEnabled =
      restoredStreak >= 60 && !profile.goldFrameUnlocked ? true : profile.goldFrameEnabled;

    const profilePath = `users/${user.uid}`;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        streakCount: restoredStreak,
        longestStreak: nextLongest,
        badges: nextBadges,
        greenBadgeUnlocked: nextGreenUnlocked,
        greenBadgeEnabled: nextGreenEnabled,
        goldFrameUnlocked: nextGoldUnlocked,
        goldFrameEnabled: nextGoldEnabled,
        recoverableStreak: 0,
        recoveryUsedTier30: isTier30 ? used30 + 1 : used30,
        recoveryUsedTier7: !isTier30 ? used7 + 1 : used7,
        updatedAt: serverTimestamp(),
      });
      setStreakBannerMessage(`Streak berhasil dipulihkan menjadi ${restoredStreak} hari!`);
      return restoredStreak;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, profilePath);
    }
  }, [user, profile]);

  const syncLibraryToCloud = useCallback(
    async (data: {
      likedTracks: Track[];
      followedArtists: ArtistSummary[];
      playlists: UserPlaylist[];
    }) => {
      if (!user) throw new Error('Sign in with Google to sync your library.');
      const path = `userLibraries/${user.uid}`;
      const payload = {
        uid: user.uid,
        likedTracks: data.likedTracks.slice(0, 100),
        followedArtists: data.followedArtists.slice(0, 100),
        playlists: data.playlists.slice(0, 40).map((pl) => ({
          ...pl,
          tracks: pl.tracks.slice(0, 100),
        })),
        updatedAt: serverTimestamp(),
      };
      try {
        await setDoc(doc(db, 'userLibraries', user.uid), payload);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    },
    [user],
  );

  const fetchLibraryFromCloud = useCallback(async () => {
    if (!user) throw new Error('Sign in with Google to restore your library.');
    const path = `userLibraries/${user.uid}`;
    try {
      const snap = await getDoc(doc(db, 'userLibraries', user.uid));
      if (!snap.exists()) return null;
      const d = snap.data();
      return {
        likedTracks: Array.isArray(d.likedTracks) ? (d.likedTracks as Track[]) : [],
        followedArtists: Array.isArray(d.followedArtists)
          ? (d.followedArtists as ArtistSummary[])
          : [],
        playlists: Array.isArray(d.playlists) ? (d.playlists as UserPlaylist[]) : [],
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  }, [user]);

  const isDeveloper = useMemo(
    () => isDeveloperUser(user) || Boolean(profile?.isDeveloper),
    [user, profile?.isDeveloper],
  );

  const showGreenCheckmark = useMemo(
    () => Boolean(profile?.greenBadgeUnlocked && profile?.greenBadgeEnabled),
    [profile?.greenBadgeUnlocked, profile?.greenBadgeEnabled],
  );

  const showGoldFrame = useMemo(
    () => Boolean(profile?.goldFrameUnlocked && profile?.goldFrameEnabled),
    [profile?.goldFrameUnlocked, profile?.goldFrameEnabled],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      authReady,
      profile,
      profileLoading,
      isDeveloper,
      showGreenCheckmark,
      showGoldFrame,
      streakBannerMessage,
      dismissStreakBanner,
      preferences,
      signingIn,
      authError,
      signInWithGoogle,
      signOutUser,
      updatePreferences,
      updateProfileFields,
      toggleGreenCheckmark,
      toggleGoldFrame,
      recoverStreak,
      syncLibraryToCloud,
      fetchLibraryFromCloud,
    }),
    [
      user,
      authReady,
      profile,
      profileLoading,
      isDeveloper,
      showGreenCheckmark,
      showGoldFrame,
      streakBannerMessage,
      dismissStreakBanner,
      preferences,
      signingIn,
      authError,
      signInWithGoogle,
      signOutUser,
      updatePreferences,
      updateProfileFields,
      toggleGreenCheckmark,
      toggleGoldFrame,
      recoverStreak,
      syncLibraryToCloud,
      fetchLibraryFromCloud,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
