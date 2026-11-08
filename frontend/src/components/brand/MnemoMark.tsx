interface MnemoMarkProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function MnemoMark({ className = '', size = 'md' }: MnemoMarkProps) {
  return (
    <span
      className={`mnemo-mark mnemo-mark--${size}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      S
    </span>
  );
}
