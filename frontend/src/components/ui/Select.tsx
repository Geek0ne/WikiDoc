import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  options: SelectOption[];
  error?: string | null;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, error, className = '', id, ...rest },
  ref
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="mb-1.5 block text-2xs font-medium text-fg-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={
            `h-9 w-full appearance-none rounded border bg-elevated pl-3 pr-8 text-sm text-fg ` +
            `transition-[border-color,box-shadow] duration-150 ease-out cursor-pointer ` +
            `focus:outline-none focus:border-primary focus:shadow-[var(--focus-ring)] ` +
            `disabled:cursor-not-allowed disabled:opacity-60 ` +
            `${error ? 'border-danger' : 'border-line'} ${className}`
          }
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          aria-hidden
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted"
        />
      </div>
      {error && <p className="mt-1 text-2xs text-danger">{error}</p>}
    </div>
  );
});
