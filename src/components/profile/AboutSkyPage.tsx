import {
  ArrowLeft,
  Code2,
  Copy,
  Database,
  ExternalLink,
  Globe,
  Layers,
  Send,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { usePlayer } from '../../context/PlayerContext';
import { DeveloperBadge } from '../DeveloperBadge';

interface AboutSkyPageProps {
  onBackToSettings?: () => void;
}

const TECH_GROUPS = [
  {
    icon: Code2,
    title: 'Programming Languages',
    items: ['TypeScript', 'TSX (React)', 'HTML5', 'CSS3'],
  },
  {
    icon: Layers,
    title: 'Frontend & Motion UI',
    items: ['React 19', 'Vite 8', 'Tailwind CSS v4', 'Motion (iOS Spring)', 'hls.js', 'Lucide SVG'],
  },
  {
    icon: Terminal,
    title: 'Backend & Media Engine',
    items: [
      'Node.js',
      'Express',
      'Live Music / Artist / Lyrics Scrapers',
      'SSRF-Safe HLS & Audio Proxy',
    ],
  },
  {
    icon: Database,
    title: 'Cloud, Auth & Hosting',
    items: [
      'Firebase Auth (Google)',
      'Cloud Firestore (asia-southeast1)',
      'Vercel Serverless Functions',
    ],
  },
];

export function AboutSkyPage({ onBackToSettings }: AboutSkyPageProps) {
  const { showToast } = usePlayer();

  const handleCopyTelegram = async () => {
    try {
      await navigator.clipboard.writeText('@sekaynotdev');
      showToast('Copied @sekaynotdev');
    } catch {
      showToast('Telegram: @sekaynotdev');
    }
  };

  return (
    <div className="space-y-5">
      {onBackToSettings && (
        <button
          type="button"
          onClick={onBackToSettings}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full ios-glass-pill text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-white/75 dark:hover:bg-white/[0.12] active:scale-95 transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Settings</span>
        </button>
      )}

      {/* Identity Hero */}
      <section className="rounded-[28px] ios-glass p-6 md:p-7 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#FF4D2E] to-red-600 flex items-center justify-center text-white font-display text-2xl font-bold shadow-lg shrink-0">
              S
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-2xl font-bold text-zinc-950 dark:text-white">
                  sky
                </h2>
                <DeveloperBadge showLabel size="md" />
              </div>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 mt-0.5">
                Creator &amp; Full-Stack Engineer of Audixify
              </p>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="inline-flex items-center gap-1 font-mono">
                  <Globe className="w-3.5 h-3.5 text-[#FF4D2E]" />
                  audixify.skydev.my.id
                </span>
              </div>
            </div>
          </div>

          <a
            href="https://t.me/sekaynotdev"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shadow-md shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Telegram @sekaynotdev</span>
            <ExternalLink className="w-3 h-3 opacity-80" />
          </a>
        </div>

        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          Hi, I&rsquo;m <strong>sky</strong> &mdash; the creator and lead engineer behind{' '}
          <strong>Audixify</strong>. Designed with a focus on effortless speed, refined iOS Liquid
          Glass motion, and high-fidelity playback, Audixify brings together live global, Asian, and
          Indonesian music catalogs, synchronized lyrics, a 5-band audio equalizer, collaborative
          playlists, shareable music story cards, and seamless audio &amp; MV streaming in one
          cohesive experience.
        </p>
      </section>

      {/* Open Source & Source Code Notice */}
      <section className="rounded-[26px] ios-glass p-6 space-y-3 border border-[#FF4D2E]/20">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#FF4D2E]" />
          <h3 className="font-display text-base font-bold text-zinc-950 dark:text-white">
            Open Source Project
          </h3>
        </div>
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          <strong>Audixify is open source.</strong> If you would like to request the source code,
          study the streaming &amp; scraper architecture, or contribute improvements, please message me
          directly on Telegram at{' '}
          <span className="font-mono font-semibold text-[#FF4D2E]">@sekaynotdev</span>.
        </p>
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <a
            href="https://t.me/sekaynotdev"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 text-xs font-semibold active:scale-95 transition-transform"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Request Source Code</span>
          </a>
          <button
            type="button"
            onClick={handleCopyTelegram}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full ios-glass-pill text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-white/75 dark:hover:bg-white/[0.12] active:scale-95 transition-all"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy @sekaynotdev</span>
          </button>
        </div>
      </section>

      {/* Code Stack & Languages */}
      <section className="space-y-3">
        <h3 className="font-display text-lg font-bold text-zinc-900 dark:text-zinc-100">
          Languages &amp; Architecture Stack
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {TECH_GROUPS.map((group) => {
            const Icon = group.icon;
            return (
              <div key={group.title} className="rounded-[24px] ios-glass-card p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  <Icon className="w-4 h-4 text-[#FF4D2E]" />
                  <span>{group.title}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.items.map((item) => (
                    <span
                      key={item}
                      className="px-2.5 py-1 rounded-full text-xs font-medium ios-glass-pill text-zinc-700 dark:text-zinc-300"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
