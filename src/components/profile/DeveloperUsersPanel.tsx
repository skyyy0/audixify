import {
  BadgeCheck,
  Crown,
  Flame,
  Mail,
  RefreshCw,
  Search,
  Shield,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePlayer } from '../../context/PlayerContext';
import { DEVELOPER_EMAIL } from '../../lib/firebase';
import type { UserProfile, UserRole } from '../../types/account';
import { apiFetch } from '../../utils/apiFetch';
import {
  DeveloperBadge,
  GoldCrownBadge,
  GreenVerifiedBadge,
  RoleBadge,
} from '../VerifiedBadge';

type AdminFilterTab = 'all' | 'gmail' | 'verified' | 'guests';

interface VisitorTelemetry {
  activeGuests: number;
  activeSignedIn: number;
  windowMinutes: number;
}

const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: 'listener', label: 'Listener' },
  { value: 'vip', label: 'VIP' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'developer', label: 'Developer' },
];

function formatRelativeTime(ts: unknown): string {
  if (!ts) return '—';
  try {
    let date: Date | null = null;
    if (typeof ts === 'object' && ts !== null && 'toDate' in ts) {
      const fn = (ts as { toDate?: () => Date }).toDate;
      if (typeof fn === 'function') date = fn.call(ts);
    } else if (typeof ts === 'string' || typeof ts === 'number') {
      date = new Date(ts);
    }
    if (!date || Number.isNaN(date.getTime())) return '—';
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return 'Baru saja';
    if (diffMin < 60) return `${diffMin}m lalu`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}j lalu`;
    return `${Math.floor(diffHr / 24)}h lalu`;
  } catch {
    return '—';
  }
}

export function DeveloperUsersPanel() {
  const { user, listRegisteredUsers, adminUpdateUserAccess } = useAuth();
  const { showToast } = usePlayer();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<AdminFilterTab>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<VisitorTelemetry | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [registered, telemetryRes] = await Promise.all([
        listRegisteredUsers(),
        apiFetch('/api/visitor-telemetry').catch(() => null),
      ]);
      setUsers(registered);
      if (telemetryRes && telemetryRes.ok) {
        const json = (await telemetryRes.json()) as VisitorTelemetry;
        setTelemetry(json);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? 'Gagal memuat daftar user dari Firestore. Pastikan rules terbaru aktif.'
          : 'Unable to fetch user directory.',
      );
    } finally {
      setLoading(false);
    }
  }, [listRegisteredUsers]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const metrics = useMemo(() => {
    let gmailCount = 0;
    let verifiedCount = 0;
    let elevatedCount = 0;
    for (const u of users) {
      const email = (u.email || '').toLowerCase();
      if (email.endsWith('@gmail.com') || u.authProvider === 'google') gmailCount += 1;
      if (u.greenBadgeUnlocked) verifiedCount += 1;
      if (u.isDeveloper || (u.role && u.role !== 'listener')) elevatedCount += 1;
    }
    return {
      total: users.length,
      gmailCount,
      verifiedCount,
      elevatedCount,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return users.filter((u) => {
      if (filterTab === 'gmail') {
        const email = (u.email || '').toLowerCase();
        if (!email.endsWith('@gmail.com') && u.authProvider !== 'google') return false;
      } else if (filterTab === 'verified') {
        const hasBadgeOrRole =
          u.greenBadgeUnlocked ||
          u.goldFrameUnlocked ||
          u.isDeveloper ||
          (u.role && u.role !== 'listener');
        if (!hasBadgeOrRole) return false;
      }

      if (!q) return true;
      return (
        u.displayName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q)
      );
    });
  }, [users, filterTab, searchTerm]);

  const nonGmailAccounts = useMemo(
    () =>
      users.filter((u) => {
        const email = (u.email || '').toLowerCase();
        return Boolean(email) && !email.endsWith('@gmail.com');
      }),
    [users],
  );

  const handleRoleChange = async (target: UserProfile, nextRole: UserRole) => {
    setUpdatingUid(target.uid);
    try {
      await adminUpdateUserAccess(target.uid, { role: nextRole });
      setUsers((prev) =>
        prev.map((item) =>
          item.uid === target.uid
            ? { ...item, role: nextRole, isDeveloper: nextRole === 'developer' }
            : item,
        ),
      );
      showToast(`Role @${target.username} diubah menjadi ${nextRole.toUpperCase()}`);
    } catch {
      showToast('Gagal mengubah role user');
    } finally {
      setUpdatingUid(null);
    }
  };

  const handleToggleVerified = async (target: UserProfile) => {
    const nextVal = !target.greenBadgeUnlocked;
    setUpdatingUid(target.uid);
    try {
      await adminUpdateUserAccess(target.uid, { greenBadge: nextVal });
      setUsers((prev) =>
        prev.map((item) =>
          item.uid === target.uid
            ? { ...item, greenBadgeUnlocked: nextVal, greenBadgeEnabled: nextVal }
            : item,
        ),
      );
      showToast(
        nextVal
          ? `Verified Badge diberikan ke @${target.username}`
          : `Verified Badge dicabut dari @${target.username}`,
      );
    } catch {
      showToast('Gagal memperbarui Verified Badge');
    } finally {
      setUpdatingUid(null);
    }
  };

  const handleToggleGoldFrame = async (target: UserProfile) => {
    const nextVal = !target.goldFrameUnlocked;
    setUpdatingUid(target.uid);
    try {
      await adminUpdateUserAccess(target.uid, { goldFrame: nextVal });
      setUsers((prev) =>
        prev.map((item) =>
          item.uid === target.uid
            ? { ...item, goldFrameUnlocked: nextVal, goldFrameEnabled: nextVal }
            : item,
        ),
      );
      showToast(
        nextVal
          ? `Gold Sovereign Frame aktif untuk @${target.username}`
          : `Gold Frame dinonaktifkan untuk @${target.username}`,
      );
    } catch {
      showToast('Gagal memperbarui Gold Frame');
    } finally {
      setUpdatingUid(null);
    }
  };

  return (
    <section
      aria-label="Developer User Management"
      className="rounded-[28px] ios-glass overflow-hidden border border-red-500/20"
    >
      {/* Developer Panel Header */}
      <div className="p-4 sm:p-5 border-b border-black/[0.06] dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-red-500/12 text-red-500 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-base sm:text-lg font-bold text-zinc-950 dark:text-white">
                Developer Console · User &amp; Role Manager
              </h2>
              <DeveloperBadge showLabel />
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Cek akun terdaftar, email Gmail, sesi Guest aktif, atur role &amp; berikan Verified Badge.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full ios-glass-pill text-xs font-semibold text-zinc-800 dark:text-zinc-100 hover:text-[#FF4D2E] active:scale-95 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Real Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-black/[0.06] dark:divide-white/[0.07] border-b border-black/[0.06] dark:divide-white/[0.08]">
        <div className="p-3.5 sm:px-5">
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">User Terdaftar</div>
          <div className="font-mono text-xl font-bold tabular-nums text-zinc-950 dark:text-white mt-0.5">
            {metrics.total}
          </div>
        </div>
        <div className="p-3.5 sm:px-5">
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Akun Gmail / Google</div>
          <div className="font-mono text-xl font-bold tabular-nums text-zinc-950 dark:text-white mt-0.5">
            {metrics.gmailCount}
          </div>
        </div>
        <div className="p-3.5 sm:px-5">
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Verified &amp; Role</div>
          <div className="font-mono text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
            {metrics.verifiedCount}{' '}
            <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
              / {metrics.elevatedCount} role
            </span>
          </div>
        </div>
        <div className="p-3.5 sm:px-5">
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Live Guest (30m)</div>
          <div className="font-mono text-xl font-bold tabular-nums text-[#FF4D2E] mt-0.5">
            {telemetry ? telemetry.activeGuests : '—'}
          </div>
        </div>
      </div>

      {/* Filter Tabs + Search Bar */}
      <div className="p-4 sm:px-5 border-b border-black/[0.06] dark:border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-full ios-glass-pill w-fit">
          {(
            [
              { id: 'all', label: `Semua (${metrics.total})` },
              { id: 'gmail', label: `Gmail (${metrics.gmailCount})` },
              { id: 'verified', label: 'Verified & Role' },
              { id: 'guests', label: 'User Guest' },
            ] as Array<{ id: AdminFilterTab; label: string }>
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilterTab(t.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                filterTab === t.id
                  ? 'bg-[#FF4D2E] text-white'
                  : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {filterTab !== 'guests' && (
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari nama, @username, email..."
              className="w-full h-9 pl-9 pr-3 rounded-full text-xs bg-black/[0.045] dark:bg-white/[0.065] border border-black/[0.06] dark:border-white/[0.09] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#FF4D2E]"
            />
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="m-4 px-3.5 py-2.5 rounded-2xl bg-red-500/10 border border-red-500/25 text-xs text-red-600 dark:text-red-400">
          {errorMsg}
        </div>
      )}

      {/* Guest Sessions Tab */}
      {filterTab === 'guests' ? (
        <div className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-2xl ios-glass-card p-4 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                <Users className="w-4 h-4 text-[#FF4D2E]" />
                <span>Sesi Guest Aktif (Server Instance Ini)</span>
              </div>
              <div className="font-mono text-2xl font-bold tabular-nums text-zinc-950 dark:text-white">
                {telemetry ? telemetry.activeGuests : 0}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Pengunjung tanpa login Google dalam {telemetry?.windowMinutes || 30} menit terakhir.
                Mode Guest berjalan lokal di perangkat tanpa membuat dokumen akun di Firestore.
              </p>
            </div>

            <div className="rounded-2xl ios-glass-card p-4 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                <Mail className="w-4 h-4 text-emerald-500" />
                <span>Sesi Google Aktif (Server Instance Ini)</span>
              </div>
              <div className="font-mono text-2xl font-bold tabular-nums text-zinc-950 dark:text-white">
                {telemetry ? telemetry.activeSignedIn : 0}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Perangkat yang sedang aktif menggunakan akun Google Sign-In pada sesi saat ini.
              </p>
            </div>
          </div>

          {nonGmailAccounts.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Akun Terdaftar Non-Gmail ({nonGmailAccounts.length})
              </div>
              <div className="rounded-2xl ios-glass-card divide-y divide-black/[0.06] dark:divide-white/[0.07]">
                {nonGmailAccounts.map((u) => (
                  <div key={u.uid} className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {u.displayName} (@{u.username})
                    </span>
                    <span className="font-mono text-zinc-500 dark:text-zinc-400 truncate">
                      {u.email}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : loading ? (
        <div className="p-4 sm:p-5 space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl ios-glass-card animate-pulse" />
          ))}
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="p-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
          Tidak ada user yang cocok dengan filter saat ini.
        </div>
      ) : (
        <div className="divide-y divide-black/[0.06] dark:divide-white/[0.07] max-h-[540px] overflow-y-auto">
          {filteredUsers.map((item) => {
            const isPrimaryDev =
              (item.email || '').toLowerCase() === DEVELOPER_EMAIL ||
              item.uid === user?.uid;
            const currentRole: UserRole =
              item.role || (item.isDeveloper ? 'developer' : 'listener');
            const isBusy = updatingUid === item.uid;

            return (
              <div
                key={item.uid}
                className="p-4 sm:px-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-white/35 dark:hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-full overflow-hidden shrink-0 bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold ${
                      item.goldFrameUnlocked && item.goldFrameEnabled
                        ? 'ring-2 ring-amber-400'
                        : ''
                    }`}
                  >
                    {item.avatarDataUrl ? (
                      <img
                        src={item.avatarDataUrl}
                        alt={item.displayName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      item.displayName.charAt(0).toUpperCase()
                    )}
                  </div>

                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-zinc-950 dark:text-white truncate">
                        {item.displayName}
                      </span>
                      {item.isDeveloper && <DeveloperBadge />}
                      {item.greenBadgeUnlocked && <GreenVerifiedBadge />}
                      {item.goldFrameUnlocked && <GoldCrownBadge />}
                      <RoleBadge role={currentRole} />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span className="font-mono">@{item.username}</span>
                      <span>·</span>
                      <span className="font-mono truncate max-w-[230px]">
                        {item.email || 'Email akan tersinkron saat login berikutnya'}
                      </span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-0.5 font-mono text-[#FF4D2E]">
                        <Flame className="w-3 h-3" />
                        {item.streakCount}d
                      </span>
                      <span>·</span>
                      <span className="font-mono">{formatRelativeTime(item.lastSeenAt || item.updatedAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Admin Controls: Role + Verified Badge + Gold Frame */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <select
                    aria-label={`Ubah role untuk ${item.displayName}`}
                    disabled={isBusy || isPrimaryDev}
                    value={currentRole}
                    onChange={(e) => void handleRoleChange(item, e.target.value as UserRole)}
                    className="h-9 px-3 rounded-full text-xs font-semibold bg-black/[0.05] dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.12] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#FF4D2E] disabled:opacity-55"
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-zinc-900 text-white">
                        Role: {opt.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleToggleVerified(item)}
                    className={`h-9 px-3.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 ${
                      item.greenBadgeUnlocked
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
                        : 'ios-glass-pill text-zinc-700 dark:text-zinc-200 hover:text-emerald-500'
                    }`}
                  >
                    <BadgeCheck className="w-3.5 h-3.5" />
                    <span>{item.greenBadgeUnlocked ? 'Verified Aktif' : 'Beri Verified'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleToggleGoldFrame(item)}
                    className={`h-9 px-3 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 ${
                      item.goldFrameUnlocked
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30'
                        : 'ios-glass-pill text-zinc-700 dark:text-zinc-200 hover:text-amber-500'
                    }`}
                  >
                    <Crown className="w-3.5 h-3.5" />
                    <span>{item.goldFrameUnlocked ? 'Gold' : '+ Gold'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
