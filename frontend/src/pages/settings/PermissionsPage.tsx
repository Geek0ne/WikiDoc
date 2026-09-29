import { useT } from '../../i18n';
import { PlaceholderBlock } from './PlaceholderBlock';

/** 权限治理占位（下一批次：权限重算 / 站点统计） */
export default function PermissionsPage() {
  const { t } = useT();
  return <PlaceholderBlock title={t('settings.permissions')} />;
}
