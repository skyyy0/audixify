import { LayoutGroup, motion } from 'motion/react';
import {
  Camera,
  ChevronRight,
  CloudDownload,
  CloudUpload,
  Cpu,
  Gauge,
  Globe,
  Info,
  LogIn,
  LogOut,
  MessageSquareText,
  Mic2,
  Moon,
  Save,
  Settings,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  User,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import {
  PROFILE_CONSTRAINTS,
  type AudioQuality,
  type LyricsSize,
  type PerfMode,
} from '../types/account';
import type { RegionScope } from '../types/music';
import { compressImageFile } from '../utils/imageCompress';
import { IOS_SPRING_SNAPPY } from '../utils/motion';
import { DeveloperBadge } from './DeveloperBadge';
import { AboutSkyPage } from './profile/AboutSkyPage';

export type ProfileTab = 'account' | 'settings' | 'about';

interface ProfileViewProps {
  onApplyDefaultRegion: (scope: RegionScope) => void;
  onOpenSupportPage: () => void;
}

export function ProfileView({ onApplyDefaultRegion, onOpenSupportPage }: ProfileViewProps) {
  const {
    user,
    profile,
    isDeveloper,
    preferences,
    signingIn,
    authError,
    signInWithGoogle,
    signOutUser,
    updatePreferences,
    updateProfileFields,
    syncLibraryToCloud,
    fetchLibraryFromCloud,
  } = useAuth();

  const {
    theme,
    toggleTheme,
    likedTracks,
    followedArtists,
    playlists,
    restoreLibraryFromCloudData,
    clearListeningHistory,
    showToast,
  } = usePlayer();

  const [tab, setTab] = useState<ProfileTab>('account');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setUsername(profile.username);
      setBio(profile.bio);
      setAvatarPreview(profile.avatarDataUrl);
    } else if (user) {
      setDisplayName(user.displayName || 'Listener');
      setAvatarPreview(user.photoURL || '');
    }
  }, [profile, user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFormError(null);
    try {
      const compressed = await compressImageFile(file, {
        maxDim: 256,
        maxDataUrlChars: 105000,
        squareCrop: true,
      });
      setAvatarPreview(compressed);
      if (user) {
        await updateProfileFields({ avatarDataUrl: compressed });
        showToast('Profile photo updated');
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to process photo');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);
    setSavingProfile(true);
    try {
      await updateProfileFields({
        displayName,
        username,
        bio,
        avatarDataUrl: avatarPreview,
      });
      showToast('Profile saved');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleBackupCloud = async () => {
    setSyncingCloud(true);
    try {
      await syncLibraryToCloud({ likedTracks, followedArtists, playlists });
      showToast('Library backed up to cloud');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Cloud backup failed');
    } finally {
      setSyncingCloud(false);
    }
  };

  const handleRestoreCloud = async () => {
    setSyncingCloud(true);
    try {
      const data = await fetchLibraryFromCloud();
      if (!data) {
        showToast('No cloud backup found yet');
        return;
      }
      restoreLibraryFromCloudData(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Cloud restore failed');
    } finally {
      setSyncingCloud(false);
    }
  };

  const tabs: Array<{ id: ProfileTab | 'support'; label: string; icon: typeof User }> = [
    { id: 'account', label: 'Profile', icon: User },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'support', label: 'Support', icon: MessageSquareText },
    { id: 'about', label: 'About sky', icon: Info },
  ];

  const effectiveAvatar = avatarPreview || user?.photoURL || '';
  const effectiveName = profile?.displayName || user?.displayName || 'Guest Listener';
  const effectiveUsername = profile?.username ? `@${profile.username}` : 'Optional Guest Mode';

  return (
    <div className="space-y-6 pb-12">
      {/* Top Profile Identity Card */}
      <section className="rounded-[28px] ios-glass p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="relative shrink-0">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-800 dark:to-zinc-900 border-2 border-white/60 dark:border-white/15 shadow-lg flex items-center justify-center">
                {effectiveAvatar ? (
                  <img
                    src={effectiveAvatar}
                    alt={effectiveName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-8 h-8 text-zinc-500 dark:text-zinc-400" />
                )}
              </div>

              {user && (
                <>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    aria-label="Change profile photo"
                    className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-[#FF4D2E] text-white flex items-center justify-center shadow-md hover:bg-[#E63E21] active:scale-90 transition-transform"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-xl sm:text-2xl font-bold text-zinc-950 dark:text-white truncate">
                  {effectiveName}
                </h1>
                {isDeveloper && <DeveloperBadge showLabel size="md" />}
              </div>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 truncate">
                {effectiveUsername}
              </p>
              {profile?.bio && (
                <p className="text-xs text-zinc-700 dark:text-zinc-300 line-clamp-2">
                  {profile.bio}
                </p>
              )}
              <div className="flex items-center gap-3 pt-0.5 text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                <span>{likedTracks.length} Liked</span>
                <span>·</span>
                <span>{playlists.length} Playlists</span>
                <span>·</span>
                <span>{followedArtists.length} Following</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full ios-glass-pill text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-red-600 dark:hover:text-red-400 active:scale-95 transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={signingIn}
                onClick={() => void signInWithGoogle()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shadow-md disabled:opacity-60"
              >
                <LogIn className="w-4 h-4" />
                <span>{signingIn ? 'Connecting...' : 'Sign in with Google'}</span>
              </button>
            )}
          </div>
        </div>

        {authError && (
          <p className="mt-3 text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
            {authError}
          </p>
        )}
      </section>

      {/* Segmented iOS Sub-Navigation */}
      <LayoutGroup id="profile-section-tabs">
        <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-full ios-glass-pill">
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'support') {
                    onOpenSupportPage();
                  } else {
                    setTab(item.id);
                  }
                }}
                className={`relative inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-colors ${
                  active
                    ? 'text-zinc-950 dark:text-white'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="profile-tab-pill"
                    transition={IOS_SPRING_SNAPPY}
                    className="absolute inset-0 rounded-full bg-white/95 dark:bg-white/[0.16] shadow-xs"
                  />
                )}
                <Icon className={`relative z-10 w-3.5 h-3.5 ${active ? 'text-[#FF4D2E]' : ''}`} />
                <span className="relative z-10">{item.label}</span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      {/* Tab Content */}
      {tab === 'account' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {user ? (
            <>
              <form
                onSubmit={handleSaveProfile}
                className="lg:col-span-7 rounded-[28px] ios-glass p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold text-zinc-950 dark:text-white">
                    Edit Profile
                  </h2>
                  {isDeveloper && <DeveloperBadge showLabel />}
                </div>

                {formError && (
                  <p className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                    {formError}
                  </p>
                )}

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                    Display Name
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={PROFILE_CONSTRAINTS.displayNameMax}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    className="w-full h-10 px-4 rounded-2xl text-sm bg-black/[0.045] dark:bg-white/[0.065] border border-black/[0.06] dark:border-white/[0.09] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#FF4D2E]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                    Username
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-zinc-400">
                      @
                    </span>
                    <input
                      type="text"
                      required
                      minLength={PROFILE_CONSTRAINTS.usernameMin}
                      maxLength={PROFILE_CONSTRAINTS.usernameMax}
                      value={username}
                      onChange={(e) =>
                        setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))
                      }
                      placeholder="username"
                      className="w-full h-10 pl-8 pr-4 rounded-2xl text-sm font-mono bg-black/[0.045] dark:bg-white/[0.065] border border-black/[0.06] dark:border-white/[0.09] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#FF4D2E]"
                    />
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    3–24 characters · lowercase letters, numbers, underscores, or dots.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                    Bio / Listening Vibe
                  </label>
                  <textarea
                    rows={3}
                    maxLength={PROFILE_CONSTRAINTS.bioMax}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Dewa 19, Tulus, late night drives..."
                    className="w-full p-3.5 rounded-2xl text-sm bg-black/[0.045] dark:bg-white/[0.065] border border-black/[0.06] dark:border-white/[0.09] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#FF4D2E] resize-none"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shadow-md disabled:opacity-60"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{savingProfile ? 'Saving...' : 'Save Changes'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full ios-glass-pill text-xs font-medium text-zinc-700 dark:text-zinc-200"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Upload Avatar</span>
                  </button>
                  {user.photoURL && avatarPreview !== user.photoURL && (
                    <button
                      type="button"
                      onClick={() => setAvatarPreview(user.photoURL || '')}
                      className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 px-2"
                    >
                      Use Google Photo
                    </button>
                  )}
                </div>
              </form>

              {/* Cloud Library Sync Card */}
              <div className="lg:col-span-5 rounded-[28px] ios-glass p-6 space-y-4 h-fit">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#FF4D2E]" />
                  <h2 className="font-display text-lg font-bold text-zinc-950 dark:text-white">
                    Cloud Library Sync
                  </h2>
                </div>
                <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  Back up your Liked Songs, Followed Artists, and Custom Playlists to Firestore so
                  they stay synced across devices.
                </p>
                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    disabled={syncingCloud}
                    onClick={() => void handleBackupCloud()}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 text-xs font-semibold active:scale-[0.98] transition-transform disabled:opacity-60"
                  >
                    <CloudUpload className="w-4 h-4" />
                    <span>{syncingCloud ? 'Syncing...' : 'Back Up Library to Cloud'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={syncingCloud}
                    onClick={() => void handleRestoreCloud()}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl ios-glass-pill text-xs font-medium text-zinc-800 dark:text-zinc-200 active:scale-[0.98] transition-transform disabled:opacity-60"
                  >
                    <CloudDownload className="w-4 h-4" />
                    <span>Restore Library from Cloud</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="lg:col-span-12 rounded-[28px] ios-glass p-7 space-y-4">
              <h2 className="font-display text-lg font-bold text-zinc-950 dark:text-white">
                Guest Mode Active — Optional Google Sign-In
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-300 max-w-2xl leading-relaxed">
                You can stream all music, watch Music Videos, and save Liked Songs locally without
                an account. Signing in with Google is optional and lets you set a custom{' '}
                <strong>@username</strong>, upload an avatar photo, sync your library to the cloud,
                and chat directly with developer <strong>sky</strong> for support or bug reports.
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={signingIn}
                  onClick={() => void signInWithGoogle()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shadow-md"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{signingIn ? 'Signing in...' : 'Continue with Google'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTab('settings')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full ios-glass-pill text-xs font-medium text-zinc-700 dark:text-zinc-200"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Open App Settings</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-5">
          {/* Appearance & Performance */}
          <section className="rounded-[28px] ios-glass divide-y divide-black/[0.06] dark:divide-white/[0.07] overflow-hidden">
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {theme === 'dark' ? (
                  <Moon className="w-4 h-4 text-[#FF4D2E]" />
                ) : (
                  <Sun className="w-4 h-4 text-[#FF4D2E]" />
                )}
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Appearance Theme
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Switch between Obsidian Dark and Studio Light Liquid Glass
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className="px-4 py-2 rounded-full ios-glass-pill text-xs font-semibold text-zinc-900 dark:text-zinc-100 active:scale-95 transition-transform self-start sm:self-auto"
              >
                {theme === 'dark' ? 'Obsidian Dark' : 'Studio Light'}
              </button>
            </div>

            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Cpu className="w-4 h-4 text-[#FF4D2E]" />
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Performance &amp; Low-RAM Mode
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Auto detects 2GB–3GB RAM devices to keep scrolling locked at 60fps
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-full ios-glass-pill self-start sm:self-auto">
                {(['auto', 'lite', 'full'] as PerfMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => void updatePreferences({ perfMode: mode })}
                    className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                      preferences.perfMode === mode
                        ? 'bg-[#FF4D2E] text-white'
                        : 'text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Gauge className="w-4 h-4 text-[#FF4D2E]" />
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Audio Stream Preference
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Choose full high-bitrate streams or lightweight Data Saver mode
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-full ios-glass-pill self-start sm:self-auto">
                {(['auto', 'high', 'saver'] as AudioQuality[]).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void updatePreferences({ audioQuality: q })}
                    className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                      preferences.audioQuality === q
                        ? 'bg-[#FF4D2E] text-white'
                        : 'text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Mic2 className="w-4 h-4 text-[#FF4D2E]" />
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Lyrics Font Size
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Scale synced &amp; plain lyrics in Now Playing
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-full ios-glass-pill self-start sm:self-auto">
                {(['compact', 'standard', 'large'] as LyricsSize[]).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => void updatePreferences({ lyricsSize: sz })}
                    className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                      preferences.lyricsSize === sz
                        ? 'bg-[#FF4D2E] text-white'
                        : 'text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Globe className="w-4 h-4 text-[#FF4D2E]" />
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Default Home Region
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Choose preferred catalog spotlight on Home
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-full ios-glass-pill self-start sm:self-auto">
                {(['all', 'id', 'asia', 'global'] as RegionScope[]).map((reg) => (
                  <button
                    key={reg}
                    type="button"
                    onClick={() => {
                      void updatePreferences({ defaultRegion: reg });
                      onApplyDefaultRegion(reg);
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-medium uppercase transition-colors ${
                      preferences.defaultRegion === reg
                        ? 'bg-[#FF4D2E] text-white'
                        : 'text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    {reg === 'id' ? 'ID' : reg}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Autoplay Next Track
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Continue automatically when the current song finishes
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preferences.autoplay}
                onClick={() => void updatePreferences({ autoplay: !preferences.autoplay })}
                className={`w-12 h-7 rounded-full p-0.5 transition-colors ${
                  preferences.autoplay ? 'bg-[#FF4D2E]' : 'bg-zinc-300 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`block w-6 h-6 rounded-full bg-white shadow transition-transform ${
                    preferences.autoplay ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </section>

          {/* Support Chat, About sky & Storage */}
          <section className="rounded-[28px] ios-glass divide-y divide-black/[0.06] dark:divide-white/[0.07] overflow-hidden">
            <button
              type="button"
              onClick={onOpenSupportPage}
              className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left hover:bg-white/50 dark:hover:bg-white/[0.05] transition-colors"
            >
              <div className="flex items-center gap-3">
                <MessageSquareText className="w-4 h-4 text-[#FF4D2E]" />
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Support &amp; Report Bug
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Chat directly with developer sky and attach bug screenshots
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400" />
            </button>

            <button
              type="button"
              onClick={() => setTab('about')}
              className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left hover:bg-white/50 dark:hover:bg-white/[0.05] transition-colors"
            >
              <div className="flex items-center gap-3">
                <Info className="w-4 h-4 text-[#FF4D2E]" />
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <span>About sky</span>
                    <DeveloperBadge />
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Developer info, code stack, Open Source &amp; Telegram @sekaynotdev
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400" />
            </button>

            <button
              type="button"
              onClick={clearListeningHistory}
              className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left hover:bg-white/50 dark:hover:bg-white/[0.05] transition-colors"
            >
              <div className="flex items-center gap-3">
                <Trash2 className="w-4 h-4 text-red-500" />
                <div>
                  <div className="text-sm font-semibold text-red-600 dark:text-red-400">
                    Clear Listening History
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Remove local recently played tracks without affecting playlists
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400" />
            </button>
          </section>
        </div>
      )}

      {tab === 'about' && <AboutSkyPage onBackToSettings={() => setTab('settings')} />}
    </div>
  );
}
