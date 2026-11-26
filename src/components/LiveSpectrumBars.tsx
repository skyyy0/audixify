import { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../context/PlayerContext';

interface LiveSpectrumBarsProps {
  variant?: 'mini' | 'stage';
  active?: boolean;
  className?: string;
}

export function LiveSpectrumBars({
  variant = 'mini',
  active: activeOverride,
  className = '',
}: LiveSpectrumBarsProps) {
  const { isPlaying, mediaMode, nowPlayingOpen, getSpectrumBins, streamInfo } = usePlayer();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasSignal, setHasSignal] = useState(false);

  const isLitePerf =
    typeof document !== 'undefined' && document.documentElement.dataset.perf === 'lite';

  const shouldRender =
    !isLitePerf &&
    mediaMode === 'audio' &&
    streamInfo?.mode !== 'ytmusic' &&
    (activeOverride !== undefined ? activeOverride : variant === 'stage' || nowPlayingOpen);

  useEffect(() => {
    if (!shouldRender || !isPlaying) {
      setHasSignal(false);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const barCount = variant === 'stage' ? 28 : 14;
    const bins = new Uint8Array(64);
    let rafId = 0;
    let mounted = true;
    let signaled = false;

    const render = () => {
      if (!mounted) return;
      const ok = getSpectrumBins(bins);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (ok) {
        if (!signaled) {
          signaled = true;
          setHasSignal(true);
        }

        const gap = variant === 'stage' ? 4 : 3;
        const barW = Math.max(2, (w - gap * (barCount - 1)) / barCount);

        if (variant === 'stage') {
          const grad = ctx.createLinearGradient(0, h, 0, 0);
          grad.addColorStop(0, '#FF4D2E');
          grad.addColorStop(0.58, '#F97316');
          grad.addColorStop(1, '#FBBF24');
          ctx.fillStyle = grad;

          for (let i = 0; i < barCount; i++) {
            // Focus on audible sub-bass through presence range (bins 0..38)
            const binIndex = Math.min(bins.length - 1, Math.floor((i / barCount) * 38));
            const val = bins[binIndex] ?? 0;
            const norm = Math.max(0.06, Math.min(1, val / 225));
            const barH = Math.max(3, norm * (h - 4));
            const x = i * (barW + gap);
            const y = h - barH;

            ctx.beginPath();
            ctx.roundRect(x, y, barW, barH, Math.min(4, barW / 2));
            ctx.fill();
          }
        } else {
          for (let i = 0; i < barCount; i++) {
            const binIndex = Math.min(bins.length - 1, i * 2);
            const val = bins[binIndex] ?? 0;
            const norm = Math.max(0.08, Math.min(1, val / 230));
            const barH = Math.max(2.5, norm * (h - 2));
            const x = i * (barW + gap);
            const y = h - barH;

            ctx.fillStyle = i < 4 ? '#FF4D2E' : 'rgba(255, 77, 46, 0.72)';
            ctx.beginPath();
            ctx.roundRect(x, y, barW, barH, 2);
            ctx.fill();
          }
        }
      } else if (signaled) {
        signaled = false;
        setHasSignal(false);
      }

      rafId = window.requestAnimationFrame(render);
    };

    rafId = window.requestAnimationFrame(render);
    return () => {
      mounted = false;
      window.cancelAnimationFrame(rafId);
    };
  }, [shouldRender, isPlaying, variant, getSpectrumBins]);

  if (!shouldRender) return null;

  if (variant === 'stage') {
    return (
      <div
        className={`w-full rounded-2xl ios-glass-card px-3.5 py-2.5 flex flex-col gap-1.5 ${className}`}
        aria-label="Real-Time Audio Frequency Visualizer"
      >
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isPlaying && hasSignal ? 'bg-[#FF4D2E] animate-pulse' : 'bg-zinc-400'
              }`}
            />
            <span>Live Audio Spectrum</span>
          </span>
          <span>{isPlaying ? (hasSignal ? 'Real-Time FFT' : 'Buffering...') : 'Paused'}</span>
        </div>
        <canvas
          ref={canvasRef}
          width={360}
          height={52}
          className="w-full h-[52px] block"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center transition-opacity duration-200 ${
        hasSignal ? 'opacity-100' : 'opacity-40'
      } ${className}`}
      aria-label="Live Web Audio Frequency Spectrum"
      title="Live Web Audio Spectrum"
    >
      <canvas
        ref={canvasRef}
        width={108}
        height={20}
        className="w-24 h-[20px] block"
      />
    </div>
  );
}
