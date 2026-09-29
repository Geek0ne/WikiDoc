export function Spinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="loading"
      className={`inline-block animate-spin rounded-full border-2 border-line border-t-primary ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** 页面级全屏加载 */
export function FullScreenSpinner({ label }: { label?: string }) {
  return (
    <div className="flex h-screen min-h-full w-full flex-col items-center justify-center gap-3 bg-bg">
      <Spinner size={26} />
      {label && <p className="text-sm text-fg-muted">{label}</p>}
    </div>
  );
}
