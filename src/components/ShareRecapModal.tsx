import { AnimatePresence, motion } from 'motion/react';
import { BarChart3, Download, Share2, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import type { ListeningSummary } from '../utils/listeningStats';
import { IOS_SPRING_SHEET } from '../utils/motion';

type RecapThemeId = 'obsidian' | 'pearl' | 'crimson';

const RECAP_THEMES: Array<{
  id: RecapThemeId;
  label: string;
  bgStart: string;
  bgEnd: string;
  cardFill: string;
  cardBorder: string;
  textColor: string;
  mutedColor: string;
  previewClass: string;
}> = [
  {
    id: 'obsidian',
    label: 'Obsidian',
    bgStart: '#12131A',
    bgEnd: '#07080C',
    cardFill: 'rgba(255,255,255,0.08)',
    cardBorder: 'rgba(255,255,255,0.16)',
    textColor: '#FFFFFF',
    mutedColor: 'rgba(255,255,255,0.68)',
    previewClass: 'bg-gradient-to-br from-[#191B24] to-[#08090E] text-white border-white/15',
  },
  {
    id: 'pearl',
    label: 'Frosted iOS',
    bgStart: '#F3F4F6',
    bgEnd: '#E2E8F0',
    cardFill: 'rgba(255,255,255,0.8)',
    cardBorder: 'rgba(255,255,255,0.96)',
    textColor: '#09090B',
    mutedColor: 'rgba(24,24,27,0.64)',
    previewClass: 'bg-gradient-to-br from-[#F9FAFB] to-[#E2E8F0] text-zinc-950 border-white',
  },
  {
    id: 'crimson',
    label: 'Crimson',
    bgStart: '#4A1216',
    bgEnd: '#19080D',
    cardFill: 'rgba(255,255,255,0.1)',
    cardBorder: 'rgba(255,130,105,0.28)',
    textColor: '#FFFFFF',
    mutedColor: 'rgba(255,228,224,0.75)',
    previewClass: 'bg-gradient-to-br from-[#5B151A] to-[#1A080D] text-white border-[#FF6B4A]/30',
  },
];

interface ShareRecapModalProps {
  open: boolean;
  onClose: () => void;
  summary: ListeningSummary;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function ShareRecapModal({ open, onClose, summary }: ShareRecapModalProps) {
  const { profile, user } = useAuth();
  const { showToast } = usePlayer();
  const [themeId, setThemeId] = useState<RecapThemeId>('obsidian');
  const [exporting, setExporting] = useState(false);

  const activeTheme = RECAP_THEMES.find((t) => t.id === themeId) || RECAP_THEMES[0];
  const displayName = profile?.displayName || user?.displayName || 'Audixify Listener';
  const topArtist = summary.topArtists[0];
  const topThreeTracks = summary.topTracks.slice(0, 3);

  const renderRecapBlob = async (): Promise<Blob | null> => {
    const width = 1080;
    const height = 1350;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, activeTheme.bgStart);
    bgGrad.addColorStop(1, activeTheme.bgEnd);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width * 0.85, height * 0.14, 20, width * 0.85, height * 0.14, 540);
    glow.addColorStop(0, 'rgba(255, 77, 46, 0.24)');
    glow.addColorStop(1, 'rgba(255, 77, 46, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    const pad = 74;
    const cardW = width - pad * 2;
    const cardH = height - 210;
    const cardY = 105;

    drawRoundedRect(ctx, pad, cardY, cardW, cardH, 52);
    ctx.fillStyle = activeTheme.cardFill;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = activeTheme.cardBorder;
    ctx.stroke();

    const innerX = pad + 64;
    let cursorY = cardY + 96;

    ctx.fillStyle = '#FF4D2E';
    ctx.font = '700 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('AUDIXIFY LISTENING RECAP', innerX, cursorY);

    cursorY += 56;
    ctx.fillStyle = activeTheme.textColor;
    ctx.font = '700 48px "Bricolage Grotesque", system-ui, sans-serif';
    ctx.fillText(displayName, innerX, cursorY);

    cursorY += 86;
    // Two real stat blocks
    ctx.fillStyle = activeTheme.mutedColor;
    ctx.font = '600 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('MINUTES LISTENED', innerX, cursorY);
    ctx.fillText('TRACKS PLAYED', innerX + 410, cursorY);

    cursorY += 68;
    ctx.fillStyle = activeTheme.textColor;
    ctx.font = '700 72px "JetBrains Mono", monospace';
    ctx.fillText(String(summary.totalMinutes), innerX, cursorY);
    ctx.fillText(String(summary.totalPlays), innerX + 410, cursorY);

    cursorY += 88;
    ctx.fillStyle = activeTheme.mutedColor;
    ctx.font = '600 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('TOP ARTIST', innerX, cursorY);

    cursorY += 52;
    ctx.fillStyle = activeTheme.textColor;
    ctx.font = '700 44px "Bricolage Grotesque", system-ui, sans-serif';
    ctx.fillText(topArtist ? topArtist.name : '—', innerX, cursorY);

    cursorY += 84;
    ctx.fillStyle = activeTheme.mutedColor;
    ctx.font = '600 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('TOP SONGS', innerX, cursorY);

    cursorY += 52;
    topThreeTracks.forEach((tr, idx) => {
      ctx.fillStyle = '#FF4D2E';
      ctx.font = '700 30px "JetBrains Mono", monospace';
      ctx.fillText(`0${idx + 1}`, innerX, cursorY);

      ctx.fillStyle = activeTheme.textColor;
      ctx.font = '700 32px "Plus Jakarta Sans", system-ui, sans-serif';
      let line = `${tr.title} — ${tr.artist}`;
      while (ctx.measureText(line).width > cardW - 210 && line.length > 8) {
        line = `${line.slice(0, -2)}…`;
      }
      ctx.fillText(line, innerX + 68, cursorY);
      cursorY += 64;
    });

    const footerY = cardY + cardH - 58;
    ctx.fillStyle = activeTheme.mutedColor;
    ctx.font = '600 24px "Plus Jakarta Sans", system-ui, sans-serif';
    const sig = profile?.username
      ? `audixify.skydev.my.id · @${profile.username}`
      : 'audixify.skydev.my.id';
    ctx.fillText(sig, innerX, footerY);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png', 1);
    });
  };

  const handleDownload = async () => {
    setExporting(true);
    try {
      const blob = await renderRecapBlob();
      if (!blob) throw new Error('Render failed');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audixify-listening-recap.png';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Recap PNG saved');
    } catch {
      showToast('Unable to export recap PNG');
    } finally {
      setExporting(false);
    }
  };

  const handleShare = async () => {
    setExporting(true);
    try {
      const blob = await renderRecapBlob();
      if (blob && navigator.share) {
        const file = new File([blob], 'audixify-recap.png', { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `${displayName} — Audixify Recap`,
          });
          setExporting(false);
          return;
        }
      }
      await handleDownload();
    } catch {
      showToast('Share canceled');
    } finally {
      setExporting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="share-recap-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-2.5 sm:p-5 bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-label="Share Listening Recap"
        >
          <motion.div
            initial={{ y: 36, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 28, opacity: 0, scale: 0.96 }}
            transition={IOS_SPRING_SHEET}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-[28px] ios-glass p-5 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#FF4D2E]" />
                <h2 className="font-display text-base font-bold text-zinc-950 dark:text-white">
                  Share Listening Recap
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Recap Modal"
                className="w-8 h-8 rounded-full ios-glass-pill flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className={`rounded-[24px] border p-5 space-y-5 shadow-lg ${activeTheme.previewClass}`}>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#FF4D2E]">
                  Audixify Listening Recap
                </div>
                <div className="font-display text-lg font-bold mt-0.5 truncate">{displayName}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] uppercase opacity-65">Minutes Listened</div>
                  <div className="font-mono text-2xl font-bold tabular-nums">{summary.totalMinutes}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase opacity-65">Tracks Played</div>
                  <div className="font-mono text-2xl font-bold tabular-nums">{summary.totalPlays}</div>
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase opacity-65">Top Artist</div>
                <div className="font-display text-base font-bold truncate">
                  {topArtist ? topArtist.name : '—'}
                </div>
              </div>

              {topThreeTracks.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase opacity-65">Top Songs</div>
                  {topThreeTracks.map((tr, idx) => (
                    <div key={tr.id} className="text-xs flex items-center gap-2 truncate">
                      <span className="font-mono font-bold text-[#FF4D2E]">0{idx + 1}</span>
                      <span className="font-semibold truncate">{tr.title}</span>
                      <span className="opacity-65 truncate">· {tr.artist}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="text-[10px] font-mono opacity-65">
                {profile?.username ? `audixify.skydev.my.id · @${profile.username}` : 'audixify.skydev.my.id'}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {RECAP_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setThemeId(t.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    themeId === t.id
                      ? 'bg-[#FF4D2E] text-white border-[#FF4D2E]'
                      : 'ios-glass-pill text-zinc-700 dark:text-zinc-200 border-transparent'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={exporting}
                onClick={() => void handleShare()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shadow-md disabled:opacity-50"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{exporting ? 'Rendering...' : 'Share Recap'}</span>
              </button>
              <button
                type="button"
                disabled={exporting}
                onClick={() => void handleDownload()}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full ios-glass-pill text-xs font-semibold text-zinc-800 dark:text-zinc-100 active:scale-95 transition-all disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>PNG</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
