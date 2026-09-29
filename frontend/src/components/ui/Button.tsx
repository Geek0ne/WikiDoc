import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** 图标按钮的可访问名称（size=icon 时建议传入） */
  'aria-label'?: string;
}

const base =
  'inline-flex items-center justify-center gap-1.5 rounded font-medium select-none ' +
  'transition-[background-color,color,box-shadow,transform] duration-150 ease-out ' +
  'focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none ' +
  'active:translate-y-px disabled:opacity-50 disabled:pointer-events-none';

const variants: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-fg hover:brightness-95 active:brightness-90 shadow-sm',
  secondary:
    'bg-elevated text-fg border border-line hover:bg-hover active:bg-hover',
  ghost:
    'bg-transparent text-fg-secondary hover:bg-hover hover:text-fg active:bg-hover',
  danger:
    'bg-danger text-white hover:brightness-95 active:brightness-90',
};

const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-2xs',
  md: 'h-9 px-4 text-sm',
  icon: 'h-9 w-9 p-0',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, className = '', children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {loading && <Loader2 size={14} className="animate-spin" aria-hidden />}
      {children as ReactNode}
    </button>
  );
});
