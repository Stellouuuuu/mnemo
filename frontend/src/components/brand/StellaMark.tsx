interface StellaMarkProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function StellaMark({ className = '', size = 'md' }: StellaMarkProps) {
  return (
    <span
      className={`stella-mark stella-mark--${size}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      S
    </span>
  );
}
