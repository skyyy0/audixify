export interface EqBandDefinition {
  index: number;
  frequency: number;
  label: string;
  shortRole: string;
  type: BiquadFilterType;
  q?: number;
}

export const EQ_BANDS: EqBandDefinition[] = [
  { index: 0, frequency: 60, label: '60 Hz', shortRole: 'Sub', type: 'lowshelf' },
  { index: 1, frequency: 230, label: '230 Hz', shortRole: 'Bass', type: 'peaking', q: 1.1 },
  { index: 2, frequency: 910, label: '910 Hz', shortRole: 'Mid', type: 'peaking', q: 1.1 },
  { index: 3, frequency: 3600, label: '3.6 kHz', shortRole: 'Vocal', type: 'peaking', q: 1.1 },
  { index: 4, frequency: 14000, label: '14 kHz', shortRole: 'Air', type: 'highshelf' },
];

export type EqPresetId =
  | 'flat'
  | 'bass-boost'
  | 'pop-indo'
  | 'vocal-clear'
  | 'acoustic'
  | 'electronic'
  | 'late-night'
  | 'custom';

export interface EqPreset {
  id: Exclude<EqPresetId, 'custom'>;
  name: string;
  gains: [number, number, number, number, number];
  preampDb: number;
}

export const EQ_PRESETS: EqPreset[] = [
  { id: 'flat', name: 'Flat', gains: [0, 0, 0, 0, 0], preampDb: 0 },
  { id: 'bass-boost', name: 'Bass Boost', gains: [6.5, 4.5, 0.5, 0, 1.5], preampDb: -2 },
  { id: 'pop-indo', name: 'Pop Indo', gains: [2.5, 1.5, 1, 3.5, 2.5], preampDb: -1 },
  { id: 'vocal-clear', name: 'Vocal Clear', gains: [-2, -1, 3.5, 5, 2], preampDb: -1 },
  { id: 'acoustic', name: 'Acoustic', gains: [2, 1.5, 2.5, 3, 3.5], preampDb: -1 },
  { id: 'electronic', name: 'Electronic', gains: [5.5, 3, -1, 2.5, 4.5], preampDb: -2 },
  { id: 'late-night', name: 'Late Night', gains: [3, 2, 1.5, 1, -2.5], preampDb: 0 },
];

export interface EqualizerSettings {
  enabled: boolean;
  presetId: EqPresetId;
  gains: [number, number, number, number, number];
  preampDb: number;
  playbackRate: number;
}

export const DEFAULT_EQ_SETTINGS: EqualizerSettings = {
  enabled: false,
  presetId: 'flat',
  gains: [0, 0, 0, 0, 0],
  preampDb: 0,
  playbackRate: 1,
};

const STORAGE_KEY = 'audixify_eq_v1';

export function clampEqDb(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-12, Math.min(12, Math.round(value * 2) / 2));
}

export function loadEqualizerSettings(): EqualizerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_EQ_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<EqualizerSettings>;
    const gains =
      Array.isArray(parsed.gains) && parsed.gains.length === 5
        ? ([
            clampEqDb(Number(parsed.gains[0])),
            clampEqDb(Number(parsed.gains[1])),
            clampEqDb(Number(parsed.gains[2])),
            clampEqDb(Number(parsed.gains[3])),
            clampEqDb(Number(parsed.gains[4])),
          ] as [number, number, number, number, number])
        : ([0, 0, 0, 0, 0] as [number, number, number, number, number]);

    const presetId: EqPresetId =
      parsed.presetId === 'custom' || EQ_PRESETS.some((p) => p.id === parsed.presetId)
        ? (parsed.presetId as EqPresetId)
        : 'custom';

    const rate =
      parsed.playbackRate === 0.85 || parsed.playbackRate === 1.15 ? parsed.playbackRate : 1;

    return {
      enabled: Boolean(parsed.enabled),
      presetId,
      gains,
      preampDb: Math.max(-6, Math.min(6, Number(parsed.preampDb) || 0)),
      playbackRate: rate,
    };
  } catch {
    return DEFAULT_EQ_SETTINGS;
  }
}

export function saveEqualizerSettings(settings: EqualizerSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

export class WebAudioEqualizerEngine {
  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private preampNode: GainNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private analyser: AnalyserNode | null = null;
  private attachedEl: HTMLAudioElement | null = null;
  private failed = false;

  public ensureInitialized(audioEl: HTMLAudioElement): boolean {
    if (this.failed) return false;
    if (this.ctx && this.attachedEl === audioEl) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      }
      return true;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        this.failed = true;
        return false;
      }

      const ctx = new AudioCtx();
      const source = ctx.createMediaElementSource(audioEl);
      const preamp = ctx.createGain();
      const filters = EQ_BANDS.map((band) => {
        const node = ctx.createBiquadFilter();
        node.type = band.type;
        node.frequency.value = band.frequency;
        if (band.q) node.Q.value = band.q;
        node.gain.value = 0;
        return node;
      });
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.78;

      let prev: AudioNode = source;
      prev.connect(preamp);
      prev = preamp;
      for (const f of filters) {
        prev.connect(f);
        prev = f;
      }
      prev.connect(analyser);
      analyser.connect(ctx.destination);

      this.ctx = ctx;
      this.source = source;
      this.preampNode = preamp;
      this.filters = filters;
      this.analyser = analyser;
      this.attachedEl = audioEl;

      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }
      return true;
    } catch {
      this.failed = true;
      return false;
    }
  }

  public applySettings(settings: EqualizerSettings): void {
    if (!this.ctx || this.filters.length !== 5 || !this.preampNode) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    const now = this.ctx.currentTime;
    const preampGain = settings.enabled ? Math.pow(10, settings.preampDb / 20) : 1;
    this.preampNode.gain.setTargetAtTime(preampGain, now, 0.025);
    this.filters.forEach((filter, idx) => {
      const targetDb = settings.enabled ? settings.gains[idx] || 0 : 0;
      filter.gain.setTargetAtTime(targetDb, now, 0.025);
    });
  }

  public hasAnalyser(): boolean {
    return Boolean(this.analyser && this.ctx && this.ctx.state === 'running');
  }

  public getFrequencyData(target: Uint8Array<ArrayBuffer>): boolean {
    if (!this.analyser || !this.ctx || this.ctx.state !== 'running') return false;
    this.analyser.getByteFrequencyData(target);
    return true;
  }

  public resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
  }

  public dispose(): void {
    try {
      this.source?.disconnect();
      this.preampNode?.disconnect();
      this.filters.forEach((f) => f.disconnect());
      this.analyser?.disconnect();
      if (this.ctx && this.ctx.state !== 'closed') {
        void this.ctx.close().catch(() => {});
      }
    } catch {}
    this.ctx = null;
    this.source = null;
    this.preampNode = null;
    this.filters = [];
    this.analyser = null;
    this.attachedEl = null;
  }
}
