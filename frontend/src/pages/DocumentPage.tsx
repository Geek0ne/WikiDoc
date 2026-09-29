import { Link, useParams } from 'react-router-dom';
import { useT } from '../i18n';
import { DocumentView } from '../components/space/DocumentView';
import { Empty } from '../components/ui';

/**
 * 独立文档页（无文档树侧栏）。
 * 主流程经空间页 /s/:key/d/:docId 进入（树可见）；本页用于直接访问与回退场景。
 */
export default function DocumentPage() {
  const { t } = useT();
  const { key = '', docId: docIdParam } = useParams();
  const docId = docIdParam ? Number(docIdParam) : null;

  if (!docId || !Number.isFinite(docId)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty title={t('doc.notFound')} action={<Link to="/" className="text-sm text-primary hover:underline">{t('nav.home')}</Link>} />
      </div>
    );
  }

  return (
    <DocumentView
      docId={docId}
      spaceKey={key}
      onDeleted={() => window.history.back()}
    />
  );
}
