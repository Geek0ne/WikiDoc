import { useT } from '../../i18n';
import { PlaceholderBlock } from './PlaceholderBlock';

/** 用户组管理占位（下一批次：组列表 / 成员维护 / LDAP 同步） */
export default function GroupsPage() {
  const { t } = useT();
  return <PlaceholderBlock title={t('settings.groups')} />;
}
