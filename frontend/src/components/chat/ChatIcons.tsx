interface ChatIconProps {
  className?: string;
}

export function CopyIcon({ className = 'chat-action__icon' }: ChatIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="8.25"
        y="8.25"
        width="11"
        height="11"
        rx="2.4"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M8.2 15.5H7.1A2.35 2.35 0 0 1 4.75 13.15V7.1A2.35 2.35 0 0 1 7.1 4.75h6.05A2.35 2.35 0 0 1 15.5 7.1v1.1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CheckIcon({ className = 'chat-action__icon' }: ChatIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5.5 12.4 10 16.8 18.5 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ThumbsIcon({ className = 'chat-action__icon' }: ChatIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8.4 12.6V18H6.55A1.3 1.3 0 0 1 5.25 16.7v-2.8A1.3 1.3 0 0 1 6.55 12.6H8.4Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M8.4 12.6V9.4A1.7 1.7 0 0 1 10.1 7.7c.55 0 .86.38.8.92L10.6 12.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15.6 11.4V6h1.85A1.3 1.3 0 0 1 18.75 7.3v2.8A1.3 1.3 0 0 1 17.45 11.4H15.6Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M15.6 11.4v3.2A1.7 1.7 0 0 1 13.9 16.3c-.55 0-.86-.38-.8-.92L13.4 11.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ShareIcon({ className = 'chat-action__icon' }: ChatIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 4.5v9.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M8.7 7.7 12 4.5l3.3 3.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 11.5v6.2A1.8 1.8 0 0 0 7.8 19.5h8.4A1.8 1.8 0 0 0 18 17.7v-6.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function RegenerateIcon({ className = 'chat-action__icon' }: ChatIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5.2 8.4A7.2 7.2 0 0 1 17.6 7.1L19.2 8.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M19.5 4.6v4.2h-4.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.8 15.6A7.2 7.2 0 0 1 6.4 16.9L4.8 15.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M4.5 19.4v-4.2h4.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MoreIcon({ className = 'chat-action__icon' }: ChatIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="6" cy="12" r="1.35" fill="currentColor" />
      <circle cx="12" cy="12" r="1.35" fill="currentColor" />
      <circle cx="18" cy="12" r="1.35" fill="currentColor" />
    </svg>
  );
}
