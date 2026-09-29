import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from 'react';

export interface DropdownProps {
  /** 触发器渲染函数（拿到展开态便于高亮） */
  trigger: (open: boolean) => ReactNode;
  children: ReactNode;
  /** 面板对齐方向 */
  align?: 'left' | 'right';
  panelClassName?: string;
}

/** 点击展开的下拉面板：点击外部或 Esc 关闭 */
export function Dropdown({ trigger, children, align = 'left', panelClassName = '' }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: globalThis.MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (e: ReactMouseEvent): void => {
    e.stopPropagation();
    setOpen((v) => !v);
  };

  return (
    <div className="relative" ref={rootRef}>
      <div onClick={toggle}>{trigger(open)}</div>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className={`absolute z-dropdown mt-1.5 min-w-40 rounded-lg border border-line bg-elevated py-1 shadow-overlay animate-fadeIn ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${panelClassName}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export interface DropdownItemProps {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function DropdownItem({ icon, children, onClick, danger, disabled }: DropdownItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        `flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors duration-150 ` +
        `disabled:cursor-not-allowed disabled:opacity-50 ` +
        `${danger ? 'text-danger hover:bg-danger-soft' : 'text-fg hover:bg-hover'}`
      }
    >
      {icon && <span className="shrink-0 text-fg-muted">{icon}</span>}
      {children}
    </button>
  );
}

export function DropdownDivider() {
  return <div className="my-1 border-t border-line" />;
}
