import {
  Award,
  CheckCircle2,
  Crown,
  Flame,
  Gem,
  Lock,
  Music2,
  RotateCcw,
  Sparkles,
  SunMedium,
  Trophy,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePlayer } from '../../context/PlayerContext';
import {
  BADGE_CATALOG,
  STREAK_RECOVERY_LIMITS,
  type BadgeId,
} from '../../types/account';
import { GoldCrownBadge, GreenVerifiedBadge } from '../VerifiedBadge';

function getBadgeIcon(id: BadgeId) {
  switch (id) {
    case 'streak_3':
      return Flame;
    case 'streak_7':
      return Sparkles;
    case 'streak_30_crown':
      return Crown;
    case 'streak_30_pioneer':
      return Trophy;
    case 'streak_60_aurora':
      return SunMedium;
    case 'streak_60_virtuoso':
      return Music2;
    case 'streak_60_immortal':
      return Gem;
  }
}

export function StreakBadgeVault() {
  const {
    user,
    profile,
    toggleGreenCheckmark,
    toggleGoldFrame,
    recoverStreak,
    signInWithGoogle,
    signingIn,
  } = useAuth();
  const { showToast } = usePlayer();
  const [togglingGreen, setTogglingGreen] = useState(false);
  const [togglingGold, setTogglingGold] = useState(false);
  const [recovering, setRecovering] = useState(false);

  const streak = profile?.streakCount ?? 0;
  const longest = profile?.longestStreak ?? 0;
  const unlockedBadges = new Set<BadgeId>(profile?.badges ?? []);
  const greenUnlocked = Boolean(profile?.greenBadgeUnlocked);
  const greenEnabled = Boolean(profile?.greenBadgeEnabled);
  const goldUnlocked = Boolean(profile?.goldFrameUnlocked);
  const goldEnabled = Boolean(profile?.goldFrameEnabled);

  const recoverable = profile?.recoverableStreak ?? 0;
  const used30 = profile?.recoveryUsedTier30 ?? 0;
  const used7 = profile?.recoveryUsedTier7 ?? 0;
  const rem30 = Math.max(0, STREAK_RECOVERY_LIMITS.tier30Max - used30);
  const rem7 = Math.max(0, STREAK_RECOVERY_LIMITS.tier7Max - used7);

  const canRecover =
    recoverable >= 30 ? rem30 > 0 : recoverable >= 7 ? rem7 > 0 : false;

  const nextTarget = streak < 3 ? 3 : streak < 7 ? 7 : streak < 30 ? 30 : 60;
  const progressPct = Math.min(100, Math.round((streak / nextTarget) * 100));

  const handleToggleGreen = async () => {
    if (!greenUnlocked) return;
    setTogglingGreen(true);
    try {
      await toggleGreenCheckmark(!greenEnabled);
      showToast(
        !greenEnabled
          ? 'Centang hijau diaktifkan di profilmu'
          : 'Centang hijau disembunyikan sementara',
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengubah status centang hijau');
    } finally {
      setTogglingGreen(false);
    }
  };

  const handleToggleGold = async () => {
    if (!goldUnlocked) return;
    setTogglingGold(true);
    try {
      await toggleGoldFrame(!goldEnabled);
      showToast(
        !goldEnabled
          ? 'Gold Sovereign Frame diaktifkan di profilmu'
          : 'Gold Sovereign Frame disembunyikan sementara',
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengubah Gold Frame');
    } finally {
      setTogglingGold(false);
    }
  };

  const handleRecoverStreak = async () => {
    if (!canRecover) return;
    setRecovering(true);
    try {
      const next = await recoverStreak();
      showToast(`Streak dipulihkan ke ${next} hari!`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memulihkan streak');
    } finally {
      setRecovering(false);
    }
  };

  if (!user) {
    return (
      <section className="rounded-[28px] ios-glass p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#FF4D2E]/15 text-[#FF4D2E] flex items-center justify-center shrink-0">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-zinc-950 dark:text-white">
                Daily Streak &amp; Badge Vault
              </h2>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                Login 3 hari dapat badge, 7 hari dapat badge spesial (bisa pulihkan 1x), 30 hari
                membuka <strong>2 spesial badge + centang hijau</strong> (pemulihan 3x), dan{' '}
                <strong>60 hari</strong> membuka <strong>3 Immortal Badge + Gold Sovereign Frame</strong>!
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={signingIn}
            onClick={() => void signInWithGoogle()}
            className="px-4 py-2 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shrink-0 shadow-sm"
          >
            {signingIn ? 'Connecting...' : 'Login Google untuk Mulai Streak'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[28px] ios-glass p-5 sm:p-6 space-y-5">
      {/* Streak Summary Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF4D2E] to-amber-500 text-white flex items-center justify-center shadow-lg shrink-0">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-lg sm:text-xl font-bold text-zinc-950 dark:text-white">
                {streak} Hari Streak
              </h2>
              {profile?.lastCheckInDate && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Check-in Aktif</span>
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Rekor terbaik: <span className="font-mono font-semibold">{longest} hari</span> ·
              Target berikutnya:{' '}
              <span className="font-mono font-semibold text-[#FF4D2E]">{nextTarget} hari</span>
            </p>
          </div>
        </div>

        {/* Progress Bar to Next Milestone */}
        <div className="sm:w-56 space-y-1.5">
          <div className="flex justify-between text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
            <span>Progress</span>
            <span>
              {streak}/{nextTarget} hari
            </span>
          </div>
          <div className="h-2 rounded-full bg-black/[0.08] dark:bg-white/[0.1] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#FF4D2E] via-amber-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Streak Recovery Card (3x for 30+ days, 1x for 7+ days) */}
      <div className="rounded-2xl ios-glass-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
            <RotateCcw className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Pemulihan Streak (Streak Recovery)
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Kuota tersisa:{' '}
              <span className="font-mono font-semibold text-amber-600 dark:text-amber-300">
                30+ Hari ({rem30}/{STREAK_RECOVERY_LIMITS.tier30Max}x)
              </span>{' '}
              ·{' '}
              <span className="font-mono font-semibold text-purple-600 dark:text-purple-300">
                7+ Hari ({rem7}/{STREAK_RECOVERY_LIMITS.tier7Max}x)
              </span>
            </p>
            {recoverable >= 7 && (
              <p className="text-xs text-[#FF4D2E] font-medium mt-1">
                Streak sebelumnya ({recoverable} hari) terdeteksi terputus dan bisa dipulihkan!
              </p>
            )}
          </div>
        </div>

        {recoverable >= 7 ? (
          <button
            type="button"
            disabled={!canRecover || recovering}
            onClick={() => void handleRecoverStreak()}
            className="px-4 py-2 rounded-full bg-gradient-to-r from-[#FF4D2E] to-amber-500 text-white text-xs font-semibold hover:opacity-95 active:scale-95 transition-all shrink-0 disabled:opacity-45 disabled:cursor-not-allowed shadow-sm"
          >
            {recovering
              ? 'Memulihkan...'
              : canRecover
                ? `Pulihkan ${recoverable} Hari`
                : 'Kuota Pemulihan Habis'}
          </button>
        ) : (
          <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 shrink-0">
            Streak Aman
          </span>
        )}
      </div>

      {/* Collectible Badge Grid */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
            <Award className="w-4 h-4 text-[#FF4D2E]" />
            <span>
              Koleksi Badge ({unlockedBadges.size}/{BADGE_CATALOG.length})
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {BADGE_CATALOG.map((badge) => {
            const unlocked = unlockedBadges.has(badge.id);
            const Icon = getBadgeIcon(badge.id);
            return (
              <div
                key={badge.id}
                className={`rounded-2xl p-3.5 ios-glass-card flex items-start gap-3 transition-all ${
                  unlocked
                    ? badge.tier === 'immortal'
                      ? 'ring-1 ring-amber-400/60'
                      : 'ring-1 ring-[#FF4D2E]/35'
                    : 'opacity-70'
                }`}
              >
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                  style={{
                    backgroundColor: unlocked ? `${badge.accent}22` : 'rgba(113,113,122,0.14)',
                    color: unlocked ? badge.accent : '#71717A',
                  }}
                >
                  {unlocked ? <Icon className="w-5 h-5" /> : <Lock className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                      {badge.title}
                    </span>
                    <span className="text-[10px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0">
                      {badge.requiredDays}d
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                    {badge.subtitle}
                  </p>
                  <div className="mt-1.5 text-[10px] font-semibold">
                    {unlocked ? (
                      <span className="text-emerald-600 dark:text-emerald-400">Terbuka</span>
                    ) : (
                      <span className="text-zinc-500 dark:text-zinc-400 font-mono">
                        {Math.min(streak, badge.requiredDays)}/{badge.requiredDays} hari
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 30-Day & 60-Day Toggleable Profile Cosmetics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* 30-Day Green Verified Checkmark Toggle */}
        <div className="rounded-2xl ios-glass-card p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              <GreenVerifiedBadge size="md" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 flex-wrap">
                <span>Centang Hijau</span>
                {!greenUnlocked && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-500/15 text-zinc-500 dark:text-zinc-400">
                    {Math.min(streak, 30)}/30d
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {greenUnlocked
                  ? 'Aktifkan atau sembunyikan centang hijau di profilmu.'
                  : 'Terbuka otomatis di streak 30 hari.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={greenEnabled}
            disabled={!greenUnlocked || togglingGreen}
            onClick={() => void handleToggleGreen()}
            className={`w-12 h-7 rounded-full p-0.5 transition-colors shrink-0 disabled:opacity-45 disabled:cursor-not-allowed ${
              greenUnlocked && greenEnabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
            }`}
          >
            <span
              className={`block w-6 h-6 rounded-full bg-white shadow transition-transform ${
                greenUnlocked && greenEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* 60-Day Gold Sovereign Frame Toggle */}
        <div className="rounded-2xl ios-glass-card p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/15 flex items-center justify-center shrink-0">
              <GoldCrownBadge size="md" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 flex-wrap">
                <span>Gold Sovereign Frame</span>
                {!goldUnlocked && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-500/15 text-zinc-500 dark:text-zinc-400">
                    {Math.min(streak, 60)}/60d
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {goldUnlocked
                  ? 'Bingkai emas mewah & mahkota Gold di profil & Listen Together.'
                  : 'Terbuka di streak 60 hari + 3 Immortal Badge.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={goldEnabled}
            disabled={!goldUnlocked || togglingGold}
            onClick={() => void handleToggleGold()}
            className={`w-12 h-7 rounded-full p-0.5 transition-colors shrink-0 disabled:opacity-45 disabled:cursor-not-allowed ${
              goldUnlocked && goldEnabled ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-700'
            }`}
          >
            <span
              className={`block w-6 h-6 rounded-full bg-white shadow transition-transform ${
                goldUnlocked && goldEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </section>
  );
}
