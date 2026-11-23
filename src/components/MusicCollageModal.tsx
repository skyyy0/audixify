import { AnimatePresence, motion } from 'motion/react';
import {
  AudioWaveform,
  Camera,
  Check,
  Download,
  Heart,
  ImagePlus,
  Layers,
  Pause,
  Plus,
  Search,
  Share2,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume1,
  Volume2,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { usePlayer } from '../context/PlayerContext';
import type { DiscoverPayload, SearchPayload, Track } from '../types/music';
import { apiFetch } from '../utils/apiFetch';
import {
  drawImageCover,
  drawRoundedRect,
  loadCorsSafeImage,
  truncateCanvasText,
} from '../utils/canvasImage';
import { formatDuration } from '../utils/format';
import { IOS_SPRING_SHEET } from '../utils/motion';

export type CollageLayoutId = 'frame-3' | 'diagonal-3' | 'corners-4';
export type CollageCardThemeId = 'obsidian' | 'frosted';

interface CardSlotPlacement {
  x: number; // on 1080x1920 virtual canvas
  y: number;
  w: number;
  rotDeg: number;
  sparkleCorner: 'tr' | 'tl';
}

const LAYOUT_PRESETS: Record<
  CollageLayoutId,
  { label: string; count: 3 | 4; placements: CardSlotPlacement[] }
> = {
  'frame-3': {
    label: '3 Kartu · Bingkai',
    count: 3,
    placements: [
      { x: 52, y: 205, w: 424, rotDeg: -5.5, sparkleCorner: 'tr' },
      { x: 604, y: 150, w: 424, rotDeg: 5, sparkleCorner: 'tr' },
      { x: 590, y: 970, w: 424, rotDeg: -4.2, sparkleCorner: 'tr' },
    ],
  },
  'diagonal-3': {
    label: '3 Kartu · Diagonal',
    count: 3,
    placements: [
      { x: 54, y: 195, w: 424, rotDeg: -5.5, sparkleCorner: 'tr' },
      { x: 602, y: 595, w: 424, rotDeg: 5.5, sparkleCorner: 'tr' },
      { x: 60, y: 1030, w: 424, rotDeg: -4.5, sparkleCorner: 'tr' },
    ],
  },
  'corners-4': {
    label: '4 Kartu · 4 Sudut',
    count: 4,
    placements: [
      { x: 48, y: 215, w: 416, rotDeg: -5.5, sparkleCorner: 'tr' },
      { x: 616, y: 155, w: 416, rotDeg: 5.5, sparkleCorner: 'tr' },
      { x: 52, y: 1025, w: 416, rotDeg: -4.5, sparkleCorner: 'tr' },
      { x: 612, y: 965, w: 416, rotDeg: 4.2, sparkleCorner: 'tr' },
    ],
  },
};

const CARD_HEIGHT_RATIO = 1.46; // Card height ≈ 620px when width = 424px on 1080x1920

interface CollageSlotState {
  track: Track | null;
  liked: boolean;
  progressRatio: number;
}

const DEFAULT_PROGRESS_PRESETS = [0.34, 0.42, 0.68, 0.54];

interface MusicCollageModalProps {
  open: boolean;
  onClose: () => void;
  discoverData: DiscoverPayload | null;
}

async function readGalleryPhotoAsDataUrl(file: File): Promise<string> {
  const rawUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = rawUrl;
    });
    // Cap longest edge to 1920px so mobile memory stays light while preserving crisp 1080x1920 export
    const maxEdge = 1920;
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const tw = Math.max(1, Math.round((img.naturalWidth || 1080) * scale));
    const th = Math.max(1, Math.round((img.naturalHeight || 1920) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(img, 0, 0, tw, th);
    return canvas.toDataURL('image/jpeg', 0.92);
  } finally {
    URL.revokeObjectURL(rawUrl);
  }
}

function drawFourPointSparkle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  alpha = 0.95,
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.9);
  glow.addColorStop(0, `rgba(255,255,255,${alpha})`);
  glow.addColorStop(0.28, `rgba(255,255,255,${alpha * 0.45})`);
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.9, 0, Math.PI * 2);
  ctx.fill();

  const arm = radius;
  const waist = Math.max(2.5, radius * 0.11);
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.beginPath();
  ctx.moveTo(0, -arm);
  ctx.quadraticCurveTo(waist, -waist, arm, 0);
  ctx.quadraticCurveTo(waist, waist, 0, arm);
  ctx.quadraticCurveTo(-waist, waist, -arm, 0);
  ctx.quadraticCurveTo(-waist, -waist, 0, -arm);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function formatSlotTimestamps(track: Track | null, progressRatio: number): [string, string] {
  const dur = track?.durationSec && track.durationSec > 0 ? track.durationSec : 225;
  const elapsed = Math.max(8, Math.min(dur - 8, Math.round(dur * progressRatio)));
  const remaining = Math.max(0, dur - elapsed);
  return [formatDuration(elapsed), `-${formatDuration(remaining)}`];
}

