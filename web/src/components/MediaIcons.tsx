/** Icons styled to match logo.jpg — blue stroke media controls, red end-call button (MDI phone-hangup). */

interface IconProps {
  className?: string;
  size?: number;
}

const STROKE = 2;

function IconShell({
  className,
  size = 24,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      fill="none"
    >
      {children}
    </svg>
  );
}

function OffSlash() {
  return (
    <path d="M5 19L19 5" stroke="currentColor" strokeWidth={STROKE + 0.2} strokeLinecap="round" />
  );
}

export function MicIcon({ className, muted = false, size }: IconProps & { muted?: boolean }) {
  return (
    <IconShell className={className} size={size}>
      <rect x="9" y="4" width="6" height="10" rx="3" stroke="currentColor" strokeWidth={STROKE} />
      <path
        d="M6 12a6 6 0 0 0 12 0"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <path d="M12 18v3" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
      <path d="M9 21h6" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
      {muted && <OffSlash />}
    </IconShell>
  );
}

export function CameraIcon({ className, off = false, size }: IconProps & { off?: boolean }) {
  return (
    <IconShell className={className} size={size}>
      <path
        d="M3 8.5V16a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8.5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <path
        d="M16 10l4-2v8l-4-2"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      {off && <OffSlash />}
    </IconShell>
  );
}

export function ShareScreenIcon({ className, size }: IconProps) {
  return (
    <IconShell className={className} size={size}>
      <rect x="3" y="5" width="18" height="12" rx="2" stroke="currentColor" strokeWidth={STROKE} />
      <path d="M8 20h8" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
      <path d="M12 17v3" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
      <path
        d="M12 11V7m0 0-2.5 2.5M12 7l2.5 2.5"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconShell>
  );
}

export function ParticipantsIcon({ className, size }: IconProps) {
  return (
    <IconShell className={className} size={size}>
      <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth={STROKE} />
      <path
        d="M3.5 18c0-2.5 2.5-4.5 5.5-4.5s5.5 2 5.5 4.5"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <circle cx="17" cy="10" r="2.5" stroke="currentColor" strokeWidth={STROKE} />
      <path
        d="M14 18c.3-2.2 2-3.5 4.5-3.5 1.4 0 2.6.5 3.5 1.3"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </IconShell>
  );
}

export function ChatIcon({ className, size }: IconProps) {
  return (
    <IconShell className={className} size={size}>
      <path
        d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H11l-4.5 3.5V15H7.5A2.5 2.5 0 0 1 5 12.5v-6Z"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
    </IconShell>
  );
}

/** Smiley face with a small sparkle — clean at 22px, matches stroke style of all other icons. */
export function ReactionsIcon({ className, size }: IconProps) {
  return (
    <IconShell className={className} size={size}>
      {/* Face circle */}
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth={STROKE} />
      {/* Smile */}
      <path
        d="M9 13.5a3.5 3.5 0 0 0 6 0"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      {/* Eyes */}
      <circle cx="9.5" cy="10" r="1" fill="currentColor" />
      <circle cx="14.5" cy="10" r="1" fill="currentColor" />
    </IconShell>
  );
}

export function SettingsIcon({ className, size }: IconProps) {
  return (
    <IconShell className={className} size={size}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={STROKE} />
      <path
        d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </IconShell>
  );
}

export function MoreIcon({ className, size }: IconProps) {
  return (
    <IconShell className={className} size={size}>
      <circle cx="6" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="18" cy="12" r="1.5" fill="currentColor" />
    </IconShell>
  );
}

/** End-call icon — Material Design "phone-hangup" (Apache 2.0), used by Google Meet / Android. */
export function EndCallIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .4-.23.74-.56.9-.98.49-1.87 1.12-2.67 1.85-.18.18-.43.29-.68.29-.3 0-.55-.12-.73-.3l-2.48-2.48c-.18-.18-.29-.43-.29-.7 0-.28.11-.53.29-.71 3.05-2.9 7.17-4.67 11.71-4.67 4.54 0 8.66 1.77 11.71 4.67.18.18.29.43.29.71 0 .27-.11.52-.29.7l-2.48 2.48c-.18.18-.43.3-.73.3-.25 0-.5-.11-.68-.29-.8-.73-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9V9.72C15.15 9.25 13.6 9 12 9z" />
    </svg>
  );
}

export function SignalIcon({ className, size }: IconProps) {
  return (
    <IconShell className={className} size={size}>
      <path d="M4 18h2v-4H4v4Zm4 0h2V10H8v8Zm4 0h2V6h-2v12Zm4 0h2V2h-2v16Z" fill="currentColor" />
    </IconShell>
  );
}

export function MicMutedSmall({ className, size = 14 }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" fill="none">
      <rect x="6" y="2" width="4" height="7" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 8a4 4 0 0 0 8 0" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 13L13 3" stroke="#e53945" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
