import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react';
import { setSafeModeCleared } from '../utils/apiFetch';

interface SafeModeModalProps {
  open: boolean;
  reason: string;
}

interface CaptchaChallengeData {
  challengeId: string;
  challengeToken: string;
  imageDataUrl: string;
  expiresAt: number;
  reason?: string;
}

export function SafeModeModal({ open, reason }: SafeModeModalProps) {
  const [challenge, setChallenge] = useState<CaptchaChallengeData | null>(null);
  const [loadingChallenge, setLoadingChallenge] = useState(false);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const loadChallenge = useCallback(async (reasonHint?: string) => {
    setLoadingChallenge(true);
    setErrorMsg(null);
    setAnswer('');
    try {
      const qs = reasonHint?.toLowerCase().includes('reload') ? '?reason=reload_spam' : '';
      const res = await fetch(`/api/captcha/challenge${qs}`, {
        headers: { 'X-Requested-With': 'Audixify-Web' },
        cache: 'no-store',
      });
      const json = (await res.json()) as CaptchaChallengeData & { error?: string };
      if (!res.ok || !json.challengeToken) {
        throw new Error(json.error || 'Gagal memuat kode verifikasi.');
      }
      setChallenge(json);
      setTimeout(() => inputRef.current?.focus(), 60);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat tantangan keamanan.');
    } finally {
      setLoadingChallenge(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setSuccessMsg(false);
      return;
    }
    void loadChallenge(reason);
  }, [open, reason, loadChallenge]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge || submitting) return;
    const cleaned = answer.trim().toUpperCase();
    if (cleaned.length !== 5) {
      setErrorMsg('Masukkan 5 karakter sesuai gambar keamanan.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/captcha/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'Audixify-Web',
        },
        body: JSON.stringify({
          challengeToken: challenge.challengeToken,
          answer: cleaned,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        clearanceToken?: string;
        expiresAt?: number;
        error?: string;
        code?: string;
      };

      if (!res.ok || !json.ok || !json.clearanceToken) {
        if (json.code === 'CAPTCHA_EXPIRED') {
          void loadChallenge(reason);
        }
        throw new Error(json.error || 'Verifikasi gagal. Coba lagi.');
      }

      setSuccessMsg(true);
      setTimeout(() => {
        setSafeModeCleared(json.clearanceToken!, json.expiresAt || Date.now() + 15 * 60_000);
      }, 320);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Kode tidak valid.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="safe-mode-title"
    >
      <div className="w-full max-w-md rounded-[28px] ios-glass p-6 sm:p-7 space-y-5 shadow-2xl border border-[#FF4D2E]/35 audixify-view-enter">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-[#FF4D2E]/15 text-[#FF4D2E] flex items-center justify-center shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#FF4D2E] font-semibold">
              Audixify Shield · Anti-DDoS
            </div>
            <h2
              id="safe-mode-title"
              className="font-display text-xl font-bold text-zinc-950 dark:text-white mt-0.5"
            >
              Mode Aman Aktif
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1 leading-relaxed">
              Sistem mendeteksi aktivitas request tidak wajar atau spam reload. Selesaikan
              verifikasi manusia di bawah untuk membuka akses kembali.
            </p>
          </div>
        </div>

        {(challenge?.reason || reason) && (
          <div className="rounded-2xl bg-black/[0.045] dark:bg-white/[0.06] px-3.5 py-2.5 text-xs text-zinc-700 dark:text-zinc-300 border border-black/[0.06] dark:border-white/[0.08]">
            <span className="font-semibold text-zinc-900 dark:text-white">Pemicu: </span>
            <span>{challenge?.reason || reason}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="flex-1 h-[76px] rounded-2xl overflow-hidden bg-[#11131B] border border-white/15 flex items-center justify-center">
              {loadingChallenge ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-[#FF4D2E] rounded-full animate-spin" />
              ) : challenge?.imageDataUrl ? (
                <img
                  src={challenge.imageDataUrl}
                  alt="Security verification characters"
                  className="w-full h-full object-contain select-none pointer-events-none"
                />
              ) : (
                <span className="text-xs text-zinc-400">Kode tidak tersedia</span>
              )}
            </div>

            <button
              type="button"
              onClick={() => void loadChallenge(reason)}
              disabled={loadingChallenge || submitting}
              aria-label="Muat ulang kode verifikasi"
              title="Muat ulang kode baru"
              className="w-11 h-[76px] rounded-2xl ios-glass-pill flex items-center justify-center text-zinc-700 dark:text-zinc-200 hover:text-[#FF4D2E] active:scale-95 transition-transform disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loadingChallenge ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="safe-mode-captcha-input"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              Ketik 5 karakter yang terlihat (huruf besar / angka)
            </label>
            <input
              ref={inputRef}
              id="safe-mode-captcha-input"
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
              placeholder="Contoh: A7K9M"
              maxLength={5}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="w-full h-11 px-4 rounded-2xl font-mono text-base tracking-[0.28em] text-center uppercase bg-black/[0.05] dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.14] text-zinc-950 dark:text-white focus:outline-none focus:border-[#FF4D2E]"
            />
          </div>

          {errorMsg && (
            <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">
              {errorMsg}
            </p>
          )}

          {successMsg ? (
            <div className="h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Terverifikasi! Membuka Audixify...</span>
            </div>
          ) : (
            <button
              type="submit"
              disabled={submitting || loadingChallenge || answer.length < 5}
              className="w-full h-11 rounded-2xl bg-[#FF4D2E] text-white text-sm font-semibold hover:bg-[#E63E21] active:scale-[0.98] transition-transform disabled:opacity-50 shadow-[0_8px_22px_rgba(255,77,46,0.35)]"
            >
              {submitting ? 'Memverifikasi...' : 'Verifikasi & Lanjutkan'}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