export function MusicCollageModal({ open, onClose, discoverData }: MusicCollageModalProps) {
  const { currentTrack, recentTracks, likedTracks, showToast } = usePlayer();

  const [layoutId, setLayoutId] = useState<CollageLayoutId>('frame-3');
  const [cardTheme, setCardTheme] = useState<CollageCardThemeId>('obsidian');
  const [sparkles, setSparkles] = useState(true);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoBlur, setPhotoBlur] = useState(1);
  const [photoDim, setPhotoDim] = useState(18);
  const [photoZoom, setPhotoZoom] = useState(100);
  const [exporting, setExporting] = useState(false);

  const [slots, setSlots] = useState<CollageSlotState[]>([
    { track: null, liked: false, progressRatio: 0.34 },
    { track: null, liked: true, progressRatio: 0.42 },
    { track: null, liked: false, progressRatio: 0.68 },
    { track: null, liked: false, progressRatio: 0.54 },
  ]);

  const [pickerSlotIdx, setPickerSlotIdx] = useState<number | null>(null);
  const [pickerTab, setPickerTab] = useState<'trending' | 'liked' | 'recent'>('trending');
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerResults, setPickerResults] = useState<Track[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const [stageScale, setStageScale] = useState(0.82);

  // Measure preview wrapper cleanly so the 360x640 virtual stage scales proportionally without overflow
  useEffect(() => {
    if (!open) return;
    const el = stageContainerRef.current;
    if (!el) return;
    const updateScale = () => {
      const availW = el.clientWidth;
      if (availW > 0) {
        setStageScale(Math.min(1, availW / 360));
      }
    };
    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pickerSlotIdx !== null) setPickerSlotIdx(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, pickerSlotIdx]);

  // Real catalog pool from user's history/likes + live Discover catalog
  const catalogPool = useMemo(() => {
    const seen = new Set<string>();
    const out: Track[] = [];
    const pushAll = (arr?: Track[]) => {
      if (!arr) return;
      for (const t of arr) {
        if (!t?.id || seen.has(t.id)) continue;
        seen.add(t.id);
        out.push(t);
      }
    };
    if (currentTrack) pushAll([currentTrack]);
    pushAll(recentTracks);
    pushAll(likedTracks);
    pushAll(discoverData?.indonesiaTop);
    pushAll(discoverData?.globalTop);
    pushAll(discoverData?.asiaSpotlight);
    pushAll(discoverData?.indonesiaIndie);
    pushAll(discoverData?.indonesiaLegends);
    return out;
  }, [currentTrack, recentTracks, likedTracks, discoverData]);

  // Seed empty slots once with real available tracks (zero fake songs)
  useEffect(() => {
    if (!open || catalogPool.length === 0) return;
    setSlots((prev) => {
      if (prev.some((s) => s.track !== null)) return prev;
      return prev.map((s, idx) => ({
        ...s,
        track: catalogPool[idx] || null,
        progressRatio: DEFAULT_PROGRESS_PRESETS[idx] ?? 0.4,
      }));
    });
  }, [open, catalogPool]);

  // Live /api/search inside Track Slot Picker
  useEffect(() => {
    if (pickerSlotIdx === null) return;
    const trimmed = pickerQuery.trim();
    if (!trimmed) {
      setPickerResults([]);
      setPickerLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setPickerLoading(true);
      apiFetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error('Search failed');
          return (await res.json()) as SearchPayload;
        })
        .then((json) => {
          setPickerResults(json.tracks ?? []);
          setPickerLoading(false);
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return;
          setPickerLoading(false);
        });
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [pickerQuery, pickerSlotIdx]);

  const layout = LAYOUT_PRESETS[layoutId];
  const activeSlots = slots.slice(0, layout.count);

  const handlePhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Pilih file foto (JPG, PNG, WebP)');
      return;
    }
    try {
      const dataUrl = await readGalleryPhotoAsDataUrl(file);
      setPhotoDataUrl(dataUrl);
      showToast('Foto galeri dimuat');
    } catch {
      showToast('Gagal membaca foto dari galeri');
    }
  };

  const assignTrackToSlot = (slotIndex: number, track: Track) => {
    setSlots((prev) =>
      prev.map((s, i) => (i === slotIndex ? { ...s, track } : s)),
    );
    setPickerSlotIdx(null);
    setPickerQuery('');
  };

  const toggleSlotLike = (slotIndex: number) => {
    setSlots((prev) =>
      prev.map((s, i) => (i === slotIndex ? { ...s, liked: !s.liked } : s)),
    );
  };

  const cycleSlotProgress = (slotIndex: number) => {
    const steps = [0.22, 0.36, 0.55, 0.74];
    setSlots((prev) =>
      prev.map((s, i) => {
        if (i !== slotIndex) return s;
        const curIdx = steps.findIndex((v) => Math.abs(v - s.progressRatio) < 0.08);
        const nextVal = steps[(curIdx + 1) % steps.length];
        return { ...s, progressRatio: nextVal };
      }),
    );
  };

  const renderCollagePngBlob = async (): Promise<Blob | null> => {
    const W = 1080;
    const H = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 1. Background Gallery Photo (or dark studio radial backdrop)
    if (photoDataUrl) {
      const bgImg = await loadCorsSafeImage(photoDataUrl);
      if (bgImg) {
        ctx.save();
        if (photoBlur > 0) {
          ctx.filter = `blur(${Math.round(photoBlur * 2.4)}px)`;
        }
        // Overscan slightly when blurring so edges stay crisp without transparent fringes
        const blurPad = photoBlur > 0 ? 48 : 0;
        drawImageCover(
          ctx,
          bgImg,
          -blurPad,
          -blurPad,
          W + blurPad * 2,
          H + blurPad * 2,
          photoZoom / 100,
        );
        ctx.restore();
      }
    } else {
      const fallbackBg = ctx.createLinearGradient(0, 0, W, H);
      fallbackBg.addColorStop(0, '#1B2234');
      fallbackBg.addColorStop(0.5, '#11141E');
      fallbackBg.addColorStop(1, '#090B11');
      ctx.fillStyle = fallbackBg;
      ctx.fillRect(0, 0, W, H);

      const coralGlow = ctx.createRadialGradient(W * 0.5, H * 0.46, 30, W * 0.5, H * 0.46, 620);
      coralGlow.addColorStop(0, 'rgba(255, 77, 46, 0.24)');
      coralGlow.addColorStop(1, 'rgba(255, 77, 46, 0)');
      ctx.fillStyle = coralGlow;
      ctx.fillRect(0, 0, W, H);
    }

    // 2. Dim / Vignette Overlay so floating cards pop clearly
    if (photoDim > 0) {
      ctx.fillStyle = `rgba(6, 8, 13, ${(photoDim / 100).toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }
    const bottomGrad = ctx.createLinearGradient(0, H * 0.65, 0, H);
    bottomGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    bottomGrad.addColorStop(1, 'rgba(0, 0, 0, 0.56)');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, H * 0.65, W, H * 0.35);

    // 3. Ambient Top Sparkles (matches reference screenshot atmosphere)
    if (sparkles) {
      drawFourPointSparkle(ctx, W * 0.51, 108, 36, 0.85);
      drawFourPointSparkle(ctx, W * 0.74, 88, 52, 0.92);
    }

    // 4. Preload all card artwork images concurrently via CORS-safe loader
    const loadedArtworks = await Promise.all(
      activeSlots.map((slot) => loadCorsSafeImage(slot.track?.artwork)),
    );

    const isObsidian = cardTheme === 'obsidian';
    const cardFill = isObsidian ? 'rgba(13, 15, 21, 0.88)' : 'rgba(250, 250, 252, 0.88)';
    const cardBorder = isObsidian ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.95)';
    const primaryTxt = isObsidian ? '#FFFFFF' : '#09090B';
    const mutedTxt = isObsidian ? 'rgba(255,255,255,0.62)' : 'rgba(24,24,27,0.58)';
    const trackRail = isObsidian ? 'rgba(255,255,255,0.22)' : 'rgba(24,24,27,0.18)';
    const trackActive = isObsidian ? '#FFFFFF' : '#18181B';

    // 5. Render each floating tilted mini-player card
    for (let i = 0; i < layout.placements.length; i++) {
      const pos = layout.placements[i];
      const slot = activeSlots[i];
      const track = slot?.track;
      const artImg = loadedArtworks[i];

      const cardW = pos.w;
      const cardH = Math.round(cardW * CARD_HEIGHT_RATIO);
      const cx = pos.x + cardW / 2;
      const cy = pos.y + cardH / 2;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((pos.rotDeg * Math.PI) / 180);
      ctx.translate(-cardW / 2, -cardH / 2);

      // Card outer shadow + surface
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.52)';
      ctx.shadowBlur = 42;
      ctx.shadowOffsetY = 18;
      drawRoundedRect(ctx, 0, 0, cardW, cardH, 34);
      ctx.fillStyle = cardFill;
      ctx.fill();
      ctx.restore();

      drawRoundedRect(ctx, 0, 0, cardW, cardH, 34);
      ctx.lineWidth = 2;
      ctx.strokeStyle = cardBorder;
      ctx.stroke();

      // Square Album Cover
      const pad = 28;
      const artSize = cardW - pad * 2;
      ctx.save();
      drawRoundedRect(ctx, pad, pad, artSize, artSize, 22);
      ctx.clip();
      if (artImg) {
        drawImageCover(ctx, artImg, pad, pad, artSize, artSize, 1);
      } else {
        const g = ctx.createLinearGradient(pad, pad, pad + artSize, pad + artSize);
        g.addColorStop(0, '#FF4D2E');
        g.addColorStop(1, '#1E293B');
        ctx.fillStyle = g;
        ctx.fillRect(pad, pad, artSize, artSize);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = '700 88px "Bricolage Grotesque", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          (track?.title?.[0] || 'A').toUpperCase(),
          pad + artSize / 2,
          pad + artSize / 2,
        );
      }
      ctx.restore();

      // Micro Waveform Glyph + "Audixify" Brand Caption
      const metaTop = pad + artSize + 24;
      ctx.save();
      ctx.strokeStyle = mutedTxt;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pad, metaTop);
      ctx.quadraticCurveTo(pad + 5, metaTop - 7, pad + 10, metaTop);
      ctx.quadraticCurveTo(pad + 15, metaTop + 7, pad + 20, metaTop);
      ctx.stroke();
      ctx.fillStyle = mutedTxt;
      ctx.font = '600 18px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('Audixify', pad + 27, metaTop);
      ctx.restore();

      // Title + Artist + Heart Icon
      const titleY = metaTop + 32;
      const heartX = cardW - pad - 18;
      const textMaxW = heartX - pad - 24;

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = primaryTxt;
      ctx.font = '700 28px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(
        truncateCanvasText(ctx, track?.title || 'Pilih Lagu', textMaxW),
        pad,
        titleY,
      );

      ctx.fillStyle = mutedTxt;
      ctx.font = '500 21px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(
        truncateCanvasText(ctx, track?.artist || 'Tap untuk memilih', textMaxW),
        pad,
        titleY + 28,
      );

      // Crisp Vector Heart on Right
      ctx.save();
      const hy = titleY + 2;
      ctx.translate(heartX, hy);
      ctx.beginPath();
      ctx.moveTo(0, 7);
      ctx.bezierCurveTo(-13, -3, -15, -13, -7, -15);
      ctx.bezierCurveTo(-2, -16, 0, -11, 0, -11);
      ctx.bezierCurveTo(0, -11, 2, -16, 7, -15);
      ctx.bezierCurveTo(15, -13, 13, -3, 0, 7);
      ctx.closePath();
      if (slot?.liked) {
        ctx.fillStyle = '#FF4D2E';
        ctx.fill();
      } else {
        ctx.strokeStyle = primaryTxt;
        ctx.lineWidth = 2.4;
        ctx.stroke();
      }
      ctx.restore();

      // Playback Scrubber Bar + Timestamps
      const barY = titleY + 56;
      const barW = cardW - pad * 2;
      const ratio = slot?.progressRatio ?? 0.4;
      const dotX = pad + barW * ratio;

      ctx.fillStyle = trackRail;
      drawRoundedRect(ctx, pad, barY - 2, barW, 4, 2);
      ctx.fill();

      ctx.fillStyle = trackActive;
      drawRoundedRect(ctx, pad, barY - 2, barW * ratio, 4, 2);
      ctx.fill();

      ctx.fillStyle = trackActive;
      ctx.beginPath();
      ctx.arc(dotX, barY, 7, 0, Math.PI * 2);
      ctx.fill();

      const [tLeft, tRight] = formatSlotTimestamps(track, ratio);
      ctx.fillStyle = mutedTxt;
      ctx.font = '500 17px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(tLeft, pad, barY + 24);
      ctx.textAlign = 'right';
      ctx.fillText(tRight, cardW - pad, barY + 24);

      // Transport Controls (SkipBack, Pause, SkipForward)
      const ctrlY = barY + 56;
      const midX = cardW / 2;
      ctx.fillStyle = primaryTxt;

      // Pause (two rounded bars)
      drawRoundedRect(ctx, midX - 11, ctrlY - 14, 7, 28, 3);
      ctx.fill();
      drawRoundedRect(ctx, midX + 4, ctrlY - 14, 7, 28, 3);
      ctx.fill();

      // SkipBack (bar + double triangle left)
      const sbX = midX - 66;
      drawRoundedRect(ctx, sbX - 16, ctrlY - 12, 4, 24, 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sbX - 12, ctrlY);
      ctx.lineTo(sbX + 4, ctrlY - 11);
      ctx.lineTo(sbX + 4, ctrlY + 11);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sbX + 2, ctrlY);
      ctx.lineTo(sbX + 18, ctrlY - 11);
      ctx.lineTo(sbX + 18, ctrlY + 11);
      ctx.closePath();
      ctx.fill();

      // SkipForward (double triangle right + bar)
      const sfX = midX + 66;
      drawRoundedRect(ctx, sfX + 12, ctrlY - 12, 4, 24, 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sfX + 12, ctrlY);
      ctx.lineTo(sfX - 4, ctrlY - 11);
      ctx.lineTo(sfX - 4, ctrlY + 11);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sfX - 2, ctrlY);
      ctx.lineTo(sfX - 18, ctrlY - 11);
      ctx.lineTo(sfX - 18, ctrlY + 11);
      ctx.closePath();
      ctx.fill();

      // Bottom Mini Volume Rail
      const volY = ctrlY + 40;
      ctx.fillStyle = mutedTxt;
      ctx.beginPath();
      ctx.moveTo(pad, volY - 4);
      ctx.lineTo(pad + 5, volY - 4);
      ctx.lineTo(pad + 11, volY - 9);
      ctx.lineTo(pad + 11, volY + 9);
      ctx.lineTo(pad + 5, volY + 4);
      ctx.lineTo(pad, volY + 4);
      ctx.closePath();
      ctx.fill();

      const volBarX = pad + 26;
      const volBarW = barW - 56;
      ctx.fillStyle = trackRail;
      drawRoundedRect(ctx, volBarX, volY - 2, volBarW, 4, 2);
      ctx.fill();
      ctx.fillStyle = trackActive;
      drawRoundedRect(ctx, volBarX, volY - 2, volBarW * 0.65, 4, 2);
      ctx.fill();

      // Right speaker cone + wave
      const spX = cardW - pad - 14;
      ctx.fillStyle = mutedTxt;
      ctx.beginPath();
      ctx.moveTo(spX, volY - 4);
      ctx.lineTo(spX + 4, volY - 4);
      ctx.lineTo(spX + 9, volY - 9);
      ctx.lineTo(spX + 9, volY + 9);
      ctx.lineTo(spX + 4, volY + 4);
      ctx.lineTo(spX, volY + 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = mutedTxt;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(spX + 10, volY, 5, -0.7, 0.7);
      ctx.stroke();

      // Corner Sparkle Flare
      if (sparkles) {
        const sx = pos.sparkleCorner === 'tr' ? cardW - 14 : 14;
        drawFourPointSparkle(ctx, sx, 14, i % 2 === 0 ? 44 : 58, 0.96);
      }

      ctx.restore();
    }

    // 6. Centered Bottom Audixify Brand Lockup
    const brandY = H - 185;
    ctx.font = '700 50px "Bricolage Grotesque", "Plus Jakarta Sans", system-ui, sans-serif';
    const word = 'Audixify';
    const wordW = ctx.measureText(word).width;
    const iconBox = 66;
    const gap = 20;
    const lockupW = iconBox + gap + wordW;
    const startX = (W - lockupW) / 2;

    // Rounded-square Audixify Emblem
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 20;
    const badgeGrad = ctx.createLinearGradient(startX, brandY - iconBox / 2, startX + iconBox, brandY + iconBox / 2);
    badgeGrad.addColorStop(0, '#FF4D2E');
    badgeGrad.addColorStop(1, '#D92B11');
    drawRoundedRect(ctx, startX, brandY - iconBox / 2, iconBox, iconBox, 18);
    ctx.fillStyle = badgeGrad;
    ctx.fill();
    ctx.restore();

    // Inner Audixify 'X / Wave' stroke inside emblem
    ctx.save();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 6.5;
    ctx.lineCap = 'round';
    const bx = startX + iconBox / 2;
    const by = brandY;
    ctx.beginPath();
    ctx.moveTo(bx - 13, by - 13);
    ctx.lineTo(bx + 13, by + 13);
    ctx.moveTo(bx + 13, by - 13);
    ctx.lineTo(bx - 13, by + 13);
    ctx.stroke();
    ctx.restore();

    // Brand Wordmark
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(word, startX + iconBox + gap, brandY + 2);
    ctx.restore();

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png', 1);
    });
  };

  const handleDownloadPng = async () => {
    setExporting(true);
    try {
      const blob = await renderCollagePngBlob();
      if (!blob) throw new Error('Render failed');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audixify-story-collage-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Kartu Story HD (1080×1920) tersimpan!');
    } catch {
      showToast('Gagal mengekspor gambar collage');
    } finally {
      setExporting(false);
    }
  };

  const handleNativeShare = async () => {
    setExporting(true);
    try {
      const blob = await renderCollagePngBlob();
      if (blob && navigator.share) {
        const file = new File([blob], 'audixify-story.png', { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'My Audixify Music Collage',
            text: activeSlots
              .map((s) => (s.track ? `${s.track.title} — ${s.track.artist}` : null))
              .filter(Boolean)
              .join(' • '),
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

  const pickerPool = useMemo(() => {
    if (pickerQuery.trim()) return pickerResults;
    if (pickerTab === 'liked') return likedTracks;
    if (pickerTab === 'recent') return recentTracks;
    return catalogPool;
  }, [pickerQuery, pickerResults, pickerTab, likedTracks, recentTracks, catalogPool]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="music-collage-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[76] flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-md p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            key="music-collage-sheet"
            initial={{ y: 44, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 36, opacity: 0, scale: 0.96 }}
            transition={IOS_SPRING_SHEET}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Music Story Card Studio"
            className="w-full max-w-4xl max-h-[94dvh] flex flex-col rounded-t-[30px] sm:rounded-[30px] ios-glass shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-[#FF4D2E]/15 text-[#FF4D2E] flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-base font-bold text-zinc-950 dark:text-white truncate">
                    Music Story Collage Studio
                  </h2>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                    Pilih 3 lagu favorit + foto galeri · Export Story 9:16 HD
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup studio collage"
                className="w-8 h-8 rounded-full ios-glass-pill flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white active:scale-90 transition-transform"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left: Live 9:16 Stage Preview (Exact 1/3 scale of 1080x1920) */}
              <div className="lg:col-span-5 flex flex-col items-center gap-2.5">
                <div
                  ref={stageContainerRef}
                  className="w-full max-w-[300px] sm:max-w-[330px] mx-auto"
                >
                  <div
                    className="relative rounded-[24px] overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.45)] border border-white/15 bg-[#0D1017] select-none"
                    style={{
                      width: `${Math.round(360 * stageScale)}px`,
                      height: `${Math.round(640 * stageScale)}px`,
                    }}
                  >
                    {/* Virtual 360x640 Stage scaled smoothly to fit */}
                    <div
                      className="relative origin-top-left"
                      style={{
                        width: '360px',
                        height: '640px',
                        transform: `scale(${stageScale})`,
                      }}
                    >
                      {/* Background Photo or Studio Fallback */}
                      {photoDataUrl ? (
                        <img
                          src={photoDataUrl}
                          alt="Gallery background"
                          className="absolute inset-0 w-full h-full object-cover transition-[filter,transform] duration-200"
                          style={{
                            filter: photoBlur > 0 ? `blur(${Math.round(photoBlur * 0.8)}px)` : undefined,
                            transform: `scale(${(photoZoom / 100) * (photoBlur > 0 ? 1.05 : 1)})`,
                          }}
                        />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-[#1B2234] via-[#11141E] to-[#090B11]">
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,rgba(255,77,46,0.24),transparent_62%)]" />
                        </div>
                      )}

                      {/* Photo Dim & Bottom Vignette */}
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{ backgroundColor: `rgba(6,8,13,${(photoDim / 100).toFixed(2)})` }}
                      />
                      <div className="absolute inset-x-0 bottom-0 h-[35%] bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

                      {/* Upload prompt pill in center when no photo picked yet */}
                      {!photoDataUrl && (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-1.5 px-4 py-3 rounded-2xl bg-black/55 hover:bg-black/75 border border-white/25 text-white backdrop-blur-md transition-all active:scale-95"
                        >
                          <Camera className="w-5 h-5 text-[#FF4D2E]" />
                          <span className="text-[11px] font-semibold whitespace-nowrap">
                            Tap Pilih Foto Galeri
                          </span>
                        </button>
                      )}

                      {/* Ambient Top Sparkles */}
                      {sparkles && (
                        <>
                          <SparkleSvg className="absolute left-[172px] top-[24px] w-6 h-6 pointer-events-none" />
                          <SparkleSvg className="absolute left-[250px] top-[14px] w-8 h-8 pointer-events-none" />
                        </>
                      )}

                      {/* Floating Tilted Mini-Player Cards */}
                      {layout.placements.map((pos, idx) => {
                        const slot = activeSlots[idx];
                        const track = slot?.track;
                        const cardW = Math.round(pos.w / 3);
                        const cardH = Math.round((pos.w * CARD_HEIGHT_RATIO) / 3);
                        const [tLeft, tRight] = formatSlotTimestamps(track, slot?.progressRatio ?? 0.4);
                        const isObsidian = cardTheme === 'obsidian';
                        const isSelected = pickerSlotIdx === idx;

                        return (
                          <div
                            key={`${layoutId}-slot-${idx}`}
                            onClick={() => setPickerSlotIdx(idx)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setPickerSlotIdx(idx);
                              }
                            }}
                            title={`Klik untuk ganti Lagu ${idx + 1}`}
                            style={{
                              left: `${Math.round(pos.x / 3)}px`,
                              top: `${Math.round(pos.y / 3)}px`,
                              width: `${cardW}px`,
                              height: `${cardH}px`,
                              transform: `rotate(${pos.rotDeg}deg)`,
                            }}
                            className={`absolute z-10 rounded-[11px] p-[9px] flex flex-col justify-between cursor-pointer transition-all duration-200 ${
                              isObsidian
                                ? 'bg-[#0D0F15]/90 text-white border border-white/25'
                                : 'bg-[#FAFAFC]/90 text-zinc-950 border border-white'
                            } ${
                              isSelected
                                ? 'ring-2 ring-[#FF4D2E] shadow-[0_14px_30px_rgba(255,77,46,0.35)]'
                                : 'shadow-[0_14px_30px_rgba(0,0,0,0.48)] hover:brightness-110'
                            }`}
                          >
                            {/* Corner Sparkle Flare */}
                            {sparkles && (
                              <SparkleSvg className="pointer-events-none absolute -top-3.5 -right-3.5 w-7 h-7" />
                            )}

                            {/* Album Artwork */}
                            <div className="w-full aspect-square rounded-[7px] overflow-hidden bg-zinc-800 shrink-0">
                              {track?.artwork ? (
                                <img
                                  src={track.artwork}
                                  alt={track.title}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#FF4D2E] to-slate-800 text-white">
                                  <Plus className="w-5 h-5" />
                                </div>
                              )}
                            </div>

                            {/* Meta + Heart */}
                            <div className="space-y-1 pt-1">
                              <div className={`flex items-center gap-1 text-[6px] font-semibold ${isObsidian ? 'text-white/60' : 'text-zinc-500'}`}>
                                <AudioWaveform className="w-2 h-2 shrink-0" />
                                <span>Audixify</span>
                              </div>
                              <div className="flex items-start justify-between gap-1">
                                <div className="min-w-0 flex-1 leading-tight">
                                  <div className="text-[9.5px] font-bold truncate">
                                    {track?.title || `Pilih Lagu ${idx + 1}`}
                                  </div>
                                  <div className={`text-[7px] truncate ${isObsidian ? 'text-white/60' : 'text-zinc-500'}`}>
                                    {track?.artist || 'Tap untuk cari'}
                                  </div>
                                </div>
                                <Heart
                                  className={`w-2.5 h-2.5 shrink-0 mt-0.5 ${
                                    slot?.liked
                                      ? 'text-[#FF4D2E] fill-[#FF4D2E]'
                                      : isObsidian
                                        ? 'text-white/85'
                                        : 'text-zinc-800'
                                  }`}
                                />
                              </div>
                            </div>

                            {/* Scrubber */}
                            <div className="space-y-0.5">
                              <div className={`relative h-[1.5px] rounded-full ${isObsidian ? 'bg-white/20' : 'bg-zinc-900/15'}`}>
                                <div
                                  className={`h-full rounded-full ${isObsidian ? 'bg-white' : 'bg-zinc-900'}`}
                                  style={{ width: `${Math.round((slot?.progressRatio ?? 0.4) * 100)}%` }}
                                />
                                <span
                                  className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[4.5px] h-[4.5px] rounded-full ${
                                    isObsidian ? 'bg-white' : 'bg-zinc-900'
                                  }`}
                                  style={{ left: `${Math.round((slot?.progressRatio ?? 0.4) * 100)}%` }}
                                />
                              </div>
                              <div className={`flex items-center justify-between text-[5.5px] font-mono ${isObsidian ? 'text-white/55' : 'text-zinc-500'}`}>
                                <span>{tLeft}</span>
                                <span>{tRight}</span>
                              </div>
                            </div>

                            {/* Transport */}
                            <div className="flex items-center justify-center gap-3">
                              <SkipBack className="w-2.5 h-2.5 fill-current" />
                              <Pause className="w-2.5 h-2.5 fill-current" />
                              <SkipForward className="w-2.5 h-2.5 fill-current" />
                            </div>

                            {/* Volume */}
                            <div className={`flex items-center gap-1 ${isObsidian ? 'text-white/60' : 'text-zinc-500'}`}>
                              <Volume1 className="w-2 h-2 shrink-0" />
                              <div className={`flex-1 h-[1.5px] rounded-full overflow-hidden ${isObsidian ? 'bg-white/20' : 'bg-zinc-900/15'}`}>
                                <div className={`h-full w-[65%] ${isObsidian ? 'bg-white' : 'bg-zinc-900'}`} />
                              </div>
                              <Volume2 className="w-2 h-2 shrink-0" />
                            </div>
                          </div>
                        );
                      })}

                      {/* Bottom Centered Audixify Lockup */}
                      <div className="absolute inset-x-0 bottom-[48px] flex items-center justify-center gap-2 pointer-events-none">
                        <div className="w-[22px] h-[22px] rounded-[6px] bg-gradient-to-br from-[#FF4D2E] to-[#D92B11] flex items-center justify-center shadow-md">
                          <svg viewBox="0 0 24 24" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
                            <path d="M6 6L18 18M18 6L6 18" />
                          </svg>
                        </div>
                        <span className="font-display text-[17px] font-bold tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]">
                          Audixify
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 text-center">
                  Tap langsung kartu lagu di preview untuk mengganti lagu
                </p>
              </div>

              {/* Right: Controls Panel OR Inline Track Slot Picker */}
              <div className="lg:col-span-7 space-y-4">
                {pickerSlotIdx !== null ? (
                  <div className="rounded-[24px] ios-glass-surface p-4 space-y-3 border border-[#FF4D2E]/30">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="font-display text-sm font-bold text-zinc-950 dark:text-white">
                          Pilih Lagu untuk Kartu {pickerSlotIdx + 1}
                        </h3>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          Cari judul lagu atau pilih dari koleksi kamu
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPickerSlotIdx(null)}
                        className="px-3 py-1 rounded-full ios-glass-pill text-xs font-medium text-zinc-700 dark:text-zinc-200"
                      >
                        Kembali
                      </button>
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={pickerQuery}
                        onChange={(e) => setPickerQuery(e.target.value)}
                        placeholder="Cari lagu (misal: Tulus, The 1975, Bernadya...)"
                        autoFocus
                        className="w-full h-10 pl-9 pr-4 rounded-full text-xs bg-black/[0.05] dark:bg-white/[0.07] border border-black/[0.08] dark:border-white/[0.12] text-zinc-900 dark:text-white focus:outline-none focus:border-[#FF4D2E]"
                      />
                    </div>

                    {!pickerQuery.trim() && (
                      <div className="flex items-center gap-1 p-1 rounded-full ios-glass-pill w-fit">
                        {([
                          { id: 'trending', label: 'Trending' },
                          { id: 'liked', label: `Liked (${likedTracks.length})` },
                          { id: 'recent', label: `Recent (${recentTracks.length})` },
                        ] as const).map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setPickerTab(t.id)}
                            className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                              pickerTab === t.id
                                ? 'bg-[#FF4D2E] text-white'
                                : 'text-zinc-600 dark:text-zinc-300'
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="max-h-72 overflow-y-auto divide-y divide-black/[0.05] dark:divide-white/[0.06] rounded-2xl bg-black/[0.025] dark:bg-white/[0.03] p-1">
                      {pickerLoading ? (
                        <div className="py-8 text-center text-xs text-zinc-500">Mencari lagu...</div>
                      ) : pickerPool.length === 0 ? (
                        <div className="py-8 text-center text-xs text-zinc-500">
                          {pickerQuery.trim()
                            ? 'Lagu tidak ditemukan, coba kata kunci lain.'
                            : 'Belum ada lagu di daftar ini.'}
                        </div>
                      ) : (
                        pickerPool.slice(0, 20).map((t) => {
                          const isCurrent = slots[pickerSlotIdx]?.track?.id === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => assignTrackToSlot(pickerSlotIdx, t)}
                              className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/60 dark:hover:bg-white/[0.08] text-left transition-colors"
                            >
                              <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                                {t.artwork && (
                                  <img
                                    src={t.artwork}
                                    alt={t.title}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                  {t.title}
                                </div>
                                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                  {t.artist}
                                </div>
                              </div>
                              {isCurrent && <Check className="w-4 h-4 text-[#FF4D2E] shrink-0" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* 1. Gallery Photo Upload & Framing */}
                    <div className="rounded-[22px] ios-glass-surface p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          1. Foto Latar dari Galeri
                        </span>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoFile}
                          className="hidden"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shadow-sm"
                          >
                            <ImagePlus className="w-3.5 h-3.5" />
                            <span>{photoDataUrl ? 'Ganti Foto' : 'Pilih Foto Galeri'}</span>
                          </button>
                          {photoDataUrl && (
                            <button
                              type="button"
                              onClick={() => setPhotoDataUrl(null)}
                              className="px-2.5 py-1.5 rounded-full ios-glass-pill text-[11px] text-zinc-600 dark:text-zinc-300"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 pt-1">
                        <label className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                            <span>Blur</span>
                            <span>{photoBlur}px</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={16}
                            value={photoBlur}
                            onChange={(e) => setPhotoBlur(Number(e.target.value))}
                            className="w-full ios-slider"
                          />
                        </label>
                        <label className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                            <span>Gelap</span>
                            <span>{photoDim}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={50}
                            value={photoDim}
                            onChange={(e) => setPhotoDim(Number(e.target.value))}
                            className="w-full ios-slider"
                          />
                        </label>
                        <label className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                            <span>Zoom</span>
                            <span>{photoZoom}%</span>
                          </div>
                          <input
                            type="range"
                            min={100}
                            max={145}
                            value={photoZoom}
                            onChange={(e) => setPhotoZoom(Number(e.target.value))}
                            className="w-full ios-slider"
                          />
                        </label>
                      </div>
                    </div>

                    {/* 2. Song Slots (3 Default or 4) */}
                    <div className="rounded-[22px] ios-glass-surface p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          2. Pilih {layout.count} Lagu Favorit
                        </span>
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          Tap lagu untuk ubah / cari
                        </span>
                      </div>

                      <div className="space-y-2">
                        {activeSlots.map((slot, idx) => (
                          <div
                            key={`slot-row-${idx}`}
                            className="flex items-center gap-2.5 p-2 rounded-2xl bg-black/[0.035] dark:bg-white/[0.05] border border-black/[0.04] dark:border-white/[0.07]"
                          >
                            <span className="w-5 h-5 rounded-full bg-[#FF4D2E]/15 text-[#FF4D2E] text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => setPickerSlotIdx(idx)}
                              className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                            >
                              <div className="w-9 h-9 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                                {slot.track?.artwork ? (
                                  <img
                                    src={slot.track.artwork}
                                    alt={slot.track.title}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-zinc-400">
                                    <Plus className="w-4 h-4" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                  {slot.track?.title || `Pilih Lagu ${idx + 1}`}
                                </div>
                                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                  {slot.track?.artist || 'Tap untuk cari lagu'}
                                </div>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => cycleSlotProgress(idx)}
                              title="Ubah durasi timestamp kartu"
                              className="px-2 py-1 rounded-full ios-glass-pill text-[10px] font-mono text-zinc-600 dark:text-zinc-300 shrink-0"
                            >
                              {formatSlotTimestamps(slot.track, slot.progressRatio)[0]}
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleSlotLike(idx)}
                              aria-label={`Toggle heart on card ${idx + 1}`}
                              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-90 ${
                                slot.liked
                                  ? 'text-[#FF4D2E]'
                                  : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                              }`}
                            >
                              <Heart className={`w-3.5 h-3.5 ${slot.liked ? 'fill-current' : ''}`} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 3. Layout, Card Style & Sparkles */}
                    <div className="rounded-[22px] ios-glass-surface p-4 space-y-3">
                      <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                        3. Tata Letak &amp; Gaya Kartu
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(Object.entries(LAYOUT_PRESETS) as Array<[CollageLayoutId, (typeof LAYOUT_PRESETS)[CollageLayoutId]]>).map(
                          ([id, item]) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setLayoutId(id)}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 ${
                                layoutId === id
                                  ? 'bg-[#FF4D2E] text-white shadow-sm'
                                  : 'ios-glass-pill text-zinc-700 dark:text-zinc-300'
                              }`}
                            >
                              {item.label}
                            </button>
                          ),
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setCardTheme('obsidian')}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                              cardTheme === 'obsidian'
                                ? 'bg-zinc-950 text-white border-[#FF4D2E]'
                                : 'ios-glass-pill text-zinc-600 dark:text-zinc-300 border-transparent'
                            }`}
                          >
                            Obsidian Dark
                          </button>
                          <button
                            type="button"
                            onClick={() => setCardTheme('frosted')}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                              cardTheme === 'frosted'
                                ? 'bg-white text-zinc-950 border-[#FF4D2E]'
                                : 'ios-glass-pill text-zinc-600 dark:text-zinc-300 border-transparent'
                            }`}
                          >
                            Frosted Light
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSparkles((s) => !s)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                            sparkles
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-400/35'
                              : 'ios-glass-pill text-zinc-500'
                          }`}
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Sparkle Flare</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* Export Actions */}
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={exporting}
                    onClick={() => void handleNativeShare()}
                    className="flex-1 min-w-[160px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shadow-md disabled:opacity-60"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>{exporting ? 'Rendering HD...' : 'Share Story'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={exporting}
                    onClick={() => void handleDownloadPng()}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full ios-glass-pill text-xs font-semibold text-zinc-900 dark:text-zinc-100 active:scale-95 transition-all disabled:opacity-60"
                  >
                    <Download className="w-4 h-4" />
                    <span>Simpan PNG HD</span>
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

function SparkleSvg({ className = '' }: { className?: string }) {
  const gradId = useId();
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="35%" stopColor="#FFFFFF" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="24" fill={`url(#${gradId})`} />
      <path
        d="M32 4 C33.8 26 38 30.2 60 32 C38 33.8 33.8 38 32 60 C30.2 38 26 33.8 4 32 C26 30.2 30.2 26 32 4 Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}
