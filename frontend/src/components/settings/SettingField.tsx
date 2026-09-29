import type { ReactNode } from 'react';

/** 设置表单的统一字段排布：label + 控件 + 说明 */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-2xs font-medium text-fg-secondary">{label}</span>
      {children}
      {hint && <span className="block text-2xs leading-relaxed text-fg-muted">{hint}</span>}
    </label>
  );
}

/** 掩码语义：后端回显 *** 表示已保存密钥，原样传回则服务端跳过不覆盖 */
export const SECRET_MASK = '***';

export function isMasked(value: string | undefined): boolean {
  return value === SECRET_MASK;
}

/** 站点设置通用的保存/重置操作条 */
export function FormActions({
  dirty,
  saving,
  onSave,
  onCancel,
  saveLabel,
  cancelLabel,
}: {
  dirty: boolean;
  saving: boolean;
  onSave(): void;
  onCancel(): void;
  saveLabel: string;
  cancelLabel: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2 pt-2">
      {dirty && (
        <button type="button" onClick={onCancel} className="text-2xs text-fg-muted transition-colors duration-150 hover:text-fg">
          {cancelLabel}
        </button>
      )}
      <button
        type="button"
        disabled={!dirty || saving}
        onClick={onSave}
        className="rounded bg-primary px-3 py-1.5 text-2xs font-medium text-primary-fg transition-[background-color,filter] duration-150 hover:brightness-95 disabled:opacity-40 disabled:pointer-events-none"
      >
        {saving ? '…' : saveLabel}
      </button>
    </div>
  );
}
