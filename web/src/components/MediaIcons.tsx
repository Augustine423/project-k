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

/**
 * Jitsi Meet noise-suppression toolbar icons
 * (`noise-suppression-on.svg` / `noise-suppression-off.svg`).
 * `off` = noise suppression currently enabled (slashed bars), matching Jitsi’s toggledIcon.
 */
export function NoiseCancelIcon({
  className,
  off = false,
  size = 22,
}: IconProps & { off?: boolean }) {
  // Jitsi assets are 20×20 filled paths; scale via viewBox.
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      width={size}
      height={size}
      aria-hidden="true"
      fill="currentColor"
    >
      {off ? (
        <>
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M6.06204 5.25986C5.92029 5.40926 5.83333 5.61114 5.83333 5.83333V14.1667C5.83333 14.6269 6.20643 15 6.66667 15C7.1269 15 7.5 14.6269 7.5 14.1667V6.69782L6.06204 5.25986ZM9.16667 8.36449V16.6667C9.16667 17.1269 9.53976 17.5 10 17.5C10.4602 17.5 10.8333 17.1269 10.8333 16.6667V10.0312L9.16667 8.36449ZM13.3016 12.4994C12.8666 12.4831 12.5169 12.1334 12.5006 11.6984L13.3016 12.4994ZM14.1667 10.9688L12.5 9.30218V8.33333C12.5 7.8731 12.8731 7.5 13.3333 7.5C13.7936 7.5 14.1667 7.8731 14.1667 8.33333V10.9688ZM17.4905 14.2927L15.8333 12.6355V5.83333C15.8333 5.3731 16.2064 5 16.6667 5C17.1269 5 17.5 5.3731 17.5 5.83333V14.1667C17.5 14.2095 17.4968 14.2516 17.4905 14.2927ZM10.8333 7.63551L9.16667 5.96884V3.33333C9.16667 2.8731 9.53976 2.5 10 2.5C10.4602 2.5 10.8333 2.8731 10.8333 3.33333V7.63551ZM3.33333 7.5C2.8731 7.5 2.5 7.8731 2.5 8.33333V11.6667C2.5 12.1269 2.8731 12.5 3.33333 12.5C3.79357 12.5 4.16667 12.1269 4.16667 11.6667V8.33333C4.16667 7.8731 3.79357 7.5 3.33333 7.5Z"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M1.91469 1.91469C2.24546 1.58392 2.78183 1.58401 3.11271 1.91488L18.0851 16.8873C18.416 17.2182 18.4161 17.7545 18.0853 18.0853C17.7545 18.4161 17.2182 18.416 16.8873 18.0851L1.91488 3.11271C1.58401 2.78183 1.58392 2.24546 1.91469 1.91469Z"
          />
        </>
      ) : (
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M10 2.5C9.53976 2.5 9.16667 2.8731 9.16667 3.33333V16.6667C9.16667 17.1269 9.53976 17.5 10 17.5C10.4602 17.5 10.8333 17.1269 10.8333 16.6667V3.33333C10.8333 2.8731 10.4602 2.5 10 2.5ZM6.66667 5C6.20643 5 5.83333 5.3731 5.83333 5.83333V14.1667C5.83333 14.6269 6.20643 15 6.66667 15C7.1269 15 7.5 14.6269 7.5 14.1667V5.83333C7.5 5.3731 7.1269 5 6.66667 5ZM2.5 8.33333C2.5 7.8731 2.8731 7.5 3.33333 7.5C3.79357 7.5 4.16667 7.8731 4.16667 8.33333V11.6667C4.16667 12.1269 3.79357 12.5 3.33333 12.5C2.8731 12.5 2.5 12.1269 2.5 11.6667V8.33333ZM12.5 8.33333C12.5 7.8731 12.8731 7.5 13.3333 7.5C13.7936 7.5 14.1667 7.8731 14.1667 8.33333V11.6667C14.1667 12.1269 13.7936 12.5 13.3333 12.5C12.8731 12.5 12.5 12.1269 12.5 11.6667V8.33333ZM15.8333 5.83333C15.8333 5.3731 16.2064 5 16.6667 5C17.1269 5 17.5 5.3731 17.5 5.83333V14.1667C17.5 14.6269 17.1269 15 16.6667 15C16.2064 15 15.8333 14.6269 15.8333 14.1667V5.83333Z"
        />
      )}
    </svg>
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

/** Raised hand — simple open-palm gesture for webinar Q&A signaling. */
export function RaiseHandIcon({ className, size }: IconProps) {
  return (
    <IconShell className={className} size={size}>
      <path
        d="M9 11V6.5a1.5 1.5 0 0 1 3 0V11"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <path
        d="M12 11V5.5a1.5 1.5 0 0 1 3 0V11"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <path
        d="M15 11V7.5a1.5 1.5 0 0 1 3 0V13c0 3.5-2.5 6-6 6h-1c-3 0-5-2-5-5V9.5a1.5 1.5 0 0 1 3 0V11"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
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
