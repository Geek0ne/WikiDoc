import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string | null;
  /** 输入框左侧装饰图标 */
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, icon, className = '', id, ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-2xs font-medium text-fg-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          className={
            `h-9 w-full rounded border bg-elevated text-sm text-fg placeholder:text-fg-muted ` +
            `transition-[border-color,box-shadow] duration-150 ease-out ` +
            `focus:outline-none focus:border-primary focus:shadow-[var(--focus-ring)] ` +
            `disabled:cursor-not-allowed disabled:opacity-60 ` +
            `${error ? 'border-danger' : 'border-line'} ${icon ? 'pl-9' : 'px-3'} ${className}`
          }
          {...rest}
        />
      </div>
      {error && <p className="mt-1 text-2xs text-danger">{error}</p>}
    </div>
  );
});
