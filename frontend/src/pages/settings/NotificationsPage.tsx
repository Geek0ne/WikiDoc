import { useT } from '../../i18n';
import { PlaceholderBlock } from './PlaceholderBlock';

/** 通知设置占位（下一批次：渠道管理 + 个人订阅矩阵） */
export default function NotificationsPage() {
  const { t } = useT();
  return <PlaceholderBlock title={t('settings.notifications')} />;
}
