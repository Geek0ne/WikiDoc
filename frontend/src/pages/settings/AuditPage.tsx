import { useT } from '../../i18n';
import { PlaceholderBlock } from './PlaceholderBlock';

/** 审计日志占位（下一批次：日志列表 / 动作筛选 / 关键词检索） */
export default function AuditPage() {
  const { t } = useT();
  return <PlaceholderBlock title={t('settings.audit')} />;
}
