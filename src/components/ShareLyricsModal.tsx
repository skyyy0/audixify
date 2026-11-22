import { AnimatePresence, motion } from 'motion/react';
import { Check, Copy, Download, Share2, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import type { Track } from '../types/music';
import { IOS_SPRING_SHEET } from '../utils/motion';
import { Artwork } from './Artwork';

type CardThemeId = 'obsidian' | 'pearl' | 'crimson' | 'cobalt';

interface CardTheme {
  id: CardThemeId;
  label: string;
  bgStart: string;
  bgEnd: string;
  cardFill: string;
  cardBorder: string;
  textColor: string;
  mutedColor: string;
  accentColor: string;
  previewClass: string;
}

const CARD_THEMES: CardTheme[] = [
  {
    id: 'obsidian',
    label: 'Obsidian',
    bgStart: '#12131A',
    bgEnd: '#07080C',
    cardFill: 'rgba(255,255,255,0.08)',
    cardBorder: 'rgba(255,255,255,0.16)',
    textColor: '#FFFFFF',
    mutedColor: 'rgba(255,255,255,0.66)',
    accentColor: '#FF4D2E',
    previewClass: 'bg-gradient-to-br from-[#191B24] to-[#08090E] text-white border-white/15',
  },
  {
    id: 'pearl',
    label: 'Frosted iOS',
    bgStart: '#F3F4F6',
    bgEnd: '#E2E8F0',
    cardFill: 'rgba(255,255,255,0.78)',
    cardBorder: 'rgba(255,255,255,0.95)',
    textColor: '#09090B',
    mutedColor: 'rgba(24,24,27,0.64)',
    accentColor: '#FF4D2E',
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
    accentColor: '#FF6B4A',
    previewClass: 'bg-gradient-to-br from-[#5B151A] to-[#1A080D] text-white border-[#FF6B4A]/30',
  },
  {
    id: 'cobalt',
    label: 'Midnight',
    bgStart: '#111C3A',
    bgEnd: '#090D1A',
    cardFill: 'rgba(255,255,255,0.09)',
    cardBorder: 'rgba(147,197,253,0.24)',
    textColor: '#FFFFFF',
    mutedColor: 'rgba(219,234,254,0.7)',
    accentColor: '#38BDF8',
    previewClass: 'bg-gradient-to-br from-[#16244A] to-[#080C18] text-white border-sky-300/25',
  },
];

interface ShareLyricsModalProps {
  open: boolean;
  onClose: () => void;
  track: Track;
  lyricLines: string[];
  initialLineIndex: number;
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

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      out.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) out.push(current);
  return out;
}

function loadCorsSafeImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => resolve(null), 2600);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

