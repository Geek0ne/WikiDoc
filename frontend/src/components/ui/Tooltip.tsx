import type { ReactNode } from 'react';

export interface TooltipProps {
  content: string;
  children: ReactNode;
  placement?: 'top' | 'bottom';
}

/** 纯 CSS 悬停提示（kbd 用户请以 aria-label 获取同等信息） */
export function Tooltip({ content, children, placement = 'top' }: TooltipProps) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={
          `pointer-events-none absolute left-1/2 z-tooltip -translate-x-1/2 whitespace-nowrap rounded border border-line bg-elevated px-2 py-1 text-2xs text-fg shadow-overlay ` +
          `opacity-0 transition-opacity duration-150 group-hover/tt:opacity-100 ` +
          (placement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5')
        }
      >
        {content}
      </span>
    </span>
  );
}
