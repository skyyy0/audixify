import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  Copy,
  ExternalLink,
  Gift,
  Layers,
  Radio,
  Send,
  Sparkles,
  Trophy,
  Video,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { IOS_SPRING_SHEET } from '../utils/motion';

interface TikTokEventModalProps {
  open: boolean;
  onClose: () => void;
  onOpenCollageStudio?: () => void;
  onOpenListenTogether?: () => void;
}

const CAPTION_TEMPLATE =
  'Lagi dengerin musik favorit & bikin vibe bareng di Audixify! Coba sekarang di audixify.skydev.my.id #audixify #musikindonesia #streamingmusik';

const REWARD_TIERS = [
  {
    tier: 'Tier Starter',
    target: '10.000+ Views & Likes Gabungan',
    reward: 'Special Creator Shoutout + Custom Community Role',
    accent: 'from-rose-500/20 to-amber-500/15 border-rose-500/30',
  },
  {
    tier: 'Tier Rising',
    target: '50.000+ Views & Likes Gabungan',
    reward: 'Reward Spesial Creator langsung dari @sekaynotdev',
    accent: 'from-amber-500/20 to-orange-500/15 border-amber-500/30',
  },
  {
    tier: 'Tier Viral',
    target: '100.000+ Views & Likes Gabungan',
    reward: 'Grand Creator Reward Eksklusif (Klaim via Telegram)',
    accent: 'from-emerald-500/20 to-teal-500/15 border-emerald-500/30',
  },
];

export function TikTokEventModal({
  open,
  onClose,
  onOpenCollageStudio,
  onOpenListenTogether,
}: TikTokEventModalProps) {
  const { showToast } = usePlayer();
  const [copied, setCopied] = useState(false);

  const handleCopyCaption = async () => {
    try {
      await navigator.clipboard.writeText(CAPTION_TEMPLATE);
      setCopied(true);
      showToast('Caption & hashtag #audixify disalin!');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Salin tag: #audixify');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="tiktok-event-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[75] bg-black/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            key="tiktok-event-sheet"
            initial={{ y: 40, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.97 }}
            transition={IOS_SPRING_SHEET}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Event TikTok #audixify"
            className="w-full sm:max-w-xl max-h-[90dvh] overflow-y-auto rounded-t-[28px] sm:rounded-[30px] ios-glass p-5 sm:p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FF4D2E] via-rose-500 to-amber-500 text-white flex items-center justify-center shadow-lg shrink-0">
                  <Video className="w-5 h-5" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#FF4D2E]">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Official Creator Event</span>
                  </div>
                  <h2 className="font-display text-xl font-bold text-zinc-950 dark:text-white">
                    Event TikTok #audixify
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup popup event"
                className="w-9 h-9 rounded-full ios-glass-pill flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white active:scale-90 transition-all shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl ios-glass-card p-4 space-y-2 text-xs sm:text-sm text-zinc-700 dark:text-zinc-200 leading-relaxed">
              <p>
                Buat postingan <strong>TikTok</strong> sekreatif mungkin menggunakan Audixify (seperti{' '}
                <strong>Story Collage 3 Lagu</strong>, <strong>Listen Together</strong>,{' '}
                <strong>Share Lirik iOS</strong>, atau <strong>Audio Visualizer</strong>) dan wajib
                cantumkan hashtag <strong className="text-[#FF4D2E] font-mono">#audixify</strong>.
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Jika total <strong>Views + Likes</strong> postinganmu tembus target besar, langsung
                chat Telegram developer{' '}
                <a
                  href="https://t.me/sekaynotdev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[#FF4D2E] hover:underline"
                >
                  @sekaynotdev
                </a>{' '}
                sambil kirim link videonya untuk klaim reward spesial!
              </p>
            </div>

            {/* Reward Tiers */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                <Trophy className="w-4 h-4 text-amber-500" />
                <span>Target Views + Likes &amp; Reward</span>
              </div>
              <div className="space-y-2">
                {REWARD_TIERS.map((item) => (
                  <div
                    key={item.tier}
                    className={`rounded-2xl bg-gradient-to-r ${item.accent} border p-3.5 flex items-start justify-between gap-3`}
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-zinc-950 dark:text-white flex items-center gap-1.5">
                        <Gift className="w-3.5 h-3.5 text-[#FF4D2E]" />
                        <span>{item.tier}</span>
                      </div>
                      <div className="text-xs font-mono font-semibold text-zinc-700 dark:text-zinc-200">
                        {item.target}
                      </div>
                      <div className="text-[11px] text-zinc-600 dark:text-zinc-300">
                        {item.reward}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Copy Hashtag Helper */}
            <div className="rounded-2xl ios-glass-card p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                  Template Caption Siap Pakai
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopyCaption()}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full ios-glass-pill text-[11px] font-semibold text-zinc-800 dark:text-zinc-100 hover:text-[#FF4D2E] active:scale-95 transition-all"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Disalin' : 'Salin Caption & #audixify'}</span>
                </button>
              </div>
              <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 select-all leading-relaxed">
                {CAPTION_TEMPLATE}
              </p>
            </div>

            {/* Quick Content Makers + Telegram Claim CTA */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {onOpenCollageStudio && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCollageStudio();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full ios-glass-pill text-xs font-semibold text-zinc-800 dark:text-zinc-100 active:scale-95 transition-all"
                >
                  <Layers className="w-3.5 h-3.5 text-[#FF4D2E]" />
                  <span>Bikin Collage 3 Lagu</span>
                </button>
              )}

              {onOpenListenTogether && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenListenTogether();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full ios-glass-pill text-xs font-semibold text-zinc-800 dark:text-zinc-100 active:scale-95 transition-all"
                >
                  <Radio className="w-3.5 h-3.5 text-[#FF4D2E]" />
                  <span>Listen Together</span>
                </button>
              )}

              <a
                href="https://t.me/sekaynotdev"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-[210px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shadow-md"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Klaim via Telegram @sekaynotdev</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
