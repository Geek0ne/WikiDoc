import { useT } from '../../i18n';
import { PlaceholderBlock } from './PlaceholderBlock';

/** LDAP 域配置占位（下一批次：连接配置表单 + 连接测试） */
export default function LdapPage() {
  const { t } = useT();
  return <PlaceholderBlock title={t('settings.ldap')} />;
}
