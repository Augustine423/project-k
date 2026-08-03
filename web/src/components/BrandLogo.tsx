interface BrandLogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
  variant?: "default" | "light";
}

/** MeetingMax mark — blue square with M. */
export function BrandLogo({
  size = 36,
  showText = true,
  className = "",
  variant = "default",
}: BrandLogoProps) {
  const isLight = variant === "light";
  const iconSize = size;
  const radius = Math.max(6, Math.round(iconSize * 0.22));

  return (
    <div
      className={`brand-logo ${isLight ? "brand-logo-light" : ""} ${className}`.trim()}
      style={{ ["--logo-size" as string]: `${size}px` }}
    >
      <svg
        className="brand-logo-mark"
        viewBox="0 0 48 48"
        width={iconSize}
        height={iconSize}
        aria-hidden="true"
      >
        <rect
          x="4"
          y="4"
          width="40"
          height="40"
          rx={radius}
          fill={isLight ? "#ffffff" : "#4a6cf7"}
        />
        <text
          x="24"
          y="32"
          textAnchor="middle"
          fill={isLight ? "#4a6cf7" : "#ffffff"}
          fontSize="24"
          fontWeight="700"
          fontFamily="Inter, Segoe UI, system-ui, sans-serif"
        >
          M
        </text>
      </svg>
      {showText && <span className="brand-logo-text">MeetingMax</span>}
    </div>
  );
}
