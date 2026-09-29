import { useT } from '../../i18n';

/** 设置模块通用占位块：图标 + 标题 + 说明 */
export function PlaceholderBlock({ title }: { title: string }) {
  const { t } = useT();
  return (
    <div className="rounded-lg border border-dashed border-line bg-elevated px-6 py-14 text-center">
      <h1 className="text-base font-semibold">{title}</h1>
      <p className="mt-1.5 text-2xs leading-relaxed text-fg-muted">{t('settings.comingSoon')}</p>
    </div>
  );
}
