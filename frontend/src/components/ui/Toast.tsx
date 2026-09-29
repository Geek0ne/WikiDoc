import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';
import { useToastStore, type ToastKind } from '../../stores/toast';

const icons: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const toneText: Record<ToastKind, string> = {
  success: 'text-success',
  error: 'text-danger',
  info: 'text-primary',
  warning: 'text-warning',
};

/** 全局 Toast 渲染层（挂在 App 根部，数据来自 toast store） */
export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (!toasts.length) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 left-1/2 z-toast flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4"
    >
      {toasts.map((item) => {
        const Icon = icons[item.kind];
        return (
          <div
            key={item.id}
            className="pointer-events-auto flex w-full items-start gap-2.5 rounded-lg border border-line bg-elevated px-3.5 py-2.5 shadow-overlay animate-slideIn"
          >
            <Icon size={16} aria-hidden className={`mt-0.5 shrink-0 ${toneText[item.kind]}`} />
            <p className="flex-1 break-all text-sm leading-snug">{item.message}</p>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="close"
              className="shrink-0 rounded p-0.5 text-fg-muted transition-colors duration-150 hover:text-fg"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
