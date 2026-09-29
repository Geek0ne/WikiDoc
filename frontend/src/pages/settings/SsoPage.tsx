import { useT } from '../../i18n';
import { PlaceholderBlock } from './PlaceholderBlock';

/** 单点登录配置占位（下一批次：OIDC Issuer/ClientId 配置表单） */
export default function SsoPage() {
  const { t } = useT();
  return <PlaceholderBlock title={t('settings.sso')} />;
}
