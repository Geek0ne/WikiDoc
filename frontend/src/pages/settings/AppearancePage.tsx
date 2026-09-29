import { useT } from '../../i18n';
import { PlaceholderBlock } from './PlaceholderBlock';

/** 外观设置占位（下一批次：主题模式 / 强调色 / 语言表单） */
export default function AppearancePage() {
  const { t } = useT();
  return <PlaceholderBlock title={t('settings.appearance')} />;
}
