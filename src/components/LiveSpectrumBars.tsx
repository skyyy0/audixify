import { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../context/PlayerContext';

const BAR_COUNT = 16;

export function LiveSpectrumBars() {
  const { isPlaying, mediaMode, nowPlayingOpen, eqSettings, getSpectrumBins } = usePlayer();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasSignal, setHasSignal] = useState(false);

  const isLitePerf =
    typeof document !== 'undefined' && document.documentElement.dataset.perf === 'lite';

  useEffect(() => {
    if (!nowPlayingOpen || !isPlaying || mediaMode !== 'audio' || !eqSettings.enabled || isLitePerf) {
      setHasSignal(false);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bins = new Uint8Array(32);
    let rafId = 0;
    let active = true;
    let signaled = false;

    const render = () => {
      if (!active) return;
      const ok = getSpectrumBins(bins);
      if (ok) {
        if (!signaled) {
          signaled = true;
          setHasSignal(true);
        }
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const gap = 3;
        const barW = Math.max(2, (w - gap * (BAR_COUNT - 1)) / BAR_COUNT);

        for (let i = 0; i < BAR_COUNT; i++) {
          const val = bins[i] ?? 0;
          const norm = Math.max(0.08, Math.min(1, val / 230));
          const barH = Math.max(3, norm * (h - 2));
          const x = i * (barW + gap);
          const y = h - barH;

          ctx.fillStyle = i < 4 ? '#FF4D2E' : 'rgba(255, 77, 46, 0.72)';
          ctx.beginPath();
          ctx.roundRect(x, y, barW, barH, 2);
          ctx.fill();
        }
      } else if (signaled) {
        signaled = false;
        setHasSignal(false);
      }
      rafId = window.requestAnimationFrame(render);
    };

    rafId = window.requestAnimationFrame(render);
    return () => {
      active = false;
      window.cancelAnimationFrame(rafId);
    };
  }, [nowPlayingOpen, isPlaying, mediaMode, eqSettings.enabled, isLitePerf, getSpectrumBins]);

  if (!eqSettings.enabled || mediaMode !== 'audio' || isLitePerf) return null;

  return (
    <div
      className={`flex items-center gap-2 transition-opacity duration-200 ${
        hasSignal ? 'opacity-100' : 'opacity-45'
      }`}
      aria-label="Live Web Audio Frequency Spectrum"
      title="Live Web Audio Spectrum"
    >
      <canvas
        ref={canvasRef}
        width={128}
        height={22}
        className="w-28 h-[22px] block"
      />
    </div>
  );
}
