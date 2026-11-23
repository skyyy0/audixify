import { AnimatePresence, motion } from 'motion/react';
import { Gauge, Power, RotateCcw, Sliders, X } from 'lucide-react';
import { useMemo } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { EQ_BANDS, EQ_PRESETS } from '../utils/audioEqualizer';
import { IOS_SPRING_SHEET } from '../utils/motion';

export function EqualizerModal() {
  const {
    eqModalOpen,
    setEqModalOpen,
    eqSettings,
    setEqEnabled,
    setEqBandGain,
    selectEqPreset,
    setPreampDb,
    setPlaybackRate,
    resetEq,
    fadeSeconds,
    setFadeSeconds,
  } = usePlayer();

  // Build smooth SVG spline path across the 5 bands
  const curvePath = useMemo(() => {
    const w = 320;
    const h = 84;
    const padX = 22;
    const midY = h / 2;
    const maxOffset = 30;
    const stepX = (w - padX * 2) / 4;

    const points = eqSettings.gains.map((db, idx) => {
      const effectiveDb = eqSettings.enabled ? db : 0;
      return {
        x: padX + idx * stepX,
        y: midY - (effectiveDb / 12) * maxOffset,
      };
    });

    if (points.length === 0) return { line: '', area: '', points: [] };

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cx = (p0.x + p1.x) / 2;
      d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
    }

    const area = `${d} L ${points[points.length - 1].x} ${h} L ${points[0].x} ${h} Z`;
    return { line: d, area, points };
  }, [eqSettings.gains, eqSettings.enabled]);

  return (
    <AnimatePresence>
      {eqModalOpen && (
        <motion.div
          key="eq-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setEqModalOpen(false)}
          className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center p-2.5 sm:p-5 bg-black/55"
          role="dialog"
          aria-modal="true"
          aria-label="5-Band Audio Equalizer"
        >
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 32, opacity: 0, scale: 0.96 }}
            transition={IOS_SPRING_SHEET}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-[28px] ios-glass p-5 sm:p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-[#FF4D2E]/15 text-[#FF4D2E] flex items-center justify-center">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-display text-base sm:text-lg font-bold text-zinc-950 dark:text-white">
                    5-Band Studio Equalizer
                  </h2>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Real-time Web Audio filter engine ({eqSettings.enabled ? 'Active' : 'Bypassed'})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setEqEnabled(!eqSettings.enabled)}
                  aria-label={eqSettings.enabled ? 'Disable Equalizer' : 'Enable Equalizer'}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 ${
                    eqSettings.enabled
                      ? 'bg-[#FF4D2E] text-white shadow-sm'
                      : 'ios-glass-pill text-zinc-600 dark:text-zinc-300'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{eqSettings.enabled ? 'ON' : 'OFF'}</span>
                </button>
                <button
                  type="button"
                  onClick={resetEq}
                  title="Reset to Flat"
                  aria-label="Reset Equalizer"
                  className="w-8 h-8 rounded-full ios-glass-pill flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setEqModalOpen(false)}
                  aria-label="Close Equalizer"
                  className="w-8 h-8 rounded-full ios-glass-pill flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Frequency Curve Visualizer */}
            <div className="rounded-2xl bg-black/[0.04] dark:bg-black/35 border border-black/[0.05] dark:border-white/[0.07] p-3">
              <svg viewBox="0 0 320 84" className="w-full h-20 overflow-visible" aria-hidden="true">
                <defs>
                  <linearGradient id="eqCurveFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF4D2E" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="#FF4D2E" stopOpacity="0.01" />
                  </linearGradient>
                </defs>
                {/* 0 dB center line */}
                <line
                  x1="10"
                  y1="42"
                  x2="310"
                  y2="42"
                  stroke="currentColor"
                  strokeOpacity="0.14"
                  strokeDasharray="3 3"
                />
                {curvePath.area && <path d={curvePath.area} fill="url(#eqCurveFill)" />}
                {curvePath.line && (
                  <path
                    d={curvePath.line}
                    fill="none"
                    stroke={eqSettings.enabled ? '#FF4D2E' : '#71717A'}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                )}
                {curvePath.points.map((pt, i) => (
                  <circle
                    key={i}
                    cx={pt.x}
                    cy={pt.y}
                    r="4"
                    fill={eqSettings.enabled ? '#FF4D2E' : '#71717A'}
                    stroke="#FFFFFF"
                    strokeWidth="1.5"
                  />
                ))}
              </svg>
            </div>

            {/* Presets */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Audio Presets
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {EQ_PRESETS.map((preset) => {
                  const active = eqSettings.enabled && eqSettings.presetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => selectEqPreset(preset.id)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 active:scale-95 transition-all ${
                        active
                          ? 'bg-[#FF4D2E] text-white shadow-sm'
                          : 'ios-glass-pill text-zinc-700 dark:text-zinc-200 hover:bg-white/80 dark:hover:bg-white/[0.12]'
                      }`}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 5-Band Sliders */}
            <div className="space-y-3">
              <div className="grid grid-cols-5 gap-2 sm:gap-3 pt-1">
                {EQ_BANDS.map((band) => {
                  const gain = eqSettings.gains[band.index] ?? 0;
                  return (
                    <div
                      key={band.frequency}
                      className="flex flex-col items-center gap-2 rounded-2xl ios-glass-card py-3 px-1.5"
                    >
                      <span className="text-[11px] font-mono tabular-nums font-semibold text-[#FF4D2E]">
                        {gain > 0 ? `+${gain}` : gain}dB
                      </span>

                      <div className="h-28 flex items-center justify-center">
                        <input
                          type="range"
                          min={-12}
                          max={12}
                          step={0.5}
                          value={gain}
                          onChange={(e) => setEqBandGain(band.index, Number(e.target.value))}
                          aria-label={`${band.label} ${band.shortRole} gain`}
                          className="w-24 -rotate-90 ios-slider"
                          style={{
                            background: `linear-gradient(to right, #FF4D2E ${((gain + 12) / 24) * 100}%, rgba(161,161,170,0.28) ${((gain + 12) / 24) * 100}%)`,
                          }}
                        />
                      </div>

                      <div className="text-center leading-tight">
                        <div className="text-[11px] font-semibold text-zinc-900 dark:text-zinc-100">
                          {band.shortRole}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                          {band.label}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Preamp & Playback Speed */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="rounded-2xl ios-glass-card p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">Preamp Gain</span>
                  <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                    {eqSettings.preampDb > 0 ? `+${eqSettings.preampDb}` : eqSettings.preampDb} dB
                  </span>
                </div>
                <input
                  type="range"
                  min={-6}
                  max={6}
                  step={0.5}
                  value={eqSettings.preampDb}
                  onChange={(e) => setPreampDb(Number(e.target.value))}
                  aria-label="Preamp Gain"
                  className="w-full ios-slider"
                  style={{
                    background: `linear-gradient(to right, #FF4D2E ${((eqSettings.preampDb + 6) / 12) * 100}%, rgba(161,161,170,0.28) ${((eqSettings.preampDb + 6) / 12) * 100}%)`,
                  }}
                />
              </div>

              <div className="rounded-2xl ios-glass-card p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  <Gauge className="w-3.5 h-3.5 text-[#FF4D2E]" />
                  <span>Speed</span>
                </div>
                <div className="flex items-center gap-1">
                  {[0.85, 1, 1.15].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setPlaybackRate(rate)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold transition-colors ${
                        eqSettings.playbackRate === rate
                          ? 'bg-[#FF4D2E] text-white'
                          : 'ios-glass-pill text-zinc-600 dark:text-zinc-300'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl ios-glass-card p-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  Smooth Audio Fade
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Gentle volume ramp on track start &amp; transitions
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {([0, 2, 4] as const).map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setFadeSeconds(sec)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold transition-colors ${
                      fadeSeconds === sec
                        ? 'bg-[#FF4D2E] text-white'
                        : 'ios-glass-pill text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    {sec === 0 ? 'Off' : `${sec}s`}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
