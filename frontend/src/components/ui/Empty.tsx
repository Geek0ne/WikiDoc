import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export interface EmptyProps {
  icon?: ReactNode;
  title: string;
  hint?: string;
  /** 可选的主动作按钮 */
  action?: ReactNode;
}

export function Empty({ icon, title, hint, action }: EmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-hover text-fg-muted">
        {icon ?? <Inbox size={22} aria-hidden />}
      </div>
      <p className="mt-1 text-sm font-medium text-fg">{title}</p>
      {hint && <p className="max-w-xs text-2xs leading-relaxed text-fg-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
