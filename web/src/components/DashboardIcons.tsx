interface IconProps {
  className?: string;
  size?: number;
}

const S = 1.75;

function Icon({ className, size = 20, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinejoin="round"
      />
    </Icon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth={S} />
      <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
    </Icon>
  );
}

export function RecordingIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth={S} />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </Icon>
  );
}

export function ContactsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.5" stroke="currentColor" strokeWidth={S} />
      <path
        d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
      />
      <path
        d="M16 8.5a2.5 2.5 0 1 1 0 5"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
      />
      <path d="M14 19c.3-2 1.8-3.5 4-3.5" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
    </Icon>
  );
}

export function WhiteboardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="14" rx="2" stroke="currentColor" strokeWidth={S} />
      <path d="M7 20h10" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
      <path d="M12 18v2" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
    </Icon>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 7V5a1 1 0 0 1 1-1h8v16h-8a1 1 0 0 1-1-1v-2" stroke="currentColor" strokeWidth={S} />
      <path d="M14 12H4M7 9l-3 3 3 3" stroke="currentColor" strokeWidth={S} strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}

export function StartMeetingIcon(props: IconProps) {
  return (
    <Icon {...props} size={props.size ?? 28}>
      <rect x="3" y="6" width="12" height="10" rx="2" stroke="currentColor" strokeWidth={S} />
      <path d="M15 10l5-2.5v9L15 14" stroke="currentColor" strokeWidth={S} strokeLinejoin="round" />
    </Icon>
  );
}

export function JoinMeetingIcon(props: IconProps) {
  return (
    <Icon {...props} size={props.size ?? 28}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={S} />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
    </Icon>
  );
}

export function ScheduleIcon(props: IconProps) {
  return (
    <Icon {...props} size={props.size ?? 28}>
      <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth={S} />
      <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
      <path d="M8 14h3M13 14h3M8 17h8" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
    </Icon>
  );
}