export function ShareLyricsModal({
  open,
  onClose,
  track,
  lyricLines,
  initialLineIndex,
}: ShareLyricsModalProps) {
  const { showToast } = usePlayer();
  const { profile } = useAuth();

  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [themeId, setThemeId] = useState<CardThemeId>('obsidian');
  const [ratio, setRatio] = useState<'story' | 'square'>('story');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!open || lyricLines.length === 0) return;
    const base = Math.max(0, Math.min(initialLineIndex, lyricLines.length - 1));
    const initial = [base];
    if (base + 1 < lyricLines.length) initial.push(base + 1);
    setSelectedIndices(initial);
  }, [open, initialLineIndex, lyricLines.length]);

  const selectedTexts = useMemo(
    () =>
      [...selectedIndices]
        .sort((a, b) => a - b)
        .map((i) => lyricLines[i])
        .filter(Boolean),
    [selectedIndices, lyricLines],
  );

  const activeTheme = CARD_THEMES.find((t) => t.id === themeId) || CARD_THEMES[0];

  const toggleLine = (idx: number) => {
    setSelectedIndices((prev) => {
      if (prev.includes(idx)) {
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== idx);
      }
      if (prev.length >= 4) {
        showToast('Maksimal 4 baris lirik per kartu');
        return prev;
      }
      return [...prev, idx].sort((a, b) => a - b);
    });
  };

  const renderCardBlob = async (): Promise<Blob | null> => {
    const width = 1080;
    const height = ratio === 'story' ? 1350 : 1080;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, activeTheme.bgStart);
    bgGrad.addColorStop(1, activeTheme.bgEnd);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Subtle ambient coral glow
    const rad = ctx.createRadialGradient(width * 0.8, height * 0.15, 20, width * 0.8, height * 0.15, 540);
    rad.addColorStop(0, 'rgba(255, 77, 46, 0.22)');
    rad.addColorStop(1, 'rgba(255, 77, 46, 0)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, width, height);

    // Inner iOS Liquid Glass Card
    const cardPad = 76;
    const cardX = cardPad;
    const cardY = ratio === 'story' ? 115 : 82;
    const cardW = width - cardPad * 2;
    const cardH = height - cardY * 2;

    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 54);
    ctx.fillStyle = activeTheme.cardFill;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = activeTheme.cardBorder;
    ctx.stroke();

    // Artwork thumbnail top-left inside card
    const artSize = 128;
    const innerX = cardX + 64;
    const innerY = cardY + 64;

    const artImg = await loadCorsSafeImage(track.artwork);
    ctx.save();
    drawRoundedRect(ctx, innerX, innerY, artSize, artSize, 28);
    ctx.clip();
    if (artImg) {
      ctx.drawImage(artImg, innerX, innerY, artSize, artSize);
    } else {
      const tileGrad = ctx.createLinearGradient(innerX, innerY, innerX + artSize, innerY + artSize);
      tileGrad.addColorStop(0, '#FF4D2E');
      tileGrad.addColorStop(1, '#991B1B');
      ctx.fillStyle = tileGrad;
      ctx.fillRect(innerX, innerY, artSize, artSize);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 54px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((track.title[0] || 'A').toUpperCase(), innerX + artSize / 2, innerY + artSize / 2);
    }
    ctx.restore();

    // Track title & artist beside artwork
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = activeTheme.textColor;
    ctx.font = '700 38px "Plus Jakarta Sans", system-ui, sans-serif';
    const metaX = innerX + artSize + 30;
    const metaMaxW = cardX + cardW - 64 - metaX;
    let titleText = track.title;
    while (ctx.measureText(titleText).width > metaMaxW && titleText.length > 4) {
      titleText = `${titleText.slice(0, -2)}…`;
    }
    ctx.fillText(titleText, metaX, innerY + 56);

    ctx.fillStyle = activeTheme.mutedColor;
    ctx.font = '500 28px "Plus Jakarta Sans", system-ui, sans-serif';
    let artistText = track.artist;
    while (ctx.measureText(artistText).width > metaMaxW && artistText.length > 4) {
      artistText = `${artistText.slice(0, -2)}…`;
    }
    ctx.fillText(artistText, metaX, innerY + 100);

    // Lyrics quote body
    const quoteTop = innerY + artSize + 72;
    const quoteMaxW = cardW - 128;
    const lineFontSize = selectedTexts.length >= 4 ? 44 : selectedTexts.length === 3 ? 48 : 54;
    const lineHeight = Math.round(lineFontSize * 1.32);
    ctx.font = `700 ${lineFontSize}px "Bricolage Grotesque", "Plus Jakarta Sans", system-ui, sans-serif`;
    ctx.fillStyle = activeTheme.textColor;

    let cursorY = quoteTop;
    const quoteBottomLimit = cardY + cardH - 130;
    for (const rawLine of selectedTexts) {
      const wrapped = wrapTextLines(ctx, rawLine, quoteMaxW);
      for (const wLine of wrapped) {
        if (cursorY > quoteBottomLimit) break;
        ctx.fillText(wLine, innerX, cursorY);
        cursorY += lineHeight;
      }
      cursorY += 16;
    }

    // Footer watermark inside card
    const footerY = cardY + cardH - 58;
    ctx.fillStyle = activeTheme.accentColor;
    drawRoundedRect(ctx, innerX, footerY - 28, 34, 34, 9);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(innerX + 10, footerY - 18);
    ctx.lineTo(innerX + 24, footerY - 4);
    ctx.moveTo(innerX + 24, footerY - 18);
    ctx.lineTo(innerX + 10, footerY - 4);
    ctx.stroke();

    ctx.fillStyle = activeTheme.mutedColor;
    ctx.font = '600 24px "Plus Jakarta Sans", system-ui, sans-serif';
    const sig = profile?.username ? `Audixify · @${profile.username}` : 'Audixify Lyrics';
    ctx.fillText(sig, innerX + 48, footerY - 3);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png', 1);
    });
  };

  const handleDownloadPng = async () => {
    setExporting(true);
    try {
      const blob = await renderCardBlob();
      if (!blob) throw new Error('Render failed');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audixify-lyrics-${track.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Kartu lirik PNG tersimpan');
    } catch {
      showToast('Gagal mengekspor gambar lirik');
    } finally {
      setExporting(false);
    }
  };

  const handleNativeShare = async () => {
    setExporting(true);
    try {
      const blob = await renderCardBlob();
      if (blob && navigator.share) {
        const file = new File([blob], 'audixify-lyrics.png', { type: 'image/png' });
        const canShareFile = navigator.canShare?.({ files: [file] });
        if (canShareFile) {
          await navigator.share({
            files: [file],
            title: `${track.title} — ${track.artist}`,
            text: `"${selectedTexts.join(' / ')}" — ${track.title} di Audixify`,
          });
          setExporting(false);
          return;
        }
      }
      await handleDownloadPng();
    } catch {
      showToast('Share dibatalkan');
    } finally {
      setExporting(false);
    }
  };

  const handleCopyQuote = async () => {
    const quote = `"${selectedTexts.join('\n')}"\n— ${track.title}, ${track.artist} (Audixify)`;
    try {
      await navigator.clipboard.writeText(quote);
      showToast('Teks lirik disalin');
    } catch {
      showToast('Tidak dapat menyalin teks');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="share-lyrics-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-2.5 sm:p-5 bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-label="Share Lyrics Card"
        >
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 32, opacity: 0, scale: 0.96 }}
            transition={IOS_SPRING_SHEET}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-[28px] ios-glass p-4 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#FF4D2E]" />
                <h2 className="font-display text-base sm:text-lg font-bold text-zinc-950 dark:text-white">
                  Share Lyrics Card
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup"
                className="w-8 h-8 rounded-full ios-glass-pill flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
              {/* Live iOS Card Preview */}
              <div className="md:col-span-6 space-y-3">
                <div
                  className={`rounded-[26px] border p-5 shadow-xl transition-colors duration-200 ${activeTheme.previewClass} ${
                    ratio === 'story' ? 'aspect-[4/5]' : 'aspect-square'
                  } flex flex-col justify-between`}
                >
                  <div className="flex items-center gap-3">
                    <Artwork
                      src={track.artwork}
                      alt={track.title}
                      className="w-12 h-12 shrink-0 shadow-md"
                      rounded="rounded-xl"
                      thumb
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate">{track.title}</div>
                      <div className="text-xs opacity-70 truncate">{track.artist}</div>
                    </div>
                  </div>

                  <div className="space-y-2 my-auto py-3">
                    {selectedTexts.map((line, i) => (
                      <p
                        key={i}
                        className="font-display text-base sm:text-lg font-bold leading-snug line-clamp-2"
                      >
                        {line}
                      </p>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] font-semibold opacity-75">
                    <span className="w-4 h-4 rounded-[5px] bg-[#FF4D2E] inline-block" />
                    <span>{profile?.username ? `Audixify · @${profile.username}` : 'Audixify'}</span>
                  </div>
                </div>

                {/* Theme & Aspect Ratio Pickers */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {CARD_THEMES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setThemeId(t.id)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                          themeId === t.id
                            ? 'bg-[#FF4D2E] text-white border-[#FF4D2E]'
                            : 'ios-glass-pill text-zinc-700 dark:text-zinc-200 border-transparent'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 ios-glass-pill p-0.5 rounded-full text-[11px]">
                    <button
                      type="button"
                      onClick={() => setRatio('story')}
                      className={`px-2.5 py-0.5 rounded-full font-medium ${
                        ratio === 'story' ? 'bg-white dark:bg-white/20 text-zinc-950 dark:text-white' : 'text-zinc-500'
                      }`}
                    >
                      4:5
                    </button>
                    <button
                      type="button"
                      onClick={() => setRatio('square')}
                      className={`px-2.5 py-0.5 rounded-full font-medium ${
                        ratio === 'square' ? 'bg-white dark:bg-white/20 text-zinc-950 dark:text-white' : 'text-zinc-500'
                      }`}
                    >
                      1:1
                    </button>
                  </div>
                </div>
              </div>

              {/* Line Selector */}
              <div className="md:col-span-6 space-y-2.5">
                <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  Pilih 1–4 baris lirik ({selectedIndices.length}/4):
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                  {lyricLines.map((line, idx) => {
                    const selected = selectedIndices.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleLine(idx)}
                        className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-2xl text-left text-xs transition-all ${
                          selected
                            ? 'bg-[#FF4D2E]/15 text-zinc-950 dark:text-white ring-1 ring-[#FF4D2E]/50 font-semibold'
                            : 'ios-glass-card text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white'
                        }`}
                      >
                        <span
                          className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 border ${
                            selected
                              ? 'bg-[#FF4D2E] border-[#FF4D2E] text-white'
                              : 'border-zinc-400/50'
                          }`}
                        >
                          {selected && <Check className="w-2.5 h-2.5" />}
                        </span>
                        <span className="leading-snug">{line}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    disabled={exporting || selectedTexts.length === 0}
                    onClick={() => void handleNativeShare()}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shadow-md disabled:opacity-50"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>{exporting ? 'Rendering...' : 'Share Card'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={exporting || selectedTexts.length === 0}
                    onClick={() => void handleDownloadPng()}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full ios-glass-pill text-xs font-semibold text-zinc-800 dark:text-zinc-100 active:scale-95 transition-all disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PNG</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyQuote()}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-full ios-glass-pill text-xs font-medium text-zinc-600 dark:text-zinc-300 active:scale-95 transition-all"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
