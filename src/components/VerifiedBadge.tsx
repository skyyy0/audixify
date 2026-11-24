interface BadgeProps {
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function DeveloperBadge({ showLabel = false, size = 'sm' }: BadgeProps) {
  const iconSize = size === 'md' ? 'w-[18px] h-[18px]' : 'w-4 h-4';

  return (
    <span
      className="inline-flex items-center gap-1 shrink-0"
      title="Verified Audixify Developer (sky)"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-label="Verified Developer Badge"
        className={`${iconSize} shrink-0 drop-shadow-[0_1px_4px_rgba(239,68,68,0.4)]`}
      >
        <path
          d="M12 2L14.65 3.87L17.89 3.63L18.92 6.72L21.66 8.5L20.98 11.68L22.36 14.63L20.13 17.01L19.86 20.25L16.69 20.77L14.5 23.16L12 21.84L9.5 23.16L7.31 20.77L4.14 20.25L3.87 17.01L1.64 14.63L3.02 11.68L2.34 8.5L5.08 6.72L6.11 3.63L9.35 3.87L12 2Z"
          fill="#EF4444"
        />
        <path
          d="M8.6 12.2L10.9 14.5L15.6 9.6"
          stroke="#FFFFFF"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showLabel && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/25">
          Developer
        </span>
      )}
    </span>
  );
}

export function GreenVerifiedBadge({ showLabel = false, size = 'sm' }: BadgeProps) {
  const iconSize = size === 'md' ? 'w-[18px] h-[18px]' : 'w-4 h-4';

  return (
    <span
      className="inline-flex items-center gap-1 shrink-0"
      title="30-Day Streak Verified Listener"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-label="Verified 30-Day Listener Badge"
        className={`${iconSize} shrink-0 drop-shadow-[0_1px_4px_rgba(16,185,129,0.45)]`}
      >
        <path
          d="M12 2L14.65 3.87L17.89 3.63L18.92 6.72L21.66 8.5L20.98 11.68L22.36 14.63L20.13 17.01L19.86 20.25L16.69 20.77L14.5 23.16L12 21.84L9.5 23.16L7.31 20.77L4.14 20.25L3.87 17.01L1.64 14.63L3.02 11.68L2.34 8.5L5.08 6.72L6.11 3.63L9.35 3.87L12 2Z"
          fill="#10B981"
        />
        <path
          d="M8.6 12.2L10.9 14.5L15.6 9.6"
          stroke="#FFFFFF"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showLabel && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
          30-Day Verified
        </span>
      )}
    </span>
  );
}

export function GoldCrownBadge({ showLabel = false, size = 'sm' }: BadgeProps) {
  const iconSize = size === 'md' ? 'w-[18px] h-[18px]' : 'w-4 h-4';

  return (
    <span
      className="inline-flex items-center gap-1 shrink-0"
      title="60-Day Gold Sovereign Listener"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-label="60-Day Gold Sovereign Badge"
        className={`${iconSize} shrink-0 drop-shadow-[0_1px_5px_rgba(245,158,11,0.55)]`}
      >
        <path
          d="M12 2L14.65 3.87L17.89 3.63L18.92 6.72L21.66 8.5L20.98 11.68L22.36 14.63L20.13 17.01L19.86 20.25L16.69 20.77L14.5 23.16L12 21.84L9.5 23.16L7.31 20.77L4.14 20.25L3.87 17.01L1.64 14.63L3.02 11.68L2.34 8.5L5.08 6.72L6.11 3.63L9.35 3.87L12 2Z"
          fill="#F59E0B"
        />
        <path
          d="M7.5 15L8.6 9.5L12 12L15.4 9.5L16.5 15H7.5Z"
          fill="#FFFFFF"
          stroke="#FFFFFF"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />
      </svg>
      {showLabel && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30">
          60-Day Gold
        </span>
      )}
    </span>
  );
}

