import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary-700 text-white border border-primary-700 hover:bg-primary-800 hover:border-primary-800 disabled:bg-ink-300 disabled:border-ink-300',
  secondary:
    'bg-white text-ink-700 border border-ink-300 hover:bg-ink-50 hover:text-ink-900 disabled:text-ink-400 disabled:hover:bg-white',
  ghost:
    'bg-transparent text-ink-600 border border-transparent hover:bg-ink-100 hover:text-ink-900 disabled:text-ink-400',
  danger:
    'bg-white text-stop-700 border border-stop-200 hover:bg-stop-50 disabled:text-stop-300 disabled:hover:bg-white',
  success:
    'bg-ok-600 text-white border border-ok-600 hover:bg-ok-700 hover:border-ok-700 disabled:bg-ink-300 disabled:border-ink-300',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[13px] gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-12 px-6 text-[15px] gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  block = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center rounded-xl font-semibold transition-colors',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        block ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
