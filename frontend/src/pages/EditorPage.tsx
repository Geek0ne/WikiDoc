import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { useT } from '../i18n';
import { Button, Empty } from '../components/ui';

/**
 * 编辑器占位页。下一批次接入 CodeMirror 6 源码编辑器
 * （依赖已预装：@codemirror/* + @lezer/highlight）。
 */
export default function EditorPage() {
  const { t } = useT();
  const { key = '', docId } = useParams();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <Link to={`/s/${key}/d/${docId ?? ''}`} className="flex items-center gap-1 text-2xs text-fg-muted transition-colors duration-150 hover:text-fg">
          <ArrowLeft size={13} aria-hidden />
          {t('doc.backToSpace')}
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <Empty
          icon={<FileText size={22} aria-hidden />}
          title={t('settings.comingSoon')}
          hint={`CodeMirror 6 · #${docId ?? '?'}`}
          action={
            <Link to={`/s/${key}/d/${docId ?? ''}`}>
              <Button variant="secondary">{t('common.back')}</Button>
            </Link>
          }
        />
      </div>
    </div>
  );
}
