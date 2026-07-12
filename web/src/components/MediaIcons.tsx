interface IconProps {
  className?: string;
}

function OffSlash() {
  return (
    <path
      d="M4 20L20 4"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  );
}

export function MicIcon({ className, muted = false }: IconProps & { muted?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      fill="none"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path
        d="M6 11a6 6 0 0 0 12 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M12 17v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 21h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {muted && <OffSlash />}
    </svg>
  );
}

export function CameraIcon({ className, off = false }: IconProps & { off?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      fill="none"
    >
      <path
        d="M4 8.5V16a2 2 0 0 0 2 2h8.5a2 2 0 0 0 2-2V8.5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M16.5 9.5 19.5 7.8A1 1 0 0 1 21 8.6v6.8a1 1 0 0 1-1.5.8L16.5 14.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="11.25" cy="12.25" r="2.75" stroke="currentColor" strokeWidth="2" />
      {off && <OffSlash />}
    </svg>
  );
}

export function ShareScreenIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      fill="none"
    >
      <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 20h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 16v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function LeaveIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      fill="none"
    >
      <path
        d="M10 7V6a2 2 0 0 1 2-2h7v16h-7a2 2 0 0 1-2-2v-1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M13 12H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="m6 9-3 3 3 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
