interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className = 'w-7 h-7' }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" className="fill-[#FF4D2E]" />
      <path
        d="M9.5 9.5L22.5 22.5M22.5 9.5L9.5 22.5"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M16 6.5V10.5M16 21.5V25.5M6.5 16H10.5M21.5 16H25.5"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeOpacity="0.85"
      />
    </svg>
  );
}
