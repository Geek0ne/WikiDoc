import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string | null;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, className = '', id, rows = 3, ...rest },
  ref
) {
  const autoId = useId();
  const areaId = id ?? autoId;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={areaId} className="mb-1.5 block text-2xs font-medium text-fg-secondary">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={areaId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        className={
          `w-full rounded border bg-elevated px-3 py-2 text-sm text-fg placeholder:text-fg-muted ` +
          `transition-[border-color,box-shadow] duration-150 ease-out ` +
          `focus:outline-none focus:border-primary focus:shadow-[var(--focus-ring)] ` +
          `disabled:cursor-not-allowed disabled:opacity-60 ` +
          `${error ? 'border-danger' : 'border-line'} ${className}`
        }
        {...rest}
      />
      {error && <p className="mt-1 text-2xs text-danger">{error}</p>}
    </div>
  );
});
