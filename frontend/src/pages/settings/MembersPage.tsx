import { useT } from '../../i18n';
import { PlaceholderBlock } from './PlaceholderBlock';

/** 成员管理占位（下一批次：用户列表 / 创建 / 停用 / 分组） */
export default function MembersPage() {
  const { t } = useT();
  return <PlaceholderBlock title={t('settings.members')} />;
}
