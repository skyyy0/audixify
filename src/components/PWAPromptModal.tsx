import { AnimatePresence, motion } from 'motion/react';
import { Download, PlusSquare, Share, Smartphone, Sparkles, X, Zap } from 'lucide-react';
import { useState } from 'react';
import { IOS_SPRING_SHEET } from '../utils/motion';

interface PWAPromptModalProps {
  open: boolean;
  isIOS: boolean;
  canNativeInstall: boolean;
  onInstall: () => Promise<'installed' | 'dismissed' | 'manual'>;
  onDismiss48Hours: () => void;
}

export function PWAPromptModal({
  open,
  isIOS,
  canNativeInstall,
  onInstall,
  onDismiss48Hours,
}: PWAPromptModalProps) {
  const [showManualHint, setShowManualHint] = useState(false);

  const handleInstallClick = async () => {
    const result = await onInstall();
    if (result === 'manual') {
      setShowManualHint(true);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="pwa-install-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[72] flex items-end sm:items-center justify-center p-3 sm:p-5 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-label="Install Audixify App"
        >
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 32, opacity: 0, scale: 0.96 }}
            transition={IOS_SPRING_SHEET}
            className="w-full max-w-md rounded-[28px] ios-glass p-5 sm:p-6 shadow-2xl space-y-4 relative overflow-hidden"
          >
            <button
              type="button"
              onClick={onDismiss48Hours}
              aria-label="Tutup dan ingatkan lagi 48 jam kemudian"
              className="absolute top-4 right-4 w-8 h-8 rounded-full ios-glass-pill flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white active:scale-90 transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3.5 pr-8">
              <img
                src="/pwa-192x192.png"
                alt="Audixify App Icon"
                className="w-14 h-14 rounded-2xl shadow-lg shrink-0"
              />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#FF4D2E]">
                  Audixify App
                </div>
                <h2 className="font-display text-lg font-bold text-zinc-950 dark:text-white leading-snug">
                  Install Audixify di Layar Utama
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Tampilan fullscreen ala aplikasi native iOS &amp; Android.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl ios-glass-card p-2.5 space-y-1">
                <Zap className="w-4 h-4 text-[#FF4D2E] mx-auto" />
                <div className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-100">
                  Super Ringan
                </div>
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  Hemat RAM 2GB+
                </div>
              </div>
              <div className="rounded-2xl ios-glass-card p-2.5 space-y-1">
                <Smartphone className="w-4 h-4 text-[#FF4D2E] mx-auto" />
                <div className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-100">
                  Fullscreen
                </div>
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  Tanpa bar browser
                </div>
              </div>
              <div className="rounded-2xl ios-glass-card p-2.5 space-y-1">
                <Sparkles className="w-4 h-4 text-[#FF4D2E] mx-auto" />
                <div className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-100">
                  Akses Cepat
                </div>
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  1 Tap Play
                </div>
              </div>
            </div>

            {(isIOS || showManualHint) && !canNativeInstall && (
              <div className="rounded-2xl bg-black/[0.045] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] p-3.5 space-y-2 text-xs text-zinc-700 dark:text-zinc-200">
                <div className="font-semibold text-zinc-950 dark:text-white">
                  {isIOS ? 'Cara Install di Safari iOS:' : 'Cara Install lewat Browser:'}
                </div>
                {isIOS ? (
                  <ol className="space-y-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
                    <li className="flex items-center gap-2">
                      <Share className="w-3.5 h-3.5 text-[#FF4D2E] shrink-0" />
                      <span>1. Ketuk tombol <strong>Share</strong> di bar bawah Safari.</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <PlusSquare className="w-3.5 h-3.5 text-[#FF4D2E] shrink-0" />
                      <span>2. Pilih <strong>Add to Home Screen / Tambah ke Layar Utama</strong>.</span>
                    </li>
                  </ol>
                ) : (
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                    Buka menu browser (ikon titik tiga / install di address bar) lalu pilih{' '}
                    <strong>Install App / Add to Home Screen</strong>.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                onClick={() => void handleInstallClick()}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shadow-[0_8px_20px_rgba(255,77,46,0.35)]"
              >
                <Download className="w-4 h-4" />
                <span>
                  {canNativeInstall
                    ? 'Install Sekarang'
                    : isIOS
                      ? 'Mengerti, Tutup'
                      : 'Cara Install'}
                </span>
              </button>
              <button
                type="button"
                onClick={onDismiss48Hours}
                className="px-4 py-2.5 rounded-full ios-glass-pill text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-white/80 dark:hover:bg-white/[0.12] active:scale-95 transition-all"
              >
                Ingatkan 48 Jam Lagi
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
