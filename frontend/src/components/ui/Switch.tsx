export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

export function Switch({ checked, onChange, disabled, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={
        `relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 ` +
        `focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none ` +
        `disabled:cursor-not-allowed disabled:opacity-50 ` +
        (checked ? 'bg-primary' : 'bg-border-strong')
      }
      {...rest}
    >
      <span
        className={
          `inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-150 ` +
          (checked ? 'translate-x-[19px]' : 'translate-x-[3px]')
        }
      />
    </button>
  );
}
