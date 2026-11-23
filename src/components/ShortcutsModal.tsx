import { AnimatePresence, motion } from 'motion/react';
import { Keyboard, X } from 'lucide-react';
import { useEffect } from 'react';
import { IOS_SPRING_SHEET } from '../utils/motion';

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: Array<{ keys: string[]; action: string }> = [
  { keys: ['Space'], action: 'Play or Pause active track' },
  { keys: ['←', '→'], action: 'Seek backward / forward 5 seconds' },
  { keys: ['E'], action: 'Open 5-Band Studio Equalizer' },
  { keys: ['M'], action: 'Mute or Unmute audio' },
  { keys: ['/', '⌘K'], action: 'Focus catalog search bar' },
  { keys: ['?'], action: 'Toggle this shortcuts guide' },
  { keys: ['Esc'], action: 'Close Now Playing or active modal' },
];

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="shortcuts-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[79] flex items-end sm:items-center justify-center p-2.5 sm:p-5 bg-black/55"
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard Shortcuts"
        >
          <motion.div
            initial={{ y: 36, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 28, opacity: 0, scale: 0.96 }}
            transition={IOS_SPRING_SHEET}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-[28px] ios-glass p-5 sm:p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#FF4D2E]/15 text-[#FF4D2E] flex items-center justify-center">
                  <Keyboard className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-display text-base font-bold text-zinc-950 dark:text-white">
                    Keyboard Shortcuts
                  </h2>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Fast desktop playback &amp; navigation controls
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close keyboard shortcuts"
                className="w-8 h-8 rounded-full ios-glass-pill flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl ios-glass-card divide-y divide-black/[0.05] dark:divide-white/[0.07]">
              {SHORTCUTS.map((item) => (
                <div
                  key={item.action}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <span className="text-zinc-700 dark:text-zinc-200">{item.action}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {item.keys.map((k) => (
                      <kbd
                        key={k}
                        className="px-2 py-0.5 rounded-lg bg-black/[0.06] dark:bg-white/[0.1] border border-black/[0.08] dark:border-white/[0.12] font-mono text-[11px] font-semibold text-zinc-900 dark:text-zinc-100"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
