interface BrandLogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
}

/** Project-K mark from UI mockup — K in ring. */
export function BrandLogo({ size = 36, showText = true, className = "" }: BrandLogoProps) {
  return (
    <div className={`brand-logo ${className}`.trim()} style={{ ["--logo-size" as string]: `${size}px` }}>
      <svg
        className="brand-logo-mark"
        viewBox="0 0 48 48"
        width={size}
        height={size}
        aria-hidden="true"
      >
        <circle cx="24" cy="24" r="22" fill="none" stroke="url(#pk-ring)" strokeWidth="3" />
        <defs>
          <linearGradient id="pk-ring" x1="0" y1="0" x2="48" y2="48">
            <stop offset="0%" stopColor="#5eb8ff" />
            <stop offset="100%" stopColor="#2d7dff" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="17" fill="#1e2430" />
        <text
          x="24"
          y="31"
          textAnchor="middle"
          fill="#ffffff"
          fontSize="22"
          fontWeight="700"
          fontFamily="Segoe UI, system-ui, sans-serif"
        >
          K
        </text>
      </svg>
      {showText && <span className="brand-logo-text">Project-K</span>}
    </div>
  );
}
